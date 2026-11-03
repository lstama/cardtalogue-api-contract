# DISCREPANCIES — Cardtalogue API Contract

Gaps discovered between the contracts in this repo and the three services, plus
the adoption boundaries. This is a living document; update it when a contract or
a service changes.

Full source inventory (read-only Phase 1 extraction) lives in the parent repo:
[`../DISCREPANCIES.md`](../DISCREPANCIES.md).

## Adoption boundaries

The contract documents the **full** surface of each boundary. Consumers adopt
only the subset they actually use. The hard requirement is **no orphan calls**:

- Every **frontend → backend** call is covered by `contracts/backend.yaml`.
- Every **backend → scanner** call is covered by `contracts/scanner.yaml`.

Extra endpoints in a contract are allowed (and expected) — a contract may
document more than a consumer adopts.

## backend.yaml

- Documents **52 operations**: 51 under `/api/v1` + `GET /health`.
- The frontend currently calls a subset (auth, cards, games, media scan/upload,
  profiles, storages, languages, packs, rarities). The remaining single-gets and
  update/delete endpoints (e.g. `DELETE /games/{id}`, `GET /languages/{id}`,
  `GET /packs/{id}`, `GET /rarities/{id}`, `GET /media/{id}`, all `/users/*`)
  are documented but not called by the frontend. This is intentional — they are
  real backend endpoints and belong in the contract.
- **Captcha:** `POST /media/scan` is documented as requiring a captcha token
  when the backend's captcha is enabled. The frontend sends the token only when
  `CAPTCHA_REQUIRED` is true. This is config-dependent, not a contract gap.

## scanner.yaml

- Documents `POST /api/recognize` (the only endpoint the backend calls) plus
  `GET /api/health`, `GET /api/info`, `GET /metrics` for observability.
- The backend calls the scanner over HTTP with multipart field `image` and the
  URL from `CARD_SCAN_API_URL` (default `http://172.17.0.4:5000/api/recognize`,
  overridden by `.env` to `http://localhost:5000/api/recognize`). The contract
  pins the **path** (`/api/recognize`), which is identical across environments.

## Known gaps / follow-ups

- Request-body examples are present on the most-used schemas; not every request
  schema carries an example yet. Add examples as consumers need them.
- `scanner.yaml` response schemas could be enriched with the exact `detail`
  shape the backend's `CardScanResponse` expects.
