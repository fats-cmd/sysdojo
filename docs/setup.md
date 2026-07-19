# sysdojo — full setup guide

From zero to the app running on your phone or emulator. Follow top to
bottom; every step says how to verify it worked before moving on.

## 0. Prerequisites

| Tool | Needed for | Check |
| ---- | ---------- | ----- |
| Node 20.12+ | everything | `node --version` |
| Docker + running daemon | Postgres persistence (optional) | `docker info` |
| Expo Go app or an emulator | running the mobile app | — |

Docker is **optional**: without it the API uses an in-memory store
(everything works, data resets when the API restarts). Start there if you
just want to see the app run.

## 1. Install dependencies

```bash
git clone https://github.com/fats-cmd/sysdojo.git
cd sysdojo
npm install
```

`npm install` also generates the Prisma client (`apps/api/src/generated/`).
If you ever see `Cannot find module ... generated/prisma`, re-run
`npm install`.

## 2. Start the API

### Path A — no database (quickest)

```bash
npm run dev:api
```

Expected output ends with:

```
[sysdojo ...] DATABASE_URL not set — using in-memory store (data resets on restart)
[sysdojo ...] listening on http://localhost:3000 (memory store)
```

Skip to step 3.

### Path B — with Postgres (data survives restarts)

**2b-1. Make sure Docker's daemon is running.** `docker info` must
succeed. If you see
`failed to connect to the docker API at unix:///var/run/docker.sock`:

```bash
sudo systemctl start docker      # start the daemon now
sudo systemctl enable docker     # start it on every boot
```

- Permission denied on the socket instead? Add yourself to the docker
  group: `sudo usermod -aG docker $USER`, then log out and back in.
- On Windows/WSL2: start Docker Desktop and enable WSL integration for
  your distro in Docker Desktop settings.
- No Docker at all? See "Native Postgres" at the bottom.

**2b-2. Start the database:**

```bash
docker compose up -d db
docker compose ps        # wait until db shows "healthy"
```

**2b-3. Configure the connection.** Create `.env` at the repo root:

```bash
cp .env.example .env
```

then open `.env` and uncomment this line:

```
DATABASE_URL=postgresql://sysdojo:sysdojo@localhost:5432/sysdojo
```

The API and Prisma commands read `.env` automatically (variables already
exported in your shell take precedence).

**2b-4. Create the tables:**

```bash
npm run db:migrate -w @sysdojo/api
```

Expected: `All migrations have been successfully applied.` (or
`No pending migrations to apply` on later runs).

**2b-5. Start the API:**

```bash
npm run dev:api
```

Expected output:

```
[sysdojo ...] loaded environment from /path/to/sysdojo/.env
[sysdojo ...] loaded 15 questions
[sysdojo ...] DATABASE_URL set — using postgres store (localhost:5432/sysdojo)
[sysdojo ...] postgres reachable, 15 questions currently in the database
[sysdojo ...] listening on http://localhost:3000 (postgres store)
```

If it exits instead, the last log line tells you the fix (start docker,
run migrations, free the port, …).

**Verify:** open <http://localhost:3000/health> — you should see
`{"ok":true,"questions":15,"store":"postgres",...}`.

## 3. Start the mobile app

In a **second terminal** (leave the API running):

```bash
npm run dev:mobile
```

Then:

- **iOS simulator**: press `i` in the Expo terminal.
- **Android emulator**: press `a`. The app reaches your machine via
  `10.0.2.2:3000` automatically.
- **Physical phone (Expo Go)**: scan the QR code. The app automatically
  targets the API on the same machine that serves the JS bundle (it reuses
  Metro's LAN IP), so this just works when phone and computer are on the
  same Wi-Fi and the API uses the default port 3000. Override explicitly
  only if your API runs elsewhere:

  ```bash
  EXPO_PUBLIC_API_URL=http://192.168.1.20:3000 npm run dev:mobile
  ```

The Metro console prints `[sysdojo] API base URL: ...` on app start —
that is the URL the app is actually calling.

## 4. Troubleshooting

| Symptom | Cause → fix |
| ------- | ----------- |
| App: "Cannot reach the sysdojo API at ..." | API not running or wrong URL. Check the `dev:api` terminal, then `curl localhost:3000/health`, then the Metro `API base URL` line. |
| `failed to connect to the docker API at unix:///var/run/docker.sock` | Docker daemon not running → `sudo systemctl start docker` (see 2b-1). |
| API: `cannot reach postgres at localhost:5432` | Database container not up → `docker compose up -d db`. Or unset `DATABASE_URL` to use the in-memory store. |
| API: `schema is missing or out of date` | Run `npm run db:migrate -w @sysdojo/api`. |
| `DATABASE_URL is not set` from db:migrate | Create `.env` (step 2b-3) or `export DATABASE_URL=...` in the same terminal. |
| API: `port 3000 is already in use` | Another `dev:api` is running — stop it, or `PORT=3001 npm run dev:api` (then point `EXPO_PUBLIC_API_URL` at 3001). |
| `Cannot find module ... generated/prisma` | `npm install` at the repo root (regenerates the Prisma client). |
| Phone connects but times out | Firewall blocking port 3000, or phone on different network/VPN. |

## Native Postgres (no Docker)

```bash
sudo apt install postgresql            # Debian/Ubuntu
sudo -u postgres psql -c "CREATE USER sysdojo WITH PASSWORD 'sysdojo' CREATEDB;"
sudo -u postgres createdb -O sysdojo sysdojo
```

Then continue from step 2b-3 with the same `DATABASE_URL`.

## Day-to-day commands

| Command | What it does |
| ------- | ------------ |
| `npm run dev:api` | API with hot reload |
| `npm run dev:mobile` | Expo dev server |
| `npm test` | all tests (set `TEST_DATABASE_URL` to also run the Postgres store tests) |
| `npm run typecheck` | typecheck every workspace |
| `npm run db:migrate -w @sysdojo/api` | apply database migrations |
| `docker compose up -d db` / `docker compose stop db` | start/stop Postgres |
