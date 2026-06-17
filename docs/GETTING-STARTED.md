# Getting Started

This walks you from a clean checkout to a running API, then through a full auth + users flow with `curl`.

## Prerequisites

- **Node ≥ 20** and npm.
- **Docker** (for the bundled Postgres and Redis), or your own Postgres and Redis instances.
- A POSIX-ish shell for the `curl` examples (Git Bash, WSL, or macOS/Linux work as written).

## 1. Install dependencies

```bash
npm i
```

## 2. Configure environment

Copy the example file and adjust as needed:

```bash
cp .env.example .env
```

The defaults work against the bundled Docker services. Key variables:

| Variable                                   | Default                                                 | Notes                                 |
| ------------------------------------------ | ------------------------------------------------------- | ------------------------------------- |
| `NODE_ENV`                                 | `development`                                           | `development` / `test` / `production` |
| `PORT`                                     | `3000`                                                  | HTTP port                             |
| `LOG_LEVEL`                                | `debug`                                                 | pino level                            |
| `CORS_ORIGIN`                              | `*`                                                     | comma-separated origins, or `*`       |
| `DATABASE_URL`                             | `postgresql://app:app@localhost:5432/app?schema=public` | matches docker-compose                |
| `REDIS_URL`                                | `redis://localhost:6379`                                | matches docker-compose                |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | dev placeholders (min 16 chars)                         | **replace in production**             |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL`       | `15m` / `7d`                                            | token lifetimes                       |
| `BCRYPT_ROUNDS`                            | `12`                                                    | 8–15                                  |
| `RATE_LIMIT_WINDOW_S` / `RATE_LIMIT_MAX`   | `60` / `100`                                            | global limiter window and budget      |

The process validates these on startup with Zod and exits if any are invalid.

## 3. Start Postgres and Redis

```bash
docker compose up -d
```

This starts `postgres:16-alpine` (user/password/db all `app`, port 5432) and `redis:7-alpine` (port 6379), each with a healthcheck and a named volume.

## 4. Apply the database schema

```bash
npm run prisma:migrate
```

This creates the `User` and `RefreshToken` tables and generates the Prisma client. (`prisma generate` also runs as part of the migrate command; you can run `npm run prisma:generate` on its own if needed.)

## 5. Run the API and the worker

In one terminal:

```bash
npm run dev
```

You should see `🚀 API listening on http://localhost:3000 [development]`.

In a second terminal, start the background worker (processes the `email` queue):

```bash
npm run worker
```

Confirm everything is healthy:

```bash
curl -s http://localhost:3000/health/ready
# {"success":true,"data":{"status":"ready","checks":{"database":"up","redis":"up"}}}
```

Open `http://localhost:3000/docs` for the interactive OpenAPI UI.

## Walkthrough with curl

The base URL for the versioned API is `http://localhost:3000/api/v1`.

### Register

```bash
curl -s -X POST http://localhost:3000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"ada@example.com","password":"supersecret","name":"Ada"}'
```

Returns `201` with the new user and a token pair:

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "…",
      "email": "ada@example.com",
      "name": "Ada",
      "role": "USER",
      "createdAt": "…",
      "updatedAt": "…"
    },
    "accessToken": "eyJ…",
    "refreshToken": "eyJ…"
  },
  "meta": { "requestId": "…" }
}
```

### Login

```bash
curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"ada@example.com","password":"supersecret"}'
```

Returns the same shape with a fresh `accessToken` / `refreshToken`. Capture the access token for the next call:

```bash
ACCESS=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"ada@example.com","password":"supersecret"}' \
  | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')
```

### Get the current user

`GET /api/v1/users/me` requires a Bearer access token:

```bash
curl -s http://localhost:3000/api/v1/users/me \
  -H "Authorization: Bearer $ACCESS"
```

```json
{
  "success": true,
  "data": {
    "id": "…",
    "email": "ada@example.com",
    "name": "Ada",
    "role": "USER",
    "createdAt": "…",
    "updatedAt": "…"
  },
  "meta": { "requestId": "…" }
}
```

### List users with pagination

Listing all users is **ADMIN-only**. With a `USER` token this returns `403 FORBIDDEN` - promote a user to `ADMIN` directly in the database (or via Prisma Studio: `npm run prisma:studio`) to try it.

```bash
curl -s "http://localhost:3000/api/v1/users?limit=2" \
  -H "Authorization: Bearer $ADMIN_ACCESS"
```

```json
{
  "success": true,
  "data": [{ "id": "…" }, { "id": "…" }],
  "meta": {
    "requestId": "…",
    "pagination": { "nextCursor": "eyJpZCI6Ijc4OSJ9", "hasMore": true, "limit": 2 }
  }
}
```

Fetch the next page by passing `nextCursor` back as `cursor`:

```bash
curl -s "http://localhost:3000/api/v1/users?limit=2&cursor=eyJpZCI6Ijc4OSJ9" \
  -H "Authorization: Bearer $ADMIN_ACCESS"
```

### Refresh tokens

When the access token expires, exchange the refresh token for a new pair. Refresh tokens **rotate**: the old one is revoked and a new one is returned.

```bash
curl -s -X POST http://localhost:3000/api/v1/auth/refresh \
  -H 'Content-Type: application/json' \
  -d '{"refreshToken":"eyJ…"}'
```

```json
{
  "success": true,
  "data": { "accessToken": "eyJ…", "refreshToken": "eyJ…" },
  "meta": { "requestId": "…" }
}
```

### Logout

Revokes the refresh token server-side and returns `204 No Content`:

```bash
curl -s -X POST http://localhost:3000/api/v1/auth/logout \
  -H 'Content-Type: application/json' \
  -d '{"refreshToken":"eyJ…"}' -i
```

After logout, that refresh token can no longer be used to refresh.

## Troubleshooting

- **`/health/ready` returns `503`** - Postgres or Redis is not reachable; check `docker compose ps` and your `DATABASE_URL` / `REDIS_URL`.
- **Process exits on startup with an env error** - a required variable failed Zod validation; the offending fields are printed.
- **`401 UNAUTHORIZED` on `/users/me`** - missing/expired Bearer token; refresh or log in again.
- **`/docs` is disabled** - `docs/openapi.yaml` could not be read from the working directory; run from the project root.
