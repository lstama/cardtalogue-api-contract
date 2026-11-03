# AGENTS.md — Cardtalogue API Contract

Instructions for agents working in this repo.

## Role of this repo

This repo owns the **contract** (OpenAPI 3.1 specs). It does **not** contain
runtime code. Consumers generate from it:

- `cardtalogue-frontend` (TS) — adopts the subset of `backend.yaml` it calls.
- `cardtalogue-backend` (Go) — adopts `backend.yaml` for types/handlers; its
  calls to the scanner are covered by `scanner.yaml`.
- `cardtalogue-yugioh-scanner` (Python) — its HTTP surface is `scanner.yaml`.

## Golden rules

1. **The contract describes behavior; it does not change it.** Never edit a
   contract to make broken code "pass". Fix the code, or genuinely change the
   behavior, then update the contract.
2. **No orphan calls.** Every frontend→backend call and every backend→scanner
   call must be covered by a contract. Run `npm run check` (or
   `make check-orphan-calls`) after any change.
3. **Contract-first.** When adding or changing an endpoint, edit the `.yaml`
   first (operationId, summary, description, request/response schemas, examples,
   tags), validate, then generate.
4. **Backwards compatible.** Breaking changes require a `CONTRACT_VERSION` bump
   and a `CHANGELOG.md` entry. `make breaking-check` enforces this in CI.
5. **Keep it valid.** `npm run validate` must pass. `make lint` (Spectral) must
   pass.

## Editing a contract

```bash
# 1. edit contracts/backend.yaml or contracts/scanner.yaml
# 2. validate
npm run validate
# 3. lint
make lint
# 4. bundle + orphan check
npm run bundle
npm run check
# 5. generate (normal environment)
make generate
# 6. bump CONTRACT_VERSION + CHANGELOG.md if breaking
```

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

- Only npm-based scripts run in this sandbox: `validate`, `bundle`, `check`.
- `lint`, `breaking-check`, `mock`, `docs`, `generate`, `sync-contract` require
  external tools (Spectral, oasdiff, Prism, Redocly, oapi-codegen,
  openapi-python-client) installed in a normal environment — see the Makefile
  header.
- `check-orphan-calls.mjs` resolves backend→scanner URLs by tracing
  `http.NewRequest` vars through the constructor to the config default / `.env`.
  It compares **paths** (identical across environments).
