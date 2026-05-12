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

## Running locally now

For local development, run the bot frontend directly with Vite instead of copying files into `DePick-backend/public`.

### Local dev server

From `DePick.Bot/`:

```bash
npm install
npm run dev
```

This starts the bot frontend on:

- `http://localhost:5174`

The backend can continue running separately, for example on:

- `http://localhost:3000`

or

- `http://localhost:3001`

depending on your local backend setup.

## Using two different ngrok URLs

If Telegram needs public URLs during local testing, use two tunnels:

1. one ngrok URL for `DePick-backend`
2. one ngrok URL for `DePick.Bot`

Example:

- backend: `https://your-backend.ngrok-free.app`
- bot frontend: `https://your-bot.ngrok-free.app`

### Example local setup

Run backend locally:

```bash
cd ../DePick-backend
npm run start
```

Run bot frontend locally:

```bash
cd ../DePick.Bot
npm run dev
```

Expose both:

```bash
ngrok http 3000
ngrok http 5174
```

or if your backend runs on `3001`:

```bash
ngrok http 3001
ngrok http 5174
```

### What to configure

In `DePick.Bot/.env`, point the frontend API base to the backend ngrok URL:

```env
VITE_API_URL=https://your-backend.ngrok-free.app
```

In `DePick-backend/.env`, point Telegram bot links to the bot frontend ngrok URL:

```env
URL_HOSTING_TELEGRAM_APP=https://your-bot.ngrok-free.app
```

### Why two ngrok URLs are needed

- the Telegram bot backend generates links using `URL_HOSTING_TELEGRAM_APP`
- the bot frontend needs to call the backend API
- so the frontend URL and backend API URL are different concerns and should be tunneled separately in local development

### Practical result

The user flow becomes:

1. Telegram bot sends a link pointing to the bot frontend ngrok URL
2. the bot frontend opens from that public URL
3. the frontend calls the backend through the backend ngrok URL

This replaces the old backend-public-folder flow for local testing.

## If backend-hosted `/bot/` deployment is ever needed again

You would need to restore alignment across all of these:

- Nest or nginx must actively serve the frontend from backend `/bot/`
- Vite `base` must be `/bot/`
- deployment docs must point to `DePick-backend/public` again
- `deploy-to-backend.sh` must become part of the real deployment path again

Until then, the backend-copy script should be treated as obsolete.
