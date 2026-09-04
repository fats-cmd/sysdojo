# Authentication

How sign-in works, and what a production deployment requires.

## The shape of it

```
Supabase (OAuth)                    sysdojo API                     app
      │                                  │                           │
      │◀── user signs in with provider ──┼───────────────────────────│
      │─── provider access token ────────┼──────────────────────────▶│
      │                                  │◀── POST /v1/auth/login ───│
      │◀── fetch public signing keys ────│    { credential, timezone }
      │                                  │
      │                    verify sig, iss, aud, exp
      │                    find-or-create user
      │                                  │─── accessToken (15 min) ─▶│
      │                                  │    refreshToken (60 days) │
```

The provider only ever vouches for an identity. The API issues **its own**
session, so no game logic is coupled to Supabase and swapping providers means
writing one `AuthAdapter`.

## Two tokens, different jobs

|                | Access token | Refresh token |
| -------------- | ------------ | ------------- |
| Form           | Signed JWT, `iss`/`aud` pinned | 32 random bytes, opaque |
| Lifetime       | 15 minutes | 60 days, rotating |
| Sent on        | Every request (`Authorization: Bearer`) | Only `POST /v1/auth/refresh` |
| Stored server-side | No | SHA-256 hash only |
| Revocable      | No — it just expires fast | Yes, immediately |

A leaked access token is useful for minutes. A leaked refresh token is
detectable, because refresh tokens **rotate**: each use mints a replacement
and marks the old one replaced. If a replaced token is ever presented again,
two parties hold the same secret — we cannot tell the user from the thief, so
the entire rotation **family** is revoked and both must sign in again.

Only the hash is stored, so a database dump cannot be replayed as sessions.

## Endpoints

| Endpoint | Auth | Purpose |
| -------- | ---- | ------- |
| `POST /v1/auth/login` | provider credential | Exchange a Supabase access token for a session |
| `POST /v1/auth/refresh` | refresh token | Rotate: new access + refresh pair |
| `POST /v1/auth/logout` | refresh token | Revoke this device's session |
| `POST /v1/auth/dev` | none | Dev-only login. **Impossible in production** |
| `POST /v1/me/logout-all` | access token | Revoke every session for the account |
| `DELETE /v1/me` | access token | Delete the account and all its data |

`/v1/auth/logout` is deliberately unauthenticated: an expired access token
must never trap someone in a session they want to end.

`/v1/auth/*` is rate limited (20 requests/minute/IP by default). The limiter
is in-process, so behind N replicas the effective ceiling is N × the limit.
Set `TRUST_PROXY` to the number of proxies in front of the API or every
request will look like it came from your load balancer.

## Verifying Supabase tokens

Set `SUPABASE_URL` and the API verifies tokens against the project's
published public keys at `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`. No
shared secret is involved, Supabase can rotate keys without a redeploy, and
the expected issuer is pinned so a token from another project is rejected.

`SUPABASE_JWT_SECRET` (the legacy shared HS256 secret) is still accepted for
projects that have not migrated to asymmetric signing keys. Prefer
`SUPABASE_URL` alone once yours has: a symmetric secret can *mint* tokens,
not just verify them, so it is a far worse thing to leak.

If the JWKS endpoint is unreachable, login returns **503**, not 401 — a
provider outage must not look like a bad credential and sign everyone out.

## Going to production

Set `NODE_ENV=production`. The API then **refuses to start** unless:

| Variable | Requirement |
| -------- | ----------- |
| `JWT_SECRET` | Set, ≥ 32 chars, not the `.env.example` placeholder |
| `DATABASE_URL` | Set — the in-memory store loses every account on restart |
| `SUPABASE_URL` | Set — production must not run on the dev auth adapter |
| `ALLOW_DEV_LOGIN` | Must **not** be `1` |

Every problem is reported in one failed boot, so you fix them all at once:

```
ERROR refusing to start with NODE_ENV=production:
ERROR   - JWT_SECRET is still the .env.example placeholder — anyone can forge access tokens
ERROR   - No auth provider configured — set SUPABASE_URL ...
ERROR   - DATABASE_URL is required in production ...
```

Generate a signing secret with:

```bash
openssl rand -base64 48
```

This is fail-fast on purpose. Every development convenience in this project —
the known JWT secret, the credential-free `/v1/auth/dev` endpoint, the
in-memory store — is a complete authentication bypass in production. None of
them may be reachable by forgetting an environment variable.

### Rotating `JWT_SECRET`

Changing it invalidates every access token immediately. Clients recover on
their own: the next request 401s, the app refreshes (refresh tokens are
unaffected — they are random bytes, not signed), and gets a valid token back.
Expect one silent retry per active user, not a wave of sign-ins.

To force everyone out instead, truncate the `RefreshToken` table.

## On the device

Tokens live in the iOS Keychain / Android EncryptedSharedPreferences via
`expo-secure-store` (`lib/token-store.ts`), marked
`WHEN_UNLOCKED_THIS_DEVICE_ONLY` so they stay out of backups restored onto
another device. Expo web falls back to `localStorage` — a development
convenience, not equivalent security.

`ApiClient` refreshes on a 401 and retries once, **single-flighting** the
refresh so a burst of concurrent 401s cannot rotate the same token twice and
trip reuse detection against the user's own app.

## Account deletion

`DELETE /v1/me` erases the user and cascades to answers, reviews and refresh
tokens. This is required by App Store guideline 5.1.1(v) for any app that
offers account creation, so it is a shipping requirement rather than a
nicety.

It deletes the **sysdojo** account only — the identity at Supabase is
untouched, and signing in again creates a fresh, empty account. Deleting the
provider identity too would need a Supabase admin call with a service-role
key, which this API deliberately does not hold.
