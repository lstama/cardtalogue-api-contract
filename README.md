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
In short: edit both specs, run `make verify-contract` (validate + lint + breaking-change check),
and only merge when `make generate` produces no downstream diff.
"No orphan calls" is enforced by the **consumers** against the pinned version — see
[No orphan calls: enforced by the consumers](#no-orphan-calls-enforced-by-the-consumers).

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
│   └── check-orphan-calls.mjs   # legacy manual check (NOT CI-enforced; see below)
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
npm run check        # legacy manual orphan check (blind to openapi-fetch client.*)
make verify-contract # validate + lint + breaking-check (manual local gate)
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

## No orphan calls: enforced by the consumers

The hard rule is unchanged — **every call that actually happens must be covered
by a contract**; extra endpoints in a contract are fine. What changed is *where*
it is enforced.

**Why not here:** the contract repo cannot see the consumer code. This repo's CI
has no `cardtalogue-frontend` / `cardtalogue-backend` checkouts, so any check
that reads consumer sources can only fail with `ENOENT` (or pass vacuously).
Ownership therefore sits with the repos that own the calls, each checking against
the contract version it pins (`CONTRACT_VERSION` → git tag):

| Owner | Workflow | Check |
| --- | --- | --- |
| `cardtalogue-frontend` | `.github/workflows/contract-check.yml` | `scripts/check-contract-calls.mjs` — every openapi-fetch `client.GET/POST/PUT/DELETE/PATCH` and raw `fetch` path in `src/` exists (path **and** method) in the generated `gen/ts/backend.ts` of the pinned contract. Fails if zero calls are discovered. |
| `cardtalogue-backend` | `.github/workflows/contract-check.yml` | `scripts/check-scanner-calls.mjs` — every backend → scanner call (traced from `http.NewRequest*` through the constructor to `CARD_SCAN_API_URL`) exists in the pinned `contracts/scanner.yaml`. Also runs `make sync-contract` + `make verify-contract` and `go test ./...`. |

Both consumers check out this repo at `CONTRACT_REF` (default `v1.1.0`), so a
consumer PR is red until that tag exists — that is the release gate, not a bug.

### Legacy local script

`scripts/check-orphan-calls.mjs` (`npm run check`, or `make check-orphan-calls`)
is kept for manual use only — it is **not** part of `make verify-contract` and
it **is not CI-enforced**. It is also **known to under-detect**: it only
recognises the old `getList/getOne/create/update/...` axios-era helpers and
`authApiClient.get(...)`-style calls, so on today's `openapi-fetch` client it
reports **0 frontend calls** and passes vacuously. Its backend → scanner side
still works and is useful as a quick local sanity check. Do not treat a green
`npm run check` as proof that the consumers are covered — run the consumer
workflows.
