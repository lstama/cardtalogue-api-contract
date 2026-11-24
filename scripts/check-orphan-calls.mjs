// Check that there are no orphan API calls:
//   1. Every frontend HTTP call is defined in the backend contract.
//   2. Every backend -> scanner HTTP call is defined in the scanner contract.
//
// Usage: node scripts/check-orphan-calls.mjs
//
// LEGACY / MANUAL ONLY. "No orphan calls" is now enforced by the consumers, each
// against the contract version it pins:
//   cardtalogue-frontend -> scripts/check-contract-calls.mjs (CI)
//   cardtalogue-backend  -> scripts/check-scanner-calls.mjs  (CI)
//
// Known limitations (why it is no longer CI-enforced):
//   - The frontend half only recognises the old axios-era helpers
//     (getList/getOne/searchList/create/update/uploadMedia) and
//     `<client>.get|post|put|delete(...)`. The current openapi-fetch client uses
//     `client.GET|POST|PUT|DELETE|PATCH('/path')`, which this script does not
//     match, so it reports 0 frontend calls and passes vacuously.
//   - It needs the consumer repos next to this one (REPOS=...), which this
//     repo's CI does not check out.
// The backend -> scanner half still works and is useful locally.
//
// The contract must cover every call that actually happens. Extra endpoints in
// the contract (backend routes the frontend never calls, scanner endpoints the
// backend never calls) are fine.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const REPOS = process.env.REPOS
  ? process.env.REPOS.split(':')
  : [resolve(root, '../cardtalogue-frontend'), resolve(root, '../cardtalogue-backend')];
const FRONTEND_API = join(REPOS[0], 'src/services/api.ts');
const BACKEND_SERVICES = join(REPOS[1], 'internal/service');
const BACKEND_ENV = join(REPOS[1], '.env');

let failures = 0;
const fail = (msg) => {
  failures++;
  console.error('  \u2717 ' + msg);
};
const ok = (msg) => console.log('  \u2713 ' + msg);

// ---- path normalization -----------------------------------------------------
// `/cards/${id}` -> `/cards/{id}` ; strip query string.
function normPath(p) {
  return p.replace(/\$\{[^}]+\}/g, '{id}').split('?')[0].replace(/\/+$/, '') || '/';
}

// ---- 1. frontend calls ------------------------------------------------------
const frontendSrc = readFileSync(FRONTEND_API, 'utf8');
const helperMethod = {
  getList: 'GET',
  getOne: 'GET',
  searchList: 'GET',
  create: 'POST',
  update: 'PUT',
  uploadMedia: 'POST',
};
const frontendCalls = new Set();

