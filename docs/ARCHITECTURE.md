# Architecture

This project is organized as three concentric rings with a thin HTTP edge on top. The guiding idea is to keep business logic independent of frameworks and infrastructure, so any single piece (the web framework, the database, the cache) can be swapped without rewriting the rest.

## The three rings

```
        ┌─────────────────────────────────────────────┐
        │                  modules/                    │   vertical feature slices
        │   auth · users · health                      │   (routes→controller→service
        │        │                                     │    →repository→schema→types)
        │        ▼                                     │
        │  ┌───────────────────────────────────────┐  │
        │  │               infra/                  │  │   adapters to the outside world
        │  │   db (Prisma) · cache (Redis)         │  │   (swappable)
        │  │   queue (BullMQ)                      │  │
        │  │        │                              │  │
        │  │        ▼                              │  │
        │  │  ┌─────────────────────────────────┐  │  │
        │  │  │             core/              │  │  │   the kernel: framework-agnostic
        │  │  │  errors · http · logger        │  │  │   primitives. No business logic,
        │  │  │  pagination · types            │  │  │   no I/O.
        │  │  └─────────────────────────────────┘  │  │
        │  └───────────────────────────────────────┘  │
        └─────────────────────────────────────────────┘

   cross-cutting:  middleware/   (requestId, security, validate, auth, rateLimit,
                                  idempotency, error, notFound)
   wiring:         app.ts · server.ts · worker.ts · routes/index.ts
```

### `core/` - the kernel

Framework-agnostic primitives shared by everything above it. No business logic, no I/O.

- `core/errors` - the `AppError` base class and its subclasses (`BadRequestError`, `ValidationError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `TooManyRequestsError`). Each carries a stable `code` and an HTTP `statusCode`.
- `core/http` - `HttpStatus` constants, the response envelope helpers (`sendSuccess`, `sendPaginated`), and `asyncHandler`.
- `core/logger` - the configured pino `logger`.
- `core/pagination` - `encodeCursor` / `decodeCursor` and the `PageQuery` / `Paginated<T>` types.
- `core/types` - `UserRole`, `AuthUser`, `ValidatedData`, and the Express request augmentation (`req.id`, `req.user`, `req.validated`).

### `infra/` - adapters

Everything that talks to the outside world, behind a small interface so it can be replaced.

- `infra/db/prisma` - the singleton `PrismaClient` and `disconnectPrisma`.
- `infra/cache/redis` - the app Redis connection plus a dedicated `bullConnection` (BullMQ requires `maxRetriesPerRequest: null`), and `disconnectRedis`.
- `infra/cache/cache.service` - the `cache` helper: `get`, `set`, `del`, `wrap` (cache-aside), `invalidatePattern` (SCAN-based, never `KEYS`).
- `infra/queue` - `createQueue`, the `emailQueue`, the `queues` array, and `closeQueues`; workers live in `infra/queue/workers`.

### `modules/` - vertical slices

Each feature owns its full stack and is reached only through its exported service. The internal layering is:

```
routes  →  controller  →  service  →  repository  →  (Prisma / cache)
              ▲              ▲
            schema (Zod)   types
```

- **routes** - declare the HTTP surface and attach middleware (auth, authorize, validate, rate limit).
- **controller** - thin; reads validated input, calls a service, sends the envelope. Never contains `try/catch` for flow.
- **service** - the business logic; orchestrates repositories, cache, tokens; throws typed errors.
- **repository** - the only layer that talks to Prisma directly.
- **schema** - Zod schemas and the inferred input types.
- **types** - public-facing shapes (e.g. `PublicUser`, which never exposes `passwordHash`).

Modules depend on `core` and `infra`, and never on each other's internals - only via exported services. For example `auth.service` imports `toPublicUser` from `users.service`, not the users repository.

### `middleware/` - cross-cutting concerns

Request id, security (helmet/cors/compression), Zod validation, authentication and authorization, rate limiting, idempotency, the central error formatter, and the 404 handler. All are re-exported from `@/middleware`.

### Wiring

- `routes/index.ts` aggregates the module routers into `apiRouter`.
- `app.ts` assembles the Express app: middleware order, `/health`, `/docs`, and `/api/v1` behind the rate limiter.
- `server.ts` starts the HTTP server and wires graceful shutdown and process-level error handlers.
- `worker.ts` is a separate process that runs BullMQ workers.

## The dependency-direction rule

```
modules  ─────▶  infra  ─────▶  core
   │                              ▲
   └──────────────────────────────┘
            (modules may also import core directly)

NEVER:  core  ─▶ infra      core  ─▶ modules      infra ─▶ modules
```

`core` imports nothing from `infra` or `modules`. `infra` may import from `core` but never from `modules`. `modules` may import from both `infra` and `core`. Arrows never point the other way. This is what makes the kernel reusable and the adapters swappable.

## Conventions that hold everywhere

- Every async Express handler is wrapped in `asyncHandler`, so a rejected promise flows to the error middleware instead of hanging the request.
- Controllers throw typed errors; they never format error responses themselves.
- Success responses use `sendSuccess` / `sendPaginated`; both attach `meta.requestId`.
- Files are named `kebab-case.role.ts` (e.g. `users.service.ts`); exported singletons are namespaced (`usersService`, `authController`); types are PascalCase.
- The import alias `@/*` maps to `src/*` everywhere.

## Request lifecycle

A request to a versioned API endpoint flows through the middleware stack assembled in `app.ts`, into a module's route → controller → service → repository, and back out through the response envelope. Errors short-circuit straight to the error middleware.

```
  HTTP request
      │
      ▼
┌───────────────┐
│  requestId    │  assign/propagate x-request-id  → req.id
├───────────────┤
│  pino-http    │  structured request logging (uses req.id)
├───────────────┤
│  security     │  helmet · cors · compression
├───────────────┤
│  express.json │  body parsing (limit 1mb) + urlencoded
├───────────────┤
│  rateLimiter  │  Redis-backed; keyed by user id or IP   (only on /api/v1)
└───────┬───────┘
        │
        ▼
   ┌─────────┐   matched module route (e.g. /api/v1/users)
   │  route  │
   └────┬────┘
        │  per-route middleware:
        ▼      authenticate → authorize(...) → validate({body,query,params})
   ┌─────────────┐
   │ controller  │  reads req.validated / req.body, calls service
   └──────┬──────┘
          │
          ▼
   ┌─────────────┐
   │  service    │  business logic; cache-aside; throws typed errors
   └──────┬──────┘
          │
          ▼
   ┌─────────────┐
   │ repository  │  Prisma queries  ───────▶  Postgres
   └──────┬──────┘                  ◀────────  rows
          │                          (cache hit/miss ─▶ Redis)
          ▼
   sendSuccess / sendPaginated
          │
          ▼
  { success: true, data, meta: { requestId, ... } }   →  HTTP response


  ── on any thrown/rejected error ──────────────────────────────────────────
          │
          ▼
   ┌──────────────────┐
   │  errorHandler    │  last middleware; maps AppError / ZodError /
   │  (error.mw)      │  Prisma errors → status + code, logs, serializes
   └────────┬─────────┘
            ▼
  { success: false, error: { code, message, details?, requestId } }
```

Two endpoints bypass the versioned pipeline:

- `/health/live` and `/health/ready` are mounted before `/api/v1` with no version prefix and no rate limit, so load balancers can probe them cheaply.
- `/docs` serves the Swagger UI built from `docs/openapi.yaml`.

Unmatched routes fall through to `notFoundHandler`, which throws a `NotFoundError` that the error middleware formats like any other error.
