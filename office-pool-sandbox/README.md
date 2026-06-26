# Office Pool Sandbox

Standalone product/API sandbox for Office Pool. This directory intentionally sits outside `src/` so it does not collide with lockstep E19/E20 Mini App scopes.

## What This Is

- Mock fixtures for the API contract in `../DePick.BE/docs/WIP/OfficePool/OfficePool.API.md`.
- A tiny standalone mock server for product and UI contract exploration.
- A place to test product assumptions without editing the production Mini App or backend Office Pool implementation.

## What This Is Not

- Not canonical backend code.
- Not a replacement for E14/E15/E17/E18.
- Not trusted scoring, settlement, commitment, or chain logic.
- Not part of the production Vite app unless explicitly wired by a later approved Mini App episode.

## Run The Mock Server

```bash
node office-pool-sandbox/mock-server.mjs
```

Default URL:

```text
http://localhost:4199
```

For a local Mini App experiment, point `VITE_API_URL` at that URL in a throwaway env/session only. Do not commit production wiring to this mock.

## Hybrid Telegram Bot + Sandbox Gateway

Use this mode when the real backend should keep owning Telegram bot polling and
Telegram auth, while Office Pool HTTP calls are served by the sandbox.

Run the three local processes on separate ports:

```bash
# 1. Real backend: Telegram bot, auth, and all non-Office-Pool API routes.
cd /Users/behrens/dev/DePick/DePick.BE
PORT=3032 npm run start:dev

# 2. Office Pool sandbox API.
cd /Users/behrens/dev/DePick/DePick.Bot
OFFICE_POOL_MOCK_PORT=4199 node office-pool-sandbox/mock-server.mjs

# 3. Public API gateway target for the Mini App / ngrok.
cd /Users/behrens/dev/DePick/DePick.Bot
OFFICE_POOL_GATEWAY_PORT=3031 \
OFFICE_POOL_GATEWAY_BACKEND=http://localhost:3032 \
OFFICE_POOL_GATEWAY_SANDBOX=http://localhost:4199 \
node office-pool-sandbox/api-gateway.mjs
```

Route shape:

```text
https://<api-ngrok> -> localhost:3031 gateway
  /office-pools* -> localhost:4199 sandbox
  everything else -> localhost:3032 real backend
```

The Mini App remains served separately:

```text
https://<mini-app-ngrok> -> localhost:8080 Vite Mini App
```

This lets `/officepool` work through the real backend bot while the Mini App's
Office Pool API calls are intercepted by the sandbox.

## Endpoints

- `GET /office-pools/create-context`
- `GET /office-pools/scope-access`
- `GET /office-pools`
- `GET /office-pools/my`
- `POST /office-pools`
- `GET /office-pools/:id`
- `POST /office-pools/:id/join`
- `PUT /office-pools/:id/structural-picks`
- `GET /office-pools/:id/predictions`
- `GET /office-pools/:id/picks`
- `POST /office-pools/:id/picks`
- `GET /office-pools/:id/leaderboard`
- `GET /office-pools/:id/settlement-preview`
- `POST /office-pools/:id/settle`

Default responses are knockout-first so the existing Mini App can be pointed at the sandbox for the current rollout. Use `?scenario=group` to force the older group-stage fixtures. `GET /office-pools/:id/predictions` defaults to a legacy-shaped knockout fixture list for the current Mini App; use `?scenario=knockout` for the newer contract-shaped `PoolMatch` fixture list. The join endpoint accepts both the canonical `entryAmount` + `structuralPicks` body and the legacy Mini App `{ sidePicks }` body.

All responses are deterministic and readiness-gated. Scores and payouts are intentionally null/empty until canonical backend episodes provide them.
