# AGENTS.md — Cardtalogue API Contract

Instructions for agents working in this repo.

## Role of this repo

This repo owns the **contract** (OpenAPI 3.1 specs). It does **not** contain
runtime code. Consumers generate from it:

- `cardtalogue-frontend` (TS) — adopts the subset of `backend.yaml` it calls.
- `cardtalogue-backend` (Go) — adopts `backend.yaml` for types/handlers; its
  calls to the scanner are covered by `scanner.yaml`.
- `cardtalogue-yugioh-scanner` (Python) — its HTTP surface is `scanner.yaml`.

This repo is responsible for the contract's own health only:

- spec validity (`npm run validate`)
- lint (Spectral, `make lint`)
- bundle (`npm run bundle`)
- breaking-change detection vs the last tag (`make breaking-check`)
- generation determinism (`make generate` builds Go/TS/Python cleanly)

CI (`.github/workflows/contract-ci.yml`) runs exactly those steps with pinned
generators. It does **not** enforce "no orphan calls" — see below.

## Golden rules

1. **The contract describes behavior; it does not change it.** Never edit a
   contract to make broken code "pass". Fix the code, or genuinely change the
   behavior, then update the contract.
2. **No orphan calls — enforced by the consumers.** Every frontend→backend and
   backend→scanner call must be covered by a contract, but each consumer checks
   its own calls against the pinned contract in its own CI:
   - `cardtalogue-frontend` → `scripts/check-contract-calls.mjs`
   - `cardtalogue-backend`  → `scripts/check-scanner-calls.mjs`

   Both check out this repo at `CONTRACT_REF` (currently `v1.1.0`, matching
   `CONTRACT_VERSION`), so a consumer PR stays red until that tag exists — that
   is the release gate, not a bug here.
3. **Contract-first.** When adding or changing an endpoint, edit the `.yaml`
   first (operationId, summary, description, request/response schemas, examples,
   tags), validate, then generate.
4. **Backwards compatible.** Breaking changes require a `CONTRACT_VERSION` bump
   and a `CHANGELOG.md` entry. `make breaking-check` enforces this in CI against
   tag `v$(CONTRACT_VERSION)` (it skips cleanly when that tag is absent).
5. **Keep it valid.** `npm run validate` and `make lint` (Spectral) must pass.

## Editing a contract

```bash
# 1. edit contracts/backend.yaml or contracts/scanner.yaml
# 2. validate + lint
npm run validate
make lint
# 3. bundle
npm run bundle
# 4. generate (normal environment); output must match what consumers build
make generate
# 5. bump CONTRACT_VERSION + CHANGELOG.md if breaking
```

Local pre-PR gate: `make verify-contract` (= `validate lint breaking-check`;
deliberately excludes the orphan-call check).

## Adding an endpoint

- Pick a domain tag (auth, cards, games, media, profiles, storages, users,
  scanner).
- Add the path + method with `operationId` (`{verb}{Resource}` e.g.
  `postMediaScan`), `summary`, `description`, `tags`, request body, responses
  (200 + error codes), and at least one `example` on the success response.
- Reuse `#/components/schemas/*` for request/response bodies; don't inline
  duplicate schemas.
- Run the checks above.

## Tooling notes

- npm-based scripts run in the sandbox: `validate`, `bundle`, `check`.
- `lint`, `breaking-check`, `mock`, `docs`, `generate`, `sync-contract` require
  external tools — see the Makefile header.
- Code generation (versions pinned in CI):
  - Go:  `oapi-codegen -package tcgcontract -generate types,gin -o gen/go/backend.gen.go contracts/backend.yaml`
         using `github.com/oapi-codegen/oapi-codegen/v2`, **pinned to `v2.8.2`**
         (`go install github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen@v2.8.2`).
         This is the version that produced the committed backend generated code;
         `cardtalogue-backend` pins the same version.
  - TS:  `npx openapi-typescript contracts/backend.yaml -o gen/ts/backend.ts`
         (resolved from `devDependencies`).
  - Py:  `make install-py-gen` creates a uv venv; then
         `.venv-gen/bin/openapi-python-client generate --path contracts/scanner.yaml --meta uv --output-path gen/py/scanner --overwrite`.
         Arch Linux blocks system pip (PEP 668), so Python gen uses a uv venv.

## Orphan-call script (manual/local only)

- `scripts/check-orphan-calls.mjs` (`npm run check` or `make check-orphan-calls`)
  is **not** run in CI and **not** part of `make verify-contract`. It is kept
  for manual local use only.
- It is **known to under-detect**: it only recognises the old
  `getList/getOne/create/update/...` axios-era helpers and
  `authApiClient.get(...)`-style calls, so on today's openapi-fetch client it
  reports **0 frontend calls** and passes vacuously. Its backend→scanner side
  (tracing `http.NewRequest` vars through the constructor to the config default
  / `.env`, comparing **paths**) still works as a quick sanity check.
- A green `npm run check` is **not** proof that consumers are covered — rely on
  the consumer workflows.
