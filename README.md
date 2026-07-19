# sysdojo 🥋

Open-source **"Duolingo for system design"**: one question per day, XP,
streaks, levels, and spaced-repetition review of the questions you miss.
Mobile-first (Expo iOS/Android), self-hostable.

## How it works

- **One kata a day.** Everyone gets the same question for their local calendar
  day, picked deterministically from the content pack.
- **All game logic is server-side.** Grading, XP, combos, levels, streaks, and
  review scheduling happen in the API. The app only renders state and posts
  answers — it never sees the answer key before grading.
- **Timezone-aware days.** Streaks and the daily question follow the user's
  IANA timezone (stored on the profile), not server time.
- **Miss it? Review it.** Wrong answers enter a spaced-repetition queue
  (1 → 3 → 7 → 14 → 30 days) until you answer them correctly enough to
  graduate.
- **Content is data.** Questions live as YAML in `content/`, validated by a
  zod schema at API startup.

## Repository layout

```
apps/
  api/        Express + TypeScript API (/v1, JWT auth, game logic + vitest tests)
  mobile/     Expo app (Expo Router + NativeWind)
packages/
  shared/     zod schemas + types shared by api and mobile
content/
  questions/  YAML question packs (fundamentals / intermediate / advanced)
```

## Getting started

> First time here? **[docs/setup.md](docs/setup.md)** is the full
> step-by-step guide with expected output and troubleshooting.

Requires Node 20.12+.

```bash
npm install

# 1. Start the API (loads + validates the content pack)
npm run dev:api

# 2. In another terminal, start the mobile app
npm run dev:mobile
```

Without further setup the API uses an **in-memory store** (data resets on
restart) — fine for poking around.

### Persistent storage (Postgres)

```bash
docker compose up -d db                 # start Postgres 16
cp .env.example .env                    # then uncomment DATABASE_URL in .env
npm run db:migrate -w @sysdojo/api      # apply checked-in Prisma migrations
npm run dev:api                         # now uses the postgres store
```

The API and Prisma commands read the repo-root `.env` automatically. The
YAML content pack is upserted into the `Question` table at every startup
(idempotent — YAML stays the source of truth). Prisma's client is
generated into `apps/api/src/generated/` on `npm install`. Full details
and troubleshooting: [docs/setup.md](docs/setup.md).

Open the app in Expo Go / a simulator. It signs in automatically with
dev-mode auth using your device timezone. On a physical device, set
`EXPO_PUBLIC_API_URL` to your machine's LAN IP (see `.env.example`).

## Scripts

| Command             | What it does                                  |
| ------------------- | --------------------------------------------- |
| `npm run dev:api`   | Run the API with reload (`apps/api`)          |
| `npm run dev:mobile`| Start Expo (`apps/mobile`)                    |
| `npm test`          | Run all workspace tests (game-logic vitest)   |
| `npm run typecheck` | Typecheck every workspace                     |
| `npm run lint`      | Lint every workspace                          |
| `npm run db:migrate -w @sysdojo/api` | Apply Prisma migrations (needs `DATABASE_URL`) |

## API surface (v1)

| Method | Path                    | Purpose                                   |
| ------ | ----------------------- | ----------------------------------------- |
| POST   | `/v1/auth/dev`          | Dev-mode login → JWT + profile            |
| GET    | `/v1/daily`             | Today's question (+ result if answered)   |
| POST   | `/v1/answers`           | Submit today's answer → graded result     |
| GET    | `/v1/review`            | Due spaced-repetition items               |
| POST   | `/v1/review/:id/answer` | Answer a review item → reschedule/graduate|
| GET    | `/v1/me`                | Profile + stats                           |
| PATCH  | `/v1/me`                | Update display name / timezone            |

Errors are always `{ "error": { "code", "message" } }`.

## Current status

- ✅ Monorepo, shared schemas, YAML content pipeline
- ✅ API with tested pure game logic (XP, streaks, scheduler, grading)
- ✅ Mobile app: Today / Review / Profile
- ✅ PostgreSQL persistence via Prisma (`DATABASE_URL` opts in; in-memory
  dev store remains the default fallback)
- 🔜 Supabase auth adapter (dev-mode fake adapter today) + full-stack
  docker compose (compose currently ships the database only)

## Authoring questions

Add YAML to `content/questions/`:

```yaml
questions:
  - id: my-question-slug
    topic: caching
    difficulty: 2        # 1 fundamentals · 2 intermediate · 3 advanced
    prompt: The question text
    choices:
      - First option
      - Second option
    answerIndex: 1       # zero-based
    explanation: Why the answer is right.
```

The API refuses to boot on invalid or duplicate content, and
`apps/api/test/content.test.ts` validates the pack in CI.
