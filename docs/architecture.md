# sysdojo — architecture

How the pieces fit together and the invariants that keep the game fair.
For getting it running, see [setup.md](setup.md).

## The one-paragraph version

Questions are YAML files. The API validates them at boot, seeds them into
Postgres, and serves one deterministic question per calendar day. All game
rules — grading, XP, combos, streaks, spaced repetition — run **server-side**
as pure functions; the mobile app only renders state and posts answers. A
narrow `Store` interface hides persistence, so the API runs identically on
an in-memory map (dev) or Postgres via Prisma (production).

## Monorepo layout

```
apps/api          Express + TypeScript API (the game engine)
apps/mobile       Expo app (Expo Router + NativeWind) — rendering only
packages/shared   zod schemas + types used by BOTH api and mobile
content/          YAML question packs (the content pipeline's source of truth)
docs/             this documentation
```

`packages/shared` is the contract: every API request/response and every
content file shape is a zod schema there. The API parses input with them;
the app parses *responses* with them too, so a drifting server surfaces
immediately as a validation error instead of undefined behavior.

## Non-negotiable invariants

1. **Server-authoritative game logic.** The app never sees `answerIndex`
   before grading (`toPublicQuestion` strips it) and never computes XP,
   streaks, or schedules. Cheating would require talking to the API like
   any other client.
2. **Timezone-aware days.** A "day" is the `YYYY-MM-DD` string in the
   *user's* IANA timezone (stored on their profile), computed by
   `game/time.ts`. Streaks, daily questions, and review due dates all use
   these strings — never server-local dates. They order correctly under
   plain string comparison, which is why the store can filter reviews with
   `dueDay <= today`.
3. **Content is data.** Question text lives only in `content/*.yaml`,
   validated by `contentQuestionSchema` at boot (the API refuses to start
   on invalid or duplicate content). No question text in code, ever.

## The API (apps/api)

### Request lifecycle

```
request → CORS headers → express.json → request logger (dev)
        → requireAuth (JWT → UserRecord on req.user)
        → route handler (zod-parse body, call game functions, use Store)
        → errorMiddleware ({ error: { code, message } } for every failure)
```

### Game logic (`src/game/`) — pure functions, unit-tested

| Module | Rule it owns |
| ------ | ------------ |
| `daily.ts` | FNV-1a hash of the day string mod pool size → same question for everyone on the same local date, no stored schedule |
| `grade.ts` | compares a choice against the answer key |
| `xp.ts` | base XP by difficulty (10/15/20), +2/stack combo bonus capped at 5 stacks, half XP for reviews, 2 consolation XP for wrong answers |
| `streak.ts` | same-day idempotent, consecutive-day increment, gap resets to 1 |
| `scheduler.ts` | SM-2-lite spaced repetition: miss → due in 1 day, correct reviews advance 1 → 3 → 7 → 14 → 30 days, wrong resets, past 30 graduates |
| `time.ts` | `dayString(date, timezone)` and `addDays` — the only place day math happens |

None of these touch the database or Express; they take values and return
values, which is what keeps them trivially testable.

### Persistence (`src/store/`)

`store.ts` defines the boundary: `UserRecord`, `DailyAnswerRecord`,
`ReviewRecord` and the `Store` interface (~10 methods). Routes only ever
see this interface.

- `memory-store.ts` — Maps in process memory. Default when `DATABASE_URL`
  is unset; also what most tests use.
- `prisma-store.ts` — Postgres via Prisma 7 (pg driver adapter). Selected
  by `DATABASE_URL`. The Prisma schema mirrors the record types 1:1, so
  the mapping layer is nearly invisible.

`test/store.test.ts` runs one contract suite against both implementations
(Postgres side activates when `TEST_DATABASE_URL` is set), which is what
licenses the "runs identically" claim above.

Content seeding: `content/sync.ts` upserts the validated YAML pack into
the `Question` table at every startup — idempotent, YAML stays the source
of truth, and answers/reviews get real foreign keys.

### Auth (`src/auth/`)

`AuthAdapter` is the seam: `authenticate(credentials) → external identity`.
Today there is one implementation, `FakeAuthAdapter` (dev mode: any device
gets an identity, no password). The planned Supabase adapter implements the
same interface, which is why routes and JWT handling won't change: the API
always issues **its own** short-lived JWT after the adapter vouches for an
identity, and `requireAuth` resolves it to a `UserRecord` on every request.

### Startup (`src/index.ts`)

Boot order matters and is fail-fast with actionable log lines: load `.env`
(Node's built-in loader, shell wins) → validate content → probe the
database if configured (unreachable/unmigrated → one-line fix suggestion,
exit 1) → sync questions → listen. `/health` reports which store is live.

## The mobile app (apps/mobile)

Expo Router screens under `app/`: `(tabs)/index` (Today), `review`,
`profile`. Shared pieces:

- `lib/api.ts` — the only network code. Resolves the API base URL
  (explicit `EXPO_PUBLIC_API_URL` → Metro host's LAN IP on devices →
  localhost/10.0.2.2), attaches the JWT, zod-parses every response.
- `lib/session.tsx` — dev-mode auto-login with the device timezone; holds
  token + profile in context.
- `components/question-card.tsx` — renders a question, posts the chosen
  index, renders the server's verdict. It never grades locally.

The app deliberately contains no game rules: if it disagrees with the
server, the server is right.

## Testing strategy

- Pure game functions: exhaustive unit tests (`test/xp|streak|scheduler|
  daily|grade|time.test.ts`).
- Content pack: schema-validated in `test/content.test.ts` (CI fails on
  bad YAML).
- Store implementations: shared contract suite (`test/store.test.ts`).
- HTTP layer: `test/cors.test.ts` boots the real app on an ephemeral port.

## Extension points

| To add… | Touch |
| ------- | ----- |
| new questions | `content/questions/*.yaml` only |
| a real auth provider | implement `AuthAdapter`, wire in `index.ts` |
| another database | implement `Store`, pass it to `createApp` |
| new game rules | pure function in `src/game/` + tests + route wiring |
| new API endpoints | schema in `packages/shared`, router in `src/routes/` |
