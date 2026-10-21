/**
 * Runs a k6 script against the CareSaath API inside the grafana/k6 container.
 *
 *   node load/k6/run.mjs search.js
 *   node load/k6/run.mjs mixed.js --out json=/tmp/mixed.json
 *
 * The API is reached through host.docker.internal (the host machine). On
 * Linux that name has to be mapped explicitly, which is what the --add-host
 * flag below does; Docker Desktop provides it out of the box.
 *
 * Environment:
 *   BASE_URL   API base URL (default http://host.docker.internal:3000)
 *   PROFILE    VU profile: smoke | standard | spike | soak (default standard)
 *   K6_IMAGE   container image to use (default grafana/k6:latest)
 */
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const script = process.argv[2] || 'search.js';
const extraArgs = process.argv.slice(3);

const BASE_URL = process.env['BASE_URL'] || 'http://host.docker.internal:3000';
const PROFILE = process.env['PROFILE'] || 'standard';
const K6_IMAGE = process.env['K6_IMAGE'] || 'grafana/k6:latest';

const FORWARDED = ['SEARCH_P95_MS', 'WRITE_P95_MS', 'MAX_ERROR_RATE'];

const args = ['run', '--rm', '-i', '-v', `${resolve(import.meta.dirname)}:/scripts`];

if (process.platform === 'linux') {
  args.push('--add-host', 'host.docker.internal:host-gateway');
}

args.push('-e', `BASE_URL=${BASE_URL}`, '-e', `PROFILE=${PROFILE}`);
for (const name of FORWARDED) {
  if (process.env[name] !== undefined) {
    args.push('-e', `${name}=${process.env[name]}`);
  }
}

args.push(K6_IMAGE, 'run', `/scripts/${script}`, ...extraArgs);

console.log(`k6 ${script} (profile "${PROFILE}") against ${BASE_URL}`);

const child = spawn('docker', args, { stdio: 'inherit' });
child.on('error', (error) => {
  console.error(`Could not start Docker: ${error.message}`);
  process.exit(1);
});
child.on('exit', (code) => {
  process.exit(code ?? 1);
});
