# Deploying Telegram Bot to Dockerized Backend

This guide explains how to include the Telegram mini app (DePick.Bot) in the Docker container for the NestJS backend (DePick.BE).

## Architecture Overview

### Backend Structure (DePick.BE)
- **NestJS** app that serves both API and Telegram mini app
- **Static file serving** configured in `main.ts`:
  - `app.useStaticAssets('/bot/')` → serves mini app from `public/` folder
  - `app.useStaticAssets('/assets/')` → serves team logos from `public/assets/`
- **BotSpaController** → catch-all for `/bot/*` routes to enable React Router
- **Telegram bot integration** → generates JWT-authenticated WebApp URLs

### Bot Frontend (DePick.Bot)
- **Vite + React + TypeScript** mini app (separate folder)
- **Build process**: `tsc && vite build` → produces `dist/` folder
- **Deployment script** (`deploy-to-backend.sh`):
  - Builds bot: `npm run build`
  - Copies `dist/*` to `../DePick.BE/public/`
  - **Preserves** `public/assets/` folder (team logos)

---

## Step-by-Step Dockerization Guide

### **Step 1: Understand What Needs to Be in the Container**

Your Backend Runtime Requirements:
- ✅ Node.js runtime
- ✅ Compiled TypeScript (`dist/` folder)
- ✅ `node_modules/` (production dependencies)
- ✅ Prisma schema and generated client
- ✅ Smart contracts (`contracts/` folder)
- ✅ Firebase config (`firebase/` folder)
- ❌ **MISSING**: `public/` folder (Telegram mini app + team logos)

**Why This Matters**: Docker containers are isolated environments. If a file isn't explicitly copied into the container, it won't exist at runtime. The `public/` folder must be included for the mini app to work.

---

### **Step 2: Build the Bot Frontend BEFORE Docker Build**

**Action**: Run the bot build script to populate `DePick.BE/public/`:

```bash
cd /path/to/DePick.Bot
./deploy-to-backend.sh
```

**What This Does**:
1. Builds React app: `npm run build` (produces `dist/index.html`, `dist/assets/index-XXX.js`, etc.)
2. Removes old bot files from `../DePick.BE/public/`
3. Copies new build to `../DePick.BE/public/`
4. **Preserves** team logos in `public/assets/image/teams/`

**Why Before Docker**: Docker build is a separate process that packages files. The bot needs to be built FIRST so Docker can copy the built files.

**Docker Concept - Build Context**: When you run `docker build`, Docker only sees files in the "build context" (the folder you specify). Files outside this folder don't exist to Docker.

---

### **Step 3: Modify Dockerfile to Include `public/` Folder**

#### Understanding the `public/` Folder Structure

Your `public/` folder contains:

```
public/
├── index.html                    (bot app main file)
├── assets/
│   ├── index-XXXX.js            (bot JavaScript bundle)
│   ├── index-XXXX.css           (bot CSS bundle)
│   └── image/
│       └── teams/               (team logos)
│           ├── arsenal.png
│           ├── everton.png
│           └── ...
```

#### Why Two Static Asset Configurations?

In `main.ts`, you'll notice TWO `useStaticAssets` calls:

**Configuration 1** (serves bot app):
```typescript
app.useStaticAssets(join(__dirname, '..', 'public'), {
  prefix: '/bot/',
});
```
- **Serves**: ENTIRE `public/` folder
- **At URL**: `/bot/*`
- **Examples**:
  - `public/index.html` → `http://domain.com/bot/`
  - `public/assets/index-XXX.js` → `http://domain.com/bot/assets/index-XXX.js`

**Configuration 2** (serves team logos):
```typescript
app.useStaticAssets(join(__dirname, '..', 'public', 'assets'), {
  prefix: '/assets/',
});
```
- **Serves**: ONLY `public/assets/` subdirectory
- **At URL**: `/assets/*`
- **Examples**:
  - `public/assets/image/teams/arsenal.png` → `http://domain.com/assets/image/teams/arsenal.png`

**Why both?**
- Bot app needs to be at `/bot/` (React Router expects `basename="/bot"`)
- Team logos need to be at `/assets/` (API returns `logo: "/assets/image/teams/arsenal.png"`)

Both configurations reference the same base `public/` folder but serve different parts at different URL paths.

