# Telegram Bot Deployment Architecture

## Overview

The Telegram bot uses a **minimal, standalone frontend** (`DePick.Bot`) that is **served from the NestJS backend** at the `/bot/` path. This follows the SNF (Silverlynx Normal Form) principle: simplest solution, single deployment, no unnecessary complexity.

## Architecture

```
User: /predict everton
    ↓
Telegram Bot Service (NestJS Backend)
    ↓
1. Finds match: Everton vs Fulham (ID: 123)
2. Generates JWT token for user
3. Responds with inline button
    ↓
[Button: "Everton vs Fulham"]
WebApp URL: https://yourdomain.com/bot/predict/123?auth_token=JWT456
    ↓
User clicks button
    ↓
Telegram opens WebApp (embedded browser)
    ↓
Loads: https://yourdomain.com/bot/predict/123?auth_token=JWT456
    ↓
Frontend (static files served from NestJS)
    ↓
1. Extracts JWT from URL
2. Stores token in localStorage
3. Makes API call to: GET /predictions/123 (same origin!)
4. Renders prediction modal
    ↓
User places prediction
    ↓
POST /prediction-records (with JWT in Authorization header)
```

## File Structure

```
DePick.Bot/                    # Minimal Telegram bot frontend
├── src/
│   ├── pages/
│   │   ├── PredictPage.tsx   # Match list & detail
│   │   └── ClaimPage.tsx     # Claim rewards
│   ├── components/
│   │   └── PredictionModal.tsx
│   ├── services/
│   │   └── api.ts            # API client (uses same origin)
│   ├── types/                # Shared types from main FE
│   ├── utils/                # Math & token utilities
│   └── styles/               # SCSS modules
├── deploy-to-backend.sh      # Deployment script
└── package.json              # Minimal dependencies

DePick.BE/                     # NestJS Backend
├── src/
│   ├── auth/telegram/
│   │   └── telegram-bot.service.ts  # Bot logic & URL generation
│   └── main.ts               # Serves static files from /public at /bot/
└── public/                   # Bot static files (created by deploy script)
    ├── index.html
    ├── assets/
    └── ...
```

## Key Features

### DePick.Bot (Minimal Frontend)

**What it has:**
- 2 pages: PredictPage, ClaimPage
- 1 modal: PredictionModal
- API client (predictions, prediction-records, user)
- Type definitions
- Math utilities (odds calculation)
- Token utilities (JWT storage)
- SCSS styling

**What it DOESN'T have (vs main FE):**
- ❌ No OAuth (Google, LINE)
- ❌ No Wallet SDKs (Kaia, MetaMask, OKX)
- ❌ No SSE/WebSocket
- ❌ No Redux/Zustand
- ❌ No i18n
- ❌ No complex routing
- ❌ No registration flow

**Bundle size:** ~80% smaller than main frontend

### Backend Integration

**NestJS serves static files:**
```typescript
// src/main.ts
app.useStaticAssets(join(__dirname, '..', 'public'), {
  prefix: '/bot/',
});
```

**Bot generates WebApp URLs:**
```typescript
// telegram-bot.service.ts
const url = `${this.webappUrl}/bot/predict/${matchId}?auth_token=${jwt}`;
```

## Deployment

### 1. Build and Deploy Bot

```bash
cd DePick.Bot
./deploy-to-backend.sh
```

This builds the bot and copies it to `DePick.BE/public/`.

### 2. Configure Environment

In `DePick.BE/.env`:
```
URL_HOSTING_TELEGRAM_APP=https://yourdomain.com
```

### 3. Start Backend

```bash
cd DePick.BE
npm run dev  # or npm run build && npm start
```

### 4. Test

**Local testing:**
```
http://localhost:3001/bot/predict?auth_token=<valid-jwt>
```

**Via Telegram bot:**
```
User: /predict
Bot: [Button with WebApp URL]
```

## Benefits of This Architecture

1. **Single Deployment**
   - One server to deploy
   - One domain to manage
   - Simpler CI/CD

2. **No CORS Issues**
   - Frontend and API on same origin
   - No preflight requests
   - Simpler security

3. **Minimal Bundle**
   - No heavy wallet SDKs
   - No OAuth libraries
   - Faster load times for bot users

4. **SNF Compliance**
   - Simplest solution
   - No unnecessary components
   - Easy to maintain

## Authentication Flow

1. User interacts with bot: `/predict everton`
2. Backend generates JWT with user info:
   ```typescript
   const jwt = this.jwtService.sign({
     userId: user.id,
     telegramId: telegramId,
     loginProvider: 'TELEGRAM'
   });
   ```
3. Bot returns WebApp URL with JWT as query parameter
4. User clicks button → Telegram opens WebApp
5. Frontend extracts JWT from URL and stores it
6. All API requests include JWT in `Authorization: Bearer <token>` header
7. Backend validates JWT and processes requests

## API Calls

Frontend uses **relative URLs** (same origin):

```typescript
// src/services/api.ts
const api = axios.create({
  baseURL: '',  // Empty = same origin!
  // ...
});

// Calls become:
// GET /predictions/123
// POST /prediction-records
// GET /users/456
```

## Updating the Bot

1. Make changes in `DePick.Bot/src`
2. Run `./deploy-to-backend.sh`
3. Restart backend (if needed)
4. Bot URLs automatically point to updated version

## Troubleshooting

**Bot shows 404:**
- Check `DePick.BE/public/` exists with built files
- Verify `app.useStaticAssets()` in `main.ts`
- Check URL starts with `/bot/`

**API calls fail:**
- Check JWT is valid (not expired)
- Verify backend is running
- Check API endpoints exist
- Look at browser console for errors

**Static files not updating:**
- Run `./deploy-to-backend.sh` again
- Clear browser cache
- Restart backend

## Production Considerations

1. **HTTPS Required**
   - Telegram WebApps require HTTPS in production
   - Use Let's Encrypt or cloud provider certs

2. **Environment Variables**
   ```
   URL_HOSTING_TELEGRAM_APP=https://yourdomain.com
   TELEGRAM_BOT_TOKEN=<your-token>
   JWT_SECRET=<your-secret>
   ```

3. **Security**
   - JWT expiration time (currently in backend)
   - Rate limiting on bot commands
   - Validate all user inputs

4. **Monitoring**
   - Log bot interactions
   - Track API errors
   - Monitor JWT generation/validation

## Code Cleanup

The following files were **removed** from `DePick.FE` (main frontend):
- ❌ `/src/pages/telegram/` (entire directory)
- ❌ `/src/routes/TelegramRoutes.tsx`
- ❌ `/src/components/modal/TelegramPredictionModal.tsx`
- ❌ Early return logic in `App.tsx`

The main frontend (`DePick.FE`) now has **zero Telegram-specific code**, maintaining clean separation of concerns.
