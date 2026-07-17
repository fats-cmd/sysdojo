@AGENTS.md
# sysdojo — Project Constitution

Open-source "Duolingo for system design": one question per day, XP,
streaks, levels, spaced-repetition review of missed questions.
Mobile-first (Expo iOS/Android), self-hostable via docker compose.

## Stack — do not deviate without asking
- Monorepo: npm workspaces. apps/api (Express+TS), apps/mobile (Expo+TS,
  Expo Router), packages/shared (types + zod schemas), content/ (YAML).
- DB: PostgreSQL via Prisma. Migrations checked in. Never raw SQL in routes.
- Auth: JWT access tokens. Auth provider behind AuthAdapter interface
  (supabase impl + dev-mode fake impl). Never couple business logic to Supabase.
- Validation: zod at every API boundary. Shared schemas live in packages/shared.

## Non-negotiable rules
1. ALL game logic is server-side: grading, XP, streaks, combos, levels,
   review scheduling. The mobile app only renders state and posts answers.
2. Content is data: questions/lessons are YAML in content/, validated by a
   zod schema, seeded into Postgres. Never hardcode question text in app code.
3. Timezone-aware "day": streaks and daily questions use the user's IANA
   timezone (stored on profile), not server time.
4. Every phase ships with tests for game logic (vitest). XP/streak/scheduler
   functions must be pure functions with unit tests.
5. TypeScript strict mode everywhere. No `any` unless commented why.
6. Keep dependencies minimal. Ask before adding any new package.
7. Never commit secrets. .env.example documents every variable.

## Conventions
- API: REST, /v1 prefix, JSON. Errors: { error: { code, message } }.
- Commits: conventional (feat:, fix:, chore:, test:, docs:).
- Files: kebab-case; React components PascalCase.
- After finishing a task: run typecheck, tests, and print a summary of
  every file created/modified with one line explaining each.

## How to work with me (the human)
- I review every phase before the next begins. Explain WHAT you built and
  WHY at the end of each task, briefly, so I can learn the codebase.
- If a requirement is ambiguous, list your assumption and proceed —
  do not stall.