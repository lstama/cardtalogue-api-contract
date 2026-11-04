# Cardtalogue API Contract

Contract-first API workflow for the Cardtalogue stack. The OpenAPI specs in
[`contracts/`](contracts/) are the single source of truth for the two HTTP
boundaries of the system:

| Contract | Boundary | File |
| --- | --- | --- |
| Backend API | frontend (React/TS) → backend (Go/Gin) | [`contracts/backend.yaml`](contracts/backend.yaml) |
| Scanner API | backend (Go/Gin) → scanner (Python/Flask) | [`contracts/scanner.yaml`](contracts/scanner.yaml) |

## How to run

```bash
npm install
make mock        # Prism mock servers: backend on :8080, scanner on :5000
```

Use the mocks to prototype and test consumers before the real services exist.

## How to contribute

Changing the shared contract is a coordinated change — see [CONTRIBUTING.md](CONTRIBUTING.md).
In short: edit both specs, run `make verify-contract` (validate + lint + orphan-call guardrail +
breaking-change check), and only merge when `make generate` produces no downstream diff.

## Layout

```
cardtalogue-api-contract/
├── contracts/            # hand-maintained OpenAPI 3.1 specs (source of truth)
│   ├── backend.yaml      #   52 operations (51 under /api/v1 + /health)
│   └── scanner.yaml      #   scanner HTTP surface (recognize + health/info/metrics)
├── gen/                  # generated code (git-ignored; `make generate`)
│   ├── go/               #   oapi-codegen v2: types + Gin handlers
│   ├── ts/               #   openapi-typescript: TS client types
│   └── py/               #   openapi-python-client: scanner client
├── scripts/
│   ├── validate.mjs      # validate both specs (swagger-parser)
│   ├── bundle.mjs        # bundle specs into dist/ (inlines $refs)
│   └── check-orphan-calls.mjs   # guardrail: no orphan frontend/backend calls
├── .spectral.yaml        # lint ruleset (operationId/summary/description/examples/tags)
├── Makefile              # lint / bundle / breaking-check / mock / docs / generate
├── CONTRACT_VERSION      # pinned version; consumers vendor this tag
├── CHANGELOG.md
```

## Definition of done (Phase 2)

- Every operation has an `operationId`, `summary`, `description`, and `tags`.
- Every schema/property has a `description`; key schemas have `examples`.
- A single shared `ErrorResponse` schema is referenced by all error responses.
- Shared pagination params (`Limit`, `Offset`) and response wrappers are reusable.
- Auth is declared via a `bearerAuth` security scheme.
- Lints clean (`make lint`), bundles (`make bundle`), and passes the breaking-change
  check (`make breaking-check`).
- `make generate` produces code with no downstream diff (consumers build with it).
- No runtime behavior changes to any existing service.

## Commands

```bash
npm install          # dev deps that run in this repo (swagger-parser, js-yaml)

npm run validate     # validate both specs
npm run bundle       # bundle specs into dist/
npm run check        # orphan-call guardrail (frontend + backend->scanner)
make verify-contract # validate + lint + check-orphan-calls + breaking-check
make lint            # Spectral
make bundle          # single-file dist/
make breaking-check  # oasdiff vs last git tag
make mock            # Prism mock servers (:8080 backend, :5000 scanner)
make docs            # Redocly docs in dist/
make generate        # Go (oapi-codegen v2) + TS (openapi-typescript) + py
make install-py-gen  # create .venv-gen and install openapi-python-client (Arch PEP 668)
make sync-contract   # vendor CONTRACT_VERSION into each consumer repo
```

> In this sandbox only the npm-based targets (`validate`, `bundle`, `check`) run;
> the rest require tools installed in a normal environment (see the Makefile header).

## Contract distribution

Each consumer pins a `CONTRACT_VERSION` tag. `make sync-contract` checks out that
tag into a vendored copy inside each consumer repo. Local override:

```bash
CONTRACT_PATH=../cardtalogue-api-contract make generate
```

## Guardrail: orphan calls

`scripts/check-orphan-calls.mjs` is the core enforcement. It discovers:

1. **Frontend → backend** calls (from `cardtalogue-frontend/src/services/api.ts`)
   and asserts each is defined in `contracts/backend.yaml`.
2. **Backend → scanner** calls (from `cardtalogue-backend/internal/service/*.go`,
   tracing `http.NewRequest` vars through the constructor to config) and asserts
   each is defined in `contracts/scanner.yaml`.

Extra endpoints in a contract are fine (a contract may document more than a
consumer adopts). The hard requirement is **no orphan calls**: every call that
happens must be covered by a contract.

```
$ npm run check
[1] Orphan frontend calls (frontend -> backend):
  ✓ GET /api/v1/auth/login
  ...
  ✓ all frontend calls are covered by the backend contract
[2] Orphan backend -> scanner calls:
  ✓ POST /api/recognize
  ✓ all backend -> scanner calls are covered by the scanner contract
✓ No orphan API calls. Contract covers every call.
```
