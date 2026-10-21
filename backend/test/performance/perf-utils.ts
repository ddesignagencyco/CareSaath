export interface LatencySummary {
  count: number;
  min: number;
  p50: number;
  p95: number;
  max: number;
  mean: number;
}

/**
 * Linear-interpolated percentile over a copy of the samples. `p` is in the
 * 0..100 range.
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) {
    return sorted[low];
  }
  return sorted[low] + (sorted[high] - sorted[low]) * (rank - low);
}

export function summarize(values: number[]): LatencySummary {
  if (values.length === 0) {
    return { count: 0, min: 0, p50: 0, p95: 0, max: 0, mean: 0 };
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    count: values.length,
    min: Math.min(...values),
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    max: Math.max(...values),
    mean: total / values.length,
  };
}

export interface RequestMeasurement {
  /** Wall-clock time of the whole request as seen by the client. */
  totalMs: number;
  /** Bytes on the wire, as reported by the throttling proxy. */
  wireBytes: number;
  /** Bytes after decompression, as seen by the client. */
  payloadBytes: number;
  /** Time the API spent handling the request. */
  upstreamMs: number;
  /** Time spent transferring the body over the emulated link. */
  transferMs: number;
  status: number;
  /** Parsed JSON body, when the response is JSON. */
  body: unknown;
}

/** Performs a GET and measures it end to end, including the emulated link. */
export async function measureGet(url: string, acceptEncoding?: string): Promise<RequestMeasurement> {
  const started = performance.now();
  const response = await fetch(url, {
    headers: acceptEncoding ? { accept: 'application/json', 'accept-encoding': acceptEncoding } : { accept: 'application/json' },
  });
  const text = await response.text();
  const totalMs = performance.now() - started;

  let body: unknown = null;
  try {
    body = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  const wireBytes = Number(response.headers.get('x-network-bytes') ?? '0');
  const upstreamMs = Number(response.headers.get('x-network-upstream-ms') ?? '0');
  const transferMs = Number(response.headers.get('x-network-transfer-ms') ?? '0');

  return {
    totalMs,
    wireBytes: Number.isFinite(wireBytes) ? wireBytes : 0,
    payloadBytes: Buffer.byteLength(text, 'utf8'),
    upstreamMs: Number.isFinite(upstreamMs) ? upstreamMs : 0,
    transferMs: Number.isFinite(transferMs) ? transferMs : 0,
    status: response.status,
    body,
  };
}

export function formatMs(value: number): string {
  return `${value.toFixed(0)} ms`;
}

export function formatKb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/** Renders a labelled summary block so a perf run prints evidence of itself. */
export function formatSummary(label: string, summary: LatencySummary): string {
  return [
    `${label}`,
    `  samples : ${summary.count}`,
    `  min     : ${formatMs(summary.min)}`,
    `  p50     : ${formatMs(summary.p50)}`,
    `  p95     : ${formatMs(summary.p95)}`,
    `  max     : ${formatMs(summary.max)}`,
    `  mean    : ${formatMs(summary.mean)}`,
  ].join('\n');
}