**Analogy**: Like a library with two entrances - one for Fiction (`/bot/`) and one for Reference (`/assets/`) - but both access the same building.

#### Dockerfile Modification

The Dockerfile has **two stages**:

**Stage 1: Builder** (lines 1-22) - where compilation happens
**Stage 2: Production** (lines 24-64) - the final slim image

The `public/` folder needs to be:
1. **Copied INTO the builder** (already done via `COPY . .` at line 19)
2. **Copied TO production stage** (needs to be added)

**Modification - Add after line 40** (production stage):

```dockerfile
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/contracts ./contracts
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/prisma ./prisma
COPY --from=builder /usr/src/app/firebase ./firebase
COPY --from=builder /usr/src/app/public ./public    # <-- ADD THIS LINE
```

**What This Means**:
- `--from=builder`: Take from the previous "builder" stage
- `/usr/src/app/public`: Source path inside builder container
- `./public`: Destination path in production container (working dir is `/usr/src/app`)

**Docker Concept - Multi-Stage Builds**:
- **Stage 1 (builder)**: Installs ALL dependencies (including dev tools like TypeScript compiler), builds code. This stage is LARGE.
- **Stage 2 (production)**: Copies ONLY the compiled output and runtime dependencies. This stage is SMALL and secure.
- **Why?** Smaller images deploy faster, have less attack surface, and cost less to store.

---

### **Step 4: Build the Docker Image**

**Action**:
```bash
cd /path/to/DePick.BE
docker build -t depick-backend:latest .
```

**What This Does**:
- `docker build`: Run the build process
- `-t depick-backend:latest`: Tag (name) the image "depick-backend" with version "latest"
- `.`: Use current directory as build context (Docker can see all files here)

**What Happens Inside**:
1. Docker reads your Dockerfile line by line
2. Creates temporary containers for each stage
3. Runs commands (`RUN`, `COPY`, etc.) in those containers
4. Saves the final container as an image
5. Image is stored on your machine, ready to run

**Docker Concept - Image vs Container**:
- **Image**: Like a blueprint or template (stored file)
- **Container**: Running instance of an image (actual process)
- **Analogy**: Image = Class, Container = Object instance

---

### **Step 5: Verify the Image Contains `public/`**

**Action**: Inspect the built image to confirm `public/` folder exists:

```bash
docker run --rm -it depick-backend:latest ls -la /usr/src/app/public
```

**What This Does**:
- `docker run`: Start a container from the image
- `--rm`: Delete container when done (cleanup)
- `-it`: Interactive terminal (so you see output)
- `depick-backend:latest`: The image to run
- `ls -la /usr/src/app/public`: Command to run inside container

**Expected Output**:
```
index.html
assets/
  index-XXX.js
  index-XXX.css
  image/
    teams/
      arsenal.png
      everton.png
      ...
```

**If `public/` is Missing**:
- **Problem**: `public/` folder didn't exist when you ran `docker build`
- **Solution**: Go back to Step 2, run `deploy-to-backend.sh`, then rebuild Docker image

---

### **Step 6: Test the Container Locally**

**Action**: Run the container and test the `/bot/` endpoint:

```bash
docker run --rm -p 3001:3000 \
  -e DATABASE_URL="postgresql://user:password@host.docker.internal:5432/depick-postgresql-local" \
  -e TELEGRAM_BOT_TOKEN="your-token" \
  -e JWT_SECRET="your-secret" \
  depick-backend:latest
```

**What This Does**:
- `-p 3001:3000`: Port mapping → `localhost:3001` (your machine) → `3000` (inside container)
- `-e VAR=value`: Pass environment variables into container
- `host.docker.internal`: Special DNS name that resolves to your host machine (so container can reach your local PostgreSQL)

**Test It**:
```bash
# Test mini app
curl http://localhost:3001/bot/
# Should return index.html content

# Test assets
curl http://localhost:3001/assets/image/teams/arsenal.png
# Should return image data
```

**Docker Concept - Port Mapping**:
- Containers are isolated networks
- By default, nothing inside container is accessible from outside
- `-p HOST:CONTAINER` creates a bridge: traffic to `localhost:HOST` → forwarded to `CONTAINER_PORT`

---

### **Step 7: Update `docker-compose.yml` (Optional)**