// helper(client, 'path', ...) — path is the 2nd string argument.
const helperRe =
  /(?:getList|getOne|searchList|create|update|uploadMedia)\(\s*[^,]+,\s*(['"`])((?:[^'"`]|\\.)*)\1/g;
let hm;
while ((hm = helperRe.exec(frontendSrc)) !== null) {
  const fn = frontendSrc.slice(hm.index, hm.index + 40).match(/^(\w+)/)[1];
  frontendCalls.add(`${helperMethod[fn]} ${normPath(hm[2])}`);
}
// direct client.get/post/put/delete('path')
const directRe =
  /(?:authApiClient|publicApiClient|privateApiClient)\.(get|post|put|delete)\(\s*(['"`])((?:[^'"`]|\\.)*)\2/g;
let dm;
while ((dm = directRe.exec(frontendSrc)) !== null) frontendCalls.add(`${dm[1].toUpperCase()} ${normPath(dm[3])}`);

console.log('Frontend HTTP calls discovered:', frontendCalls.size);
for (const c of [...frontendCalls].sort()) console.log('    ' + c);

// ---- 2. backend contract paths ---------------------------------------------
const backendContract = yaml.load(readFileSync(join(root, 'contracts/backend.yaml'), 'utf8'));
const backendPaths = new Set();
for (const [path, methods] of Object.entries(backendContract.paths ?? {})) {
  for (const [method] of Object.entries(methods)) {
    if (method.startsWith('x-')) continue;
    backendPaths.add(`${method.toUpperCase()} ${path}`);
  }
}

console.log('\n[1] Orphan frontend calls (frontend -> backend):');
let orphanFrontend = 0;
for (const call of [...frontendCalls].sort()) {
  const [method, path] = call.split(' ', 2);
  const norm = normPath(path);
  const inContract = [...backendPaths].some((c) => {
    const [cm, cp] = c.split(' ', 2);
    if (cm !== method) return false;
    const cpReg = cp.replace(/\/+$/, '').replace(/\{[^}]+\}/g, '[^/]+');
    const callReg = norm.replace(/\/+$/, '').replace(/\{[^}]+\}/g, '[^/]+');
    return cpReg === callReg;
  });
  if (inContract) ok(`${method} ${path}`);
  else {
    fail(`${method} ${path}  -- not defined in backend.yaml`);
    orphanFrontend++;
  }
}
if (orphanFrontend === 0) ok('all frontend calls are covered by the backend contract');
else console.log(`  ${orphanFrontend} orphan frontend call(s)`);

// ---- 3. backend -> scanner calls -------------------------------------------
// Find http.NewRequest("METHOD", <expr>, ...) in backend service files, then
// resolve <expr> (e.g. s.apiURL) back to a concrete URL via the config default
// / .env, tracing through the constructor and call site.
const env = readFileSync(BACKEND_ENV, 'utf8');
const envMap = {};
for (const line of env.split('\n')) {
  const mm = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (mm) envMap[mm[1]] = mm[2];
}
const configSrc = readFileSync(join(REPOS[1], 'internal/config/config.go'), 'utf8');

const serviceFiles = readdirSync(BACKEND_SERVICES).filter((f) => f.endsWith('.go') && !f.endsWith('_test.go'));
const serviceSrc = serviceFiles.map((f) => readFileSync(join(BACKEND_SERVICES, f), 'utf8')).join('\n');
const mainSrc = readFileSync(join(REPOS[1], 'cmd/api/main.go'), 'utf8');
const allSrc = serviceSrc + '\n' + mainSrc;

function resolveArg(arg) {
  // config.X / cfg.X -> config.go getEnv default or .env value
  const cfgMatch = arg.match(/(?:config|cfg)\.([A-Za-z0-9_]+)/);
  if (cfgMatch) {
    const cfgField = cfgMatch[1];
    const cfgRe = new RegExp(cfgField + '\\s*:\\s*getEnv\\(\\s*"([^"]+)"\\s*,\\s*"([^"]+)"\\s*\\)');
    const cfgLitRe = new RegExp(cfgField + '\\s*:\\s*"([^"]+)"');
    const gc = configSrc.match(cfgRe);
    if (gc) return envMap[gc[1]] || gc[2];
    const gl = configSrc.match(cfgLitRe);
    if (gl) return gl[1];
    return null;
  }
  // bare var assigned from getEnv or a literal
  const assignRe = new RegExp('\\b' + arg + '\\s*=\\s*getEnv\\(\\s*"([^"]+)"\\s*,\\s*"([^"]+)"\\s*\\)');
  const am = allSrc.match(assignRe);
  if (am) return envMap[am[1]] || am[2];
  const litRe = new RegExp('\\b' + arg + '\\s*=\\s*"([^"]+)"');
  const lm = allSrc.match(litRe);
  if (lm) return lm[1];
  return null;
}

function resolveUrlVar(expr) {
  const field = expr.split('.').pop(); // s.apiURL -> apiURL
  // 1. constructor that assigns this field: NewX(...) ReturnType { ... apiURL ... }
  const ctorFieldRe = new RegExp('func\\s+New(\\w+)\\(([^)]*)\\)[^{]*\\{[^}]*\\b' + field + '\\b[^}]*\\}', 's');
  const cm = allSrc.match(ctorFieldRe);
  if (!cm) return null;
  // 2. call sites: NewX(<arg>) — try each until one resolves.
  const callRe = new RegExp('New' + cm[1] + '\\(\\s*([^,)\\s]+)', 'g');
  let mm;
  const args = [];
  while ((mm = callRe.exec(allSrc)) !== null) args.push(mm[1]);
  for (const arg of args) {
    const resolved = resolveArg(arg);
    if (resolved) return resolved;
  }
  return null;
}

const scannerCalls = new Set();
for (const file of serviceFiles) {
  const src = readFileSync(join(BACKEND_SERVICES, file), 'utf8');
  const re = /http\.NewRequest\("([^"]+)",\s*([\w.]+),/g;
  let mm;
  while ((mm = re.exec(src)) !== null) {
    const method = mm[1].toUpperCase();
    const url = resolveUrlVar(mm[2]);
    if (!url) continue;
    const path = new URL(url).pathname.replace(/\/+$/, '') || '/';
    scannerCalls.add(`${method} ${path}`);
  }
}

console.log('\nBackend -> scanner HTTP calls discovered:', scannerCalls.size);
for (const c of [...scannerCalls].sort()) console.log('    ' + c);

// ---- 4. scanner contract paths ---------------------------------------------
const scannerContract = yaml.load(readFileSync(join(root, 'contracts/scanner.yaml'), 'utf8'));
const scannerPaths = new Set();
for (const [path, methods] of Object.entries(scannerContract.paths ?? {})) {
  for (const [method] of Object.entries(methods)) {
    if (method.startsWith('x-')) continue;
    scannerPaths.add(`${method.toUpperCase()} ${path}`);
  }
}

console.log('\n[2] Orphan backend -> scanner calls:');
let orphanScanner = 0;
for (const call of [...scannerCalls].sort()) {
  if (scannerPaths.has(call)) ok(call);
  else {
    fail(`${call}  -- not defined in scanner.yaml`);
    orphanScanner++;
  }
}
if (orphanScanner === 0) ok('all backend -> scanner calls are covered by the scanner contract');
else console.log(`  ${orphanScanner} orphan backend -> scanner call(s)`);

// ---- summary ----------------------------------------------------------------
console.log('\n' + '='.repeat(50));
if (failures === 0) {
  ok('No orphan API calls. Contract covers every call.');
  process.exit(0);
} else {
  console.error(`${failures} orphan call(s) found. Update the contract(s).`);
  process.exit(1);
}
