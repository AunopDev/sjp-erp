import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const index = readFileSync(join(here, '..', 'src', 'index.production.html'), 'utf8');
const nginx = readFileSync(join(here, '..', '..', 'deploy', 'nginx', 'sjp-erp.conf'), 'utf8');

const checks = [
  ['production index has CSP meta', /http-equiv="Content-Security-Policy"/.test(index)],
  ['production index allows scripts from self only', /script-src 'self'/.test(index)],
  ['production index has no unsafe-eval', !/unsafe-eval/.test(index)],
  ['theme bootstrap is an external script', /<script src="\/?theme-init\.js"><\/script>/.test(index)],
  ['nginx sets CSP header', /add_header Content-Security-Policy/.test(nginx)],
  ['nginx denies framing', /frame-ancestors 'none'/.test(nginx)],
  ['nginx sets HSTS', /Strict-Transport-Security/.test(nginx)],
  ['nginx proxies /api', /location \/api\//.test(nginx)],
];

let failed = false;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed = true;
}
if (failed) process.exitCode = 1;