Your `docker-compose.yml` already builds the image, but you might want to expose ports for local testing.

**What to Add** (if you want to access from host):

```yaml
api:
  container_name: depick-backend-api-${STAGE}
  image: depick-backend-api:${VERSION:-latest}
  build:
    context: .
    dockerfile: Dockerfile
  ports:
    - "3001:3000"  # HOST:CONTAINER
  env_file:
    - .env.${STAGE}
  # ...rest stays same
```

**Docker Compose Concept**:
- `docker-compose.yml`: Orchestrates multiple containers (like your `postgres` + `api`)
- Defines relationships, networks, volumes, and environment variables in one file
- `docker-compose up`: Starts all services defined in the file
- **Why?** Easier than managing multiple `docker run` commands with 20+ flags

---

### **Step 8: CI/CD Integration (Future)**

When you set up CI/CD (GitHub Actions, GitLab CI, etc.), your build pipeline should be:

```bash
# 1. Build bot frontend
cd DePick.Bot
npm ci
npm run build
./deploy-to-backend.sh

# 2. Build Docker image
cd ../DePick.BE
docker build -t your-registry/depick-backend:$VERSION .

# 3. Push to registry
docker push your-registry/depick-backend:$VERSION

# 4. Deploy to server
ssh server "docker pull your-registry/depick-backend:$VERSION && docker-compose up -d"
```

---

## Key Docker Concepts Recap

| Concept | What It Is | Analogy |
|---------|------------|---------|
| **Image** | Immutable template containing code + dependencies | Recipe |
| **Container** | Running instance of an image | Cooked dish |
| **Dockerfile** | Instructions for building an image | Recipe steps |
| **Build Context** | Files Docker can see during build | Ingredients on counter |
| **Multi-Stage Build** | Multiple FROM statements, copy between stages | Prep kitchen → Serving kitchen |
| **Layer Caching** | Docker caches unchanged layers | Don't re-chop onions if recipe same |
| **Port Mapping** | Expose container ports to host | Open door in isolated room |
| **Volume** | Persistent storage outside container | External hard drive |
| **Network** | Virtual network for container communication | Private LAN |

---

## Quick Reference

### Full Build & Deploy Sequence

```bash
# 1. Build and deploy bot
cd /path/to/DePick.Bot
npm run build
./deploy-to-backend.sh

# 2. Verify public folder exists
ls -la ../DePick.BE/public/

# 3. Build Docker image
cd ../DePick.BE
docker build -t depick-backend:latest .

# 4. Verify public folder in image
docker run --rm -it depick-backend:latest ls -la /usr/src/app/public

# 5. Run container
docker run --rm -p 3001:3000 \
  -e DATABASE_URL="..." \
  -e TELEGRAM_BOT_TOKEN="..." \
  -e JWT_SECRET="..." \
  depick-backend:latest

# 6. Test endpoints
curl http://localhost:3001/bot/
curl http://localhost:3001/assets/image/teams/arsenal.png
```

---

## Summary - Action Items Checklist

- [ ] **Step 1**: Understand runtime requirements
- [ ] **Step 2**: Run `deploy-to-backend.sh` to build bot
- [ ] **Step 3**: Add `COPY --from=builder /usr/src/app/public ./public` to Dockerfile
- [ ] **Step 4**: Build Docker image: `docker build -t depick-backend:latest .`
- [ ] **Step 5**: Verify public exists: `docker run --rm -it depick-backend:latest ls -la /usr/src/app/public`
- [ ] **Step 6**: Test locally: `docker run -p 3001:3000 ...` and curl endpoints
- [ ] **Step 7**: (Optional) Update docker-compose.yml with port mapping
- [ ] **Step 8**: (Future) Integrate into CI/CD pipeline

---

## Troubleshooting

### Problem: `public/` folder not in container
**Solution**: Run `deploy-to-backend.sh` BEFORE `docker build`

### Problem: Bot shows 404 errors
**Solution**: Check if `BotSpaController` is registered in `app.module.ts`

### Problem: Assets don't load
**Solution**: Verify `app.useStaticAssets()` is configured in `main.ts`

### Problem: Port already in use
**Solution**: Change port mapping `-p 3002:3000` or stop conflicting process

### Problem: Can't connect to database
**Solution**: Use `host.docker.internal` instead of `localhost` in DATABASE_URL
