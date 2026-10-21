import { createServer, request as httpRequest } from 'node:http';
import type { IncomingHttpHeaders, IncomingMessage, Server, ServerResponse } from 'node:http';
import { once } from 'node:events';
import type { NetworkProfile } from './network-profile.js';

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Headers the proxy strips before forwarding upstream. */
const STRIPPED_REQUEST_HEADERS = new Set(['host', 'connection', 'keep-alive', 'proxy-connection']);
/** Headers the proxy strips before answering the client. */
const STRIPPED_RESPONSE_HEADERS = new Set(['connection', 'keep-alive', 'transfer-encoding']);

export interface ThrottledProxy {
  /** Base URL of the proxy, e.g. `http://127.0.0.1:41234`. */
  readonly baseUrl: string;
  /** The emulated link. */
  readonly profile: NetworkProfile;
  /** Total number of requests the proxy has handled. */
  readonly requestCount: number;
  /** Total body bytes written to clients (wire bytes, post-compression). */
  readonly bytesSent: number;
  close: () => Promise<void>;
}

interface UpstreamResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

/**
 * A local reverse proxy that sits between the test client and the API and
 * emulates a mobile connection: it adds the profile's round-trip latency and
 * paces the response body at the profile's download bandwidth.
 *
 * The proxy buffers each upstream response before replaying it so the body
 * can be paced chunk by chunk. Search payloads are a few kilobytes, so the
 * buffering cost is irrelevant next to the link emulation itself.
 *
 * Every response carries diagnostic headers:
 *  - `x-network-profile`     the emulated profile name
 *  - `x-network-bytes`       bytes written on the wire (compressed size)
 *  - `x-network-transfer-ms` time the link needs to carry those bytes
 *  - `x-network-upstream-ms` time the API spent handling the request
 */
export async function startThrottledProxy(
  targetBaseUrl: string,
  profile: NetworkProfile,
): Promise<ThrottledProxy> {
  const target = new URL(targetBaseUrl);
  let requestCount = 0;
  let bytesSent = 0;

  const server: Server = createServer((req, res) => {
    void handleRequest(req, res);
  });

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    requestCount += 1;
    try {
      const requestBody = await readBody(req);

      // Half of the round trip is spent reaching the server.
      await sleep(profile.latencyMs / 2);

      const upstreamStarted = performance.now();
      const upstream = await forward(target, req, requestBody);
      const upstreamMs = performance.now() - upstreamStarted;

      // The other half is spent carrying the response back.
      await sleep(profile.latencyMs / 2);

      const headers: Record<string, string | string[]> = {};
      for (const [name, value] of Object.entries(upstream.headers)) {
        if (value === undefined) continue;
        if (STRIPPED_RESPONSE_HEADERS.has(name.toLowerCase())) continue;
        headers[name] = value;
      }

      // The headers have to be flushed before the body, so the diagnostics are
      // computed up front: the byte count is known, and the transfer time is
      // the time the link needs to carry that many bytes.
      const plannedTransferMs = (upstream.body.length / profile.downloadBytesPerSecond) * 1000;
      headers['x-network-profile'] = profile.name;
      headers['x-network-bytes'] = String(upstream.body.length);
      headers['x-network-transfer-ms'] = plannedTransferMs.toFixed(1);
      headers['x-network-upstream-ms'] = upstreamMs.toFixed(1);
      res.writeHead(upstream.status, headers);

      const transferred = await writeThrottled(res, upstream.body, profile.downloadBytesPerSecond);
      bytesSent += transferred;
      res.end();
    } catch (error) {
      if (!res.headersSent) {
        res.writeHead(502, { 'content-type': 'application/json' });
      }
      res.end(
        JSON.stringify({
          statusCode: 502,
          message: 'Throttled proxy failed to reach the upstream server',
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Throttled proxy did not bind to a TCP port');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    profile,
    get requestCount() {
      return requestCount;
    },
    get bytesSent() {
      return bytesSent;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function forward(target: URL, req: IncomingMessage, body: Buffer): Promise<UpstreamResponse> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string | string[]> = {};
    for (const [name, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      if (STRIPPED_REQUEST_HEADERS.has(name.toLowerCase())) continue;
      headers[name] = value;
    }

    const upstream = httpRequest(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        path: req.url,
        method: req.method,
        headers,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 502,
            headers: response.headers,
            body: Buffer.concat(chunks),
          }),
        );
        response.on('error', reject);
      },
    );

    upstream.on('error', reject);
    if (body.length > 0) {
      upstream.write(body);
    }
    upstream.end();
  });
}

/**
 * Writes the body to the client at the profile's download bandwidth and
 * returns the number of bytes written. Chunks are sized for ~50 ms of
 * transmission each so the pacing stays smooth without spinning.
 */
async function writeThrottled(
  res: ServerResponse,
  body: Buffer,
  bytesPerSecond: number,
): Promise<number> {
  if (body.length === 0) {
    return 0;
  }
  const chunkSize = Math.max(512, Math.floor(bytesPerSecond / 20));
  const started = performance.now();
  let offset = 0;
  let written = 0;

  while (offset < body.length) {
    const chunk = body.subarray(offset, Math.min(offset + chunkSize, body.length));
    offset += chunk.length;
    written += chunk.length;

    const dueAt = started + (offset / bytesPerSecond) * 1000;
    const waitMs = dueAt - performance.now();
    if (waitMs > 0) {
      await sleep(waitMs);
    }
    if (!res.write(chunk)) {
      await once(res, 'drain');
    }
  }
  return written;
}
