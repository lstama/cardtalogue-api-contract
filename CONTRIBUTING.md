# Contributing to the API contract

This repo is the single source of truth for the API shared between the backend and the frontend.
Because both consumers generate their types from it, a change here ripples downstream — so changes
are coordinated, not local.

## When you need to change the contract

Any new endpoint, new field, or changed request/response shape must start here, in the OpenAPI
specs:

- `contracts/backend.yaml` — backend API
- `contracts/scanner.yaml` — backend → scanner API

## Workflow

1. **Edit both specs** if the change touches both sides (e.g. a new scanner call).
2. **Bump `CONTRACT_VERSION`** in the Makefile. Consumers pin this version; bumping it signals them
   to regenerate.
3. **Validate locally** before opening a PR:

   ```bash
   make verify-contract   # validate + lint + orphan-call guardrail + breaking-change check
   ```

   This runs:
   - `make validate` — OpenAPI schema validation
   - `make lint` — Redocly style linting
   - `make check` — orphan-call guardrail (every real call must be covered by a contract)
   - `make breaking-check` — detects breaking changes against the previous version
4. **Generate** the shared types:

   ```bash
   make generate          # gen/go (backend), gen/ts (frontend), gen/py
   ```

   Frontend-only work only needs `make generate-ts`; backend-only work needs `make generate-go`.
5. **Sync downstream** — after merge, each consumer bumps `CONTRACT_VERSION`, runs `make generate`,
   and opens a PR. See each consumer's README for details.

## Rules

- **No orphan calls.** Every call that happens must be covered by a contract (`make check`).
- **No breaking changes without a version bump.** `make breaking-check` fails the build on breaking
  changes; coordinate the rollout with consumers first.
- **Keep both specs in sync.** A scanner change usually means a backend change too.
- **Prefer additive changes.** New fields/endpoints are safe; renaming or removing ones consumers
  rely on is breaking.

## Commands

| Command | What it does |
| --- | --- |
| `make validate` | Validate the OpenAPI specs |
| `make lint` | Redocly style linting |
| `make bundle` | Bundle specs into `dist/*.html` |
| `make check` | Orphan-call guardrail across both consumers |
| `make breaking-check` | Detect breaking changes vs. the previous version |
| `make generate` | Generate Go + TS + py types |
| `make mock` | Start Prism mock servers (:8080 backend, :5000 scanner) |
| `make verify-contract` | validate + lint + check + breaking-check |
