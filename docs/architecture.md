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

`AuthAdapter` is the seam: `authenticate(credential) → external identity`.
Two implementations: `FakeAuthAdapter` (dev mode: any device gets an
identity, no password) and `SupabaseAuthAdapter`. The adapter only ever
vouches for an identity — the API then issues **its own** session, so no
business logic is coupled to Supabase.

**Verifying the provider's token.** Supabase signs session JWTs with an
asymmetric key whose public half it publishes at
`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`. `jwks.ts` fetches and
caches those keys (Node imports a JWK natively, so no JWKS library), and
rotation is handled by refetching on an unknown `kid` — rate-limited so
junk key ids can not amplify into outbound requests. The legacy shared
HS256 secret is still accepted for unmigrated projects. The algorithm in
the token header picks the path, and each path is restricted to its own
key material, so `alg: HS256` can never be verified against a public key.
`iss` and `aud` are both checked. A JWKS outage returns **503**, not 401 —
a provider being down must not look like a bad credential and sign
everyone out.

**Our own session** is a pair (`auth/jwt.ts`, `auth/refresh.ts`):

| | Access token | Refresh token |
| --- | --- | --- |
| form | signed JWT (`iss`/`aud` pinned) | 32 random bytes, opaque |
| life | 15 minutes | 60 days, rotating |
| storage | not stored | SHA-256 hash only |
| revocable | no (expires fast) | yes, immediately |

Every refresh rotates: the presented token is marked replaced and a new one
issued in the same **family**. Presenting an already-rotated token means two
parties hold the same secret, so the whole family is revoked and the real
user is signed out rather than silently sharing their account. `deleteUser`
cascades to answers, reviews and tokens.

`evaluateRefreshToken` is a pure function, so all four outcomes (valid,
expired, revoked, reused) are unit-tested without a database.

### Configuration (`src/config.ts`)

One pure function turns the environment into a validated `AppConfig`, and
**production is fail-fast**: a missing or placeholder `JWT_SECRET`, no
auth provider, no `DATABASE_URL`, or `ALLOW_DEV_LOGIN=1` each refuse the
boot, and every problem is reported at once. The credential-free
`/v1/auth/dev` endpoint is impossible to enable under `NODE_ENV=production`
— not merely off by default. Every development convenience in this project
is a full authentication bypass in production, so none of them may be
reachable by forgetting a variable.

### Startup (`src/index.ts`)

Boot order matters and is fail-fast with actionable log lines: load `.env`
(Node's built-in loader, shell wins) → **validate configuration** → validate
content → probe the database if configured (unreachable/unmigrated →
one-line fix suggestion, exit 1) → sync questions → listen. `/health`
reports which store is live. An hourly sweep prunes expired refresh tokens.

## The mobile app (apps/mobile)

Expo Router screens under `app/`: `(tabs)/index` (Today), `review`,
`profile`. Shared pieces:

- `lib/api.ts` — the only network code. Resolves the API base URL
  (explicit `EXPO_PUBLIC_API_URL` → Metro host's LAN IP on devices →
  localhost/10.0.2.2), attaches the access token, zod-parses every
  response. Owns the session: on a 401 it refreshes once and retries, with
  the refresh **single-flighted** so a burst of 401s cannot rotate the same
  token twice and trip the server's reuse detection.
- `lib/token-store.ts` — tokens in the iOS Keychain / Android
  EncryptedSharedPreferences via expo-secure-store, so the refresh token is
  not readable on a rooted device or in an unencrypted backup. Expo web
  falls back to localStorage (development convenience, not equivalent
  security).
- `lib/session.tsx` — restores the saved session on launch, so a returning
  user skips sign-in entirely; dev-mode auto-login otherwise. Exposes
  sign-out, sign-out-everywhere, and account deletion.
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
- HTTP layer: `test/cors.test.ts` and `test/auth-routes.test.ts` boot the
  real app on an ephemeral port. The latter walks the whole session
  lifecycle: sign in, rotate, replay a stolen token, sign out, delete.
- Configuration: `test/config.test.ts` pins every production refusal.

## Extension points

| To add… | Touch |
| ------- | ----- |
| new questions | `content/questions/*.yaml` only |
| a real auth provider | implement `AuthAdapter`, wire in `index.ts` |
| a production auth rule | `src/config.ts` + `test/config.test.ts` |
| another database | implement `Store`, pass it to `createApp` |
| new game rules | pure function in `src/game/` + tests + route wiring |
| new API endpoints | schema in `packages/shared`, router in `src/routes/` |
