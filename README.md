# strata-api

> Three strict layers, one rule - dependencies only ever point inward.

**strata-api** is a production-grade starting point for a **Node · Express · TypeScript** backend, built to carry you from your first user to your millionth without a rewrite.

Most Express apps start clean and quietly rot: routes reach into the database, business rules leak into controllers, and "where does this code go?" stops having an answer. strata-api answers it with three layers stacked like rock strata - each one settled on the layer below, none of them bleeding upward:

- **`core/` - the kernel.** Framework-agnostic primitives: the error model, the response envelope, pagination, logging. Depends on nothing.
- **`infra/` - the adapters.** Everything that touches the outside world: Postgres (Prisma), Redis (cache), BullMQ (queues). Swappable without touching your features.
- **`modules/` - the features.** Self-contained vertical slices (`auth`, `users`, …), each its own `routes → controller → service → repository`.

The whole design rests on one rule: **dependencies only point inward** - `modules → infra → core`, never the reverse. The kernel can't import a feature; a feature can't tunnel into another feature's internals. That single constraint is what keeps the codebase readable at 10 files and at 10,000.

And the unglamorous things you'd otherwise wire up at 2 a.m. are already in place: JWT auth with refresh-token rotation, Zod validation at the edge, Redis rate limiting with an in-memory fallback, cache-aside reads, background jobs, idempotency keys, request-traced structured logs, cursor pagination, and graceful shutdown.

## Features

- **Layered, dependency-directed architecture** - `modules → infra → core`, never the reverse. The kernel imports nothing from infra/modules.
- **Typed error model** - throw `AppError` subclasses; one error middleware serializes them into a stable envelope with machine-readable `code`s.
- **Consistent response envelope** - every success is `{ success: true, data, meta }`; every error is `{ success: false, error }`.
- **JWT auth with refresh-token rotation** - short-lived access tokens, rotating refresh tokens persisted in Postgres and revocable on logout.
- **Zod validation** - per-module schemas parsed by a `validate({ body, query, params })` middleware.
- **Cursor (keyset) pagination** - opaque base64url cursors, never offsets, backed by a `(createdAt, id)` index.
- **Distributed rate limiting** - Redis-backed, keyed by user id or IP so limits hold across horizontally-scaled instances.
- **Cache-aside with Redis** - JSON helper with TTL and non-blocking `SCAN`-based pattern invalidation.
- **Background jobs via BullMQ** - offload slow work (e.g. email) to a separate worker process.
- **Idempotency keys** - safe retries for `POST`/`PATCH` via the `Idempotency-Key` header.
- **Operational endpoints** - `/health/live` (liveness) and `/health/ready` (readiness: Postgres + Redis).
- **Interactive docs** - OpenAPI 3.1 at `/docs`, tuned as a test console: the auth token persists across reloads, endpoints are filterable, and each call shows its response time.
- **Graceful shutdown** - drains the HTTP server, closes queues, disconnects Redis and Prisma.

## Tech stack

| Concern         | Choice                                   |
| --------------- | ---------------------------------------- |
| Language        | TypeScript (strict), CommonJS, Node ≥ 20 |
| HTTP framework  | Express 4                                |
| Database        | PostgreSQL via Prisma                    |
| Cache / limiter | Redis (ioredis) + rate-limiter-flexible  |
| Queues          | BullMQ                                   |
| Validation      | Zod                                      |
| Auth            | jsonwebtoken + bcryptjs                  |
| Logging         | pino + pino-http                         |
| Docs            | OpenAPI 3.1 + swagger-ui-express         |
| Dev runner      | tsx; build via tsc + tsc-alias           |
| Tests           | Vitest + supertest                       |

## Quickstart

```bash
# 1. Clone and install
git clone <your-repo-url> strata-api
cd strata-api
npm i

# 2. Create your .env  (the required keys are listed in docs/GETTING-STARTED.md)
#    dev + worker load it automatically via --env-file; Prisma reads it too.

# 3. Start Postgres + Redis
#    Postgres is published on host :5433 so it won't collide with a
#    local Postgres already sitting on :5432.
docker compose up -d

# 4. Apply the database schema (creates the User + RefreshToken tables)
npm run prisma:migrate

# 5. Run the API (and, in a second terminal, the worker)
npm run dev
npm run worker
```

The API listens on `http://localhost:3000`. Interactive docs are at `http://localhost:3000/docs`, and `GET http://localhost:3000/health/ready` confirms Postgres and Redis are reachable.

