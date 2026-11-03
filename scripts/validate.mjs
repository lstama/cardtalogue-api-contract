// Validate all API contracts with swagger-parser.
// Usage: node scripts/validate.mjs   (or: npm run validate)
import swaggerParser from '@apidevtools/swagger-parser';
const { validate } = swaggerParser;
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const contracts = ['backend.yaml', 'scanner.yaml'];

let failed = false;
for (const name of contracts) {
  const path = join(__dirname, '..', 'contracts', name);
  try {
    const api = await validate(path, {
      bundle: false,
      validate: {
        schema: true,
        'no-unused-schemas': true,
      },
    });
    const paths = Object.keys(api.paths).length;
    const schemas = api.components?.schemas
      ? Object.keys(api.components.schemas).length
      : 0;
    console.log(`✓ ${name}: valid OpenAPI (${paths} paths, ${schemas} schemas)`);
  } catch (err) {
    failed = true;
    console.error(`✗ ${name}: ${err.message}`);
    for (const diag of err.errors ?? []) {
      console.error(`    - ${diag.instance ?? ''}: ${diag.message}`);
    }
  }
}

if (failed) {
  console.error('\nValidation FAILED');
  process.exit(1);
}
console.log('\nAll contracts valid.');
