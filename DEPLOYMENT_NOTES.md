# DePick Frontend Deployment Notes

## What changed

`DePickIO/vite.config.ts` was made explicit for local development:

- `base: '/'`
- `server.host = '0.0.0.0'`
- `server.port = 5173`
- `server.strictPort = true`
- `server.allowedHosts = true`
- `preview.host = '0.0.0.0'`
- `preview.port = 4173`
- `preview.strictPort = true`
- `build.outDir = 'dist'`
- `build.emptyOutDir = true`

This removes any ambiguity around how the local Vite server should behave. Setting `allowedHosts: true` only affects the Vite dev server. It does not change the production build output.

## About `VITE_ALLOWED_HOSTS`

`DePickIO/vite.config.ts` did not previously use `VITE_ALLOWED_HOSTS`.

The env-based `allowedHosts` logic exists in `DePick.Bot/vite.config.ts`, not in `DePickIO/vite.config.ts`. The `DePickIO` change here is simply to make local dev behavior explicit and permissive.

## Why `DePick.Bot/deploy-to-backend.sh` is obsolete

The old script assumes the Telegram bot frontend is deployed by copying the Vite build output into:

- `DePick-backend/public`

and then served by the Nest backend under:

- `/bot/`

That deployment model no longer matches the current setup.

## Original problem

There are now two incompatible deployment assumptions:

1. Old backend-copied model
   - `deploy-to-backend.sh` builds `DePick.Bot`
   - copies `dist/*` into `DePick-backend/public`
   - expects backend-hosted routing such as `/bot/predict`

2. Current dedicated static-host model
   - nginx serves the bot from dedicated roots such as:
     - `/var/www/uat/bot-frontend`
     - `/var/www/prod/bot-frontend`
   - hostnames are dedicated bot domains, for example:
     - `bot-uat.depick.wtf`
     - `bot.depick.wtf`
   - this model serves the app from domain root `/`, not backend `/bot/`

## Why the old script no longer fits

- `DePick-backend` does not currently configure Nest static serving for `public/`
- the current nginx config serves the bot directly from static filesystem roots
- `DePick.Bot/vite.config.ts` uses `base: '/'`, which matches dedicated bot-host deployment, not `/bot/` subpath deployment
- copying files into `DePick-backend/public` no longer makes them live in the active deployment path

## Practical outcome

`DePick.Bot/deploy-to-backend.sh` is now a legacy script.

It may still copy files into `DePick-backend/public`, but that folder is no longer the active deployment target for the Telegram bot frontend in the current nginx-based setup.

## Recommended deployment model now

For `DePick.Bot`, deploy the built static files directly to the nginx bot frontend roots, for example:

- UAT: `/var/www/uat/bot-frontend`
- PROD: `/var/www/prod/bot-frontend`

That matches the current dedicated bot domain setup and the current Vite `base: '/'` assumption.

## If backend-hosted `/bot/` deployment is ever needed again

You would need to restore alignment across all of these:

- Nest or nginx must actively serve the frontend from backend `/bot/`
- Vite `base` must be `/bot/`
- deployment docs must point to `DePick-backend/public` again
- `deploy-to-backend.sh` must become part of the real deployment path again

Until then, the backend-copy script should be treated as obsolete.