## Scripts

| Script                    | What it does                                          |
| ------------------------- | ----------------------------------------------------- |
| `npm run dev`             | Run the API in watch mode, loading `.env` (`tsx watch --env-file`) |
| `npm run worker`          | Run the BullMQ worker in watch mode                   |
| `npm run build`           | Compile with `tsc` then rewrite paths via `tsc-alias` |
| `npm start`               | Run the compiled API (`node dist/server.js`)          |
| `npm run start:worker`    | Run the compiled worker (`node dist/worker.js`)       |
| `npm run typecheck`       | Type-check without emitting (`tsc --noEmit`)          |
| `npm run lint`            | Lint all `.ts` files                                  |
| `npm run format`          | Format with Prettier                                  |
| `npm test`                | Run the test suite once (`vitest run`)                |
| `npm run test:watch`      | Run tests in watch mode                               |
| `npm run test:coverage`   | Run tests once and write a V8 coverage report to `coverage/` |
| `npm run prisma:generate` | Generate the Prisma client                            |
| `npm run prisma:migrate`  | Create/apply a dev migration                          |
| `npm run prisma:deploy`   | Apply migrations in production                        |
| `npm run prisma:studio`   | Open Prisma Studio                                    |

## Testing

`npm test` runs the whole suite - **unit, middleware, and HTTP-integration layers** - in a few seconds, with **no Postgres or Redis required**. The two external boundaries (Prisma, Redis) are mocked at the module seam, so runs are deterministic and CI-safe; everything else exercises the real thing - the integration layer drives the actual Express app through supertest with genuine JWT signing, bcrypt hashing, and the full middleware chain.

- **`tests/unit/`** - pure logic: jwt, password, cursors, Zod schemas, the auth/users services, the cache helper.
- **`tests/middleware/`** - each middleware on its own: auth, validation, the rate limiter's in-memory fallback, error→envelope mapping, idempotent replay.
- **`tests/integration/`** - register → login → refresh → logout and the users CRUD flow, including role guards, the 404 envelope, and security headers.

`npm run test:coverage` writes a V8 report to `coverage/` (lines sit around 97%).

## Project layout

```
.
├── prisma/
│   └── schema.prisma            # User + RefreshToken models, keyset index
├── src/
│   ├── config/                  # env parsing (Zod) + typed config
│   ├── core/                    # KERNEL: errors, http, logger, pagination, types
│   │   ├── errors/
│   │   ├── http/                # httpStatus, response envelope, asyncHandler
│   │   ├── logger/
│   │   ├── pagination/          # cursor encode/decode + types
│   │   └── types/               # auth, http, express augmentation
│   ├── infra/                   # ADAPTERS: db, cache, queue
│   │   ├── db/                  # prisma client
│   │   ├── cache/               # redis + cache-aside service
│   │   └── queue/               # createQueue, emailQueue, workers/
│   ├── middleware/              # requestId, security, validate, auth,
│   │                            #   rateLimit, idempotency, error, notFound
│   ├── modules/                 # VERTICAL SLICES
│   │   ├── auth/                # schema → service → controller → routes
│   │   ├── users/               # + repository, types
│   │   └── health/              # liveness + readiness
│   ├── routes/                  # apiRouter (mounts modules under /api/v1)
│   ├── utils/                   # jwt, password
│   ├── app.ts                   # Express app assembly
│   ├── server.ts                # HTTP server + graceful shutdown
│   └── worker.ts                # BullMQ worker process entrypoint
├── tests/                       # unit · middleware · integration (supertest) + helpers
├── docs/                        # the documents linked below
├── docker-compose.yml           # postgres + redis
└── Dockerfile                   # multi-stage build + runtime image
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md) - the kernel→infra→modules philosophy and request lifecycle.
- [API Design Principles](docs/API-DESIGN-PRINCIPLES.md) - envelopes, error codes, versioning, pagination, idempotency.
- [Scaling](docs/SCALING.md) - how the design serves millions, and a production checklist.
- [Getting Started](docs/GETTING-STARTED.md) - step-by-step setup with curl walkthroughs.
- [Template Guide](docs/TEMPLATE-GUIDE.md) - reuse the template and add a new feature module in 6 steps.
- [OpenAPI spec](docs/openapi.yaml) - the machine-readable contract (served at `/docs`).

## License

MIT
