// Bundle the contracts into a single self-contained OpenAPI document.
// Usage: node scripts/bundle.mjs   (or: make bundle)
//
// Produces dist/backend.yaml and dist/scanner.yaml with all $refs inlined, so
// consumers and mock servers can run against one file each.
import swaggerParser from '@apidevtools/swagger-parser';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
import { mkdirSync, writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const contracts = [
  { name: 'backend.yaml', out: 'backend.yaml' },
  { name: 'scanner.yaml', out: 'scanner.yaml' },
];

for (const c of contracts) {
  const input = join(root, 'contracts', c.name);
  const out = join(root, 'dist', c.out);
  const api = await swaggerParser.bundle(input);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, yaml.dump(api));
  console.log(`bundled ${c.name} -> dist/${c.out} (${api.info.version})`);
}
