# Changelog

All notable changes to the Cardtalogue API contracts are documented in this file.
This file follows the conventions of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

This file follows the conventions of [Semantic Versioning](https://semver.org/spec/v2.0.0.html):

- **MAJOR** — breaking changes to the contract (removed/renamed operations, changed
  request/response shapes in a backwards-incompatible way).
- **MINOR** — backwards-compatible additions (new operations, new optional fields,
  new examples).
- **PATCH** — corrections (typos, example fixes, description updates).

## [1.1.0]

### Added

- Optional `X-Cap-Token` header parameter on `POST /auth/login` (`login`) and
  `POST /media/scan` (`scanMedia`), declared via the shared
  `#/components/parameters/CapToken` component. The header carries the CAP
  proof-of-work token and is REQUIRED at runtime only when the backend runs with
  `CAPTCHA_MODE=on`; a missing/invalid/unavailable token then yields the existing
  `400` `ErrorResponse`. The change is backwards compatible (additive, optional),
  so it is a MINOR bump: `CONTRACT_VERSION` 1.0.0 → 1.1.0.

## [1.0.0]

### Added

- `contracts/backend.yaml` — OpenAPI 3.1 contract for the Go/Gin backend:
  52 operations (51 under `/api/v1` + `GET /health`) across auth, cards, games,
  languages, media, packs, rarities, profiles, storages, and users.
- `contracts/scanner.yaml` — OpenAPI 3.1 contract for the Python/Flask scanner:
  `POST /api/recognize` plus health/info/metrics.
- Shared components: `ErrorResponse`, pagination params (`Limit`, `Offset`),
  response wrappers, and a `bearerAuth` security scheme.
- `examples` on key schemas (ErrorResponse, UserResponse, CardResponse,
  MediaScanMatch, MediaScanResponse, GameResponse, LoginResponse).
- Tooling: `validate`, `bundle`, `check-orphan-calls` (npm), and a `Makefile`
  with `lint`, `breaking-check`, `mock`, `docs`, `generate`, `sync-contract`.
- `.spectral.yaml` lint ruleset enforcing operationId/summary/description/examples/tags.
- `scripts/check-orphan-calls.mjs` guardrail ensuring no orphan frontend→backend
  or backend→scanner calls.

[1.1.0]: https://github.com/lstama/cardtalogue-api-contract/releases/tag/v1.1.0
[1.0.0]: https://github.com/lstama/cardtalogue-api-contract/releases/tag/v1.0.0
