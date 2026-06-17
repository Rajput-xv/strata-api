# Scaling

The design choices in this template exist so the same code can run on one laptop or behind a load balancer with dozens of instances serving millions of users. This page explains how each piece contributes and ends with a production checklist.

## Stateless app + horizontal scaling

The Express process holds no per-request state in memory. Sessions are not stored server-side - authentication is stateless JWTs, and anything that must be shared (rate-limit counters, cache, idempotency records, refresh tokens) lives in Redis or Postgres. That means you can run N identical instances behind a load balancer and scale out simply by adding more:

```
                  ┌──────────────┐
   clients ──────▶│ load balancer│
                  └──────┬───────┘
            ┌────────────┼────────────┐
            ▼            ▼            ▼
        ┌───────┐    ┌───────┐    ┌───────┐
        │ app 1 │    │ app 2 │    │ app N │   (stateless, identical)
        └───┬───┘    └───┬───┘    └───┬───┘
            └──────┬─────┴──────┬─────┘
                   ▼            ▼
              ┌─────────┐  ┌─────────┐
              │ Postgres│  │  Redis  │   (shared state)
              └─────────┘  └─────────┘
                   ▲
              ┌────┴────┐
              │ worker(s)│  (separate process: src/worker.ts)
              └─────────┘
```

The BullMQ worker (`src/worker.ts`) runs as its own process, so CPU- or latency-heavy jobs never block the request path and the API and workers scale independently.

## Postgres: pooling and the keyset index

- **Connection pooling.** Each app instance opens its own pool of database connections. With many instances this can exhaust Postgres' connection limit, so put **PgBouncer** (transaction pooling) in front in production and point `DATABASE_URL` at it. The app code does not change.
- **Keyset pagination index.** The `User` model declares `@@index([createdAt, id])`, and the repository orders by `(createdAt desc, id desc)` and fetches `limit + 1` rows. This keeps list queries index-only and fast regardless of how deep into the table you page - unlike `OFFSET`, which scans and discards everything before the page.

## Redis: cache-aside with TTL and invalidation

The `cache` service implements cache-aside:

- `cache.wrap(key, ttl, producer)` returns the cached value or computes it, stores it with a TTL, and returns it. `usersService.getById` wraps user lookups for 300 seconds.
- Writes invalidate precisely: `usersService.update` and `remove` call `cache.del('user:<id>')` so a stale entry can never outlive a change.
- `cache.invalidatePattern(pattern)` uses a non-blocking `SCAN` stream and a pipeline of `DEL`s. **Never use `KEYS` in production** - it blocks the Redis event loop; `SCAN` iterates incrementally.

TTLs bound staleness even if an invalidation is ever missed, and Redis absorbs read traffic that would otherwise hit Postgres on every request.

## BullMQ: offloading slow work

Slow or external operations (sending email, calling third-party APIs, generating reports) are pushed onto a BullMQ queue instead of being done inline:

```ts
import { emailQueue } from '@/infra/queue';

await emailQueue.add('welcome', {
  to: user.email,
  subject: 'Welcome',
  template: 'welcome',
  data: { name: user.name },
});
```

Jobs are retried with exponential backoff (`attempts: 3`, `backoff: { type: 'exponential', delay: 1000 }`) and auto-pruned (`removeOnComplete: 1000`, `removeOnFail: 5000`). The worker processes the `email` queue with `concurrency: 10`. Add more worker processes to increase throughput.

## Distributed rate limiting

Rate limiting is Redis-backed via `rate-limiter-flexible`, so the limit is shared across all instances rather than counted per-process. The limiter keys by `req.user?.id` when authenticated, otherwise by `req.ip`, and sets `X-RateLimit-Remaining`; when exhausted it sets `Retry-After` and throws `TooManyRequestsError` (`429 RATE_LIMITED`). The global limiter guards `/api/v1`; auth routes attach a stricter limiter (`points: 10, duration: 60`) to blunt credential stuffing.

Because the app sets `trust proxy`, `req.ip` reflects the real client behind the load balancer - make sure your proxy forwards `X-Forwarded-For`.

## Graceful shutdown and health probes

On `SIGTERM`/`SIGINT`, `server.ts` stops accepting new connections, then closes queues, disconnects Redis, and disconnects Prisma, with a 10-second hard cap so a stuck dependency can never hang the process forever. The worker does the same for its workers and Redis connection. This lets orchestrators (Kubernetes, ECS) roll instances without dropping in-flight requests.

Two probes support that lifecycle:

- `GET /health/live` - liveness; returns `200` if the process is up. Check nothing else, so a transient DB blip doesn't trigger a restart.
- `GET /health/ready` - readiness; runs `SELECT 1` against Postgres and `PING` against Redis, returning `200` only when both are `up`, otherwise `503` with a per-dependency breakdown. Route traffic only to ready instances.

## Observability

Logging is structured JSON via pino, with each line tagged `service: "strata-api"`. `pino-http` logs every request and reuses `req.id`, and sensitive fields (`authorization`/`cookie` headers, `password`, `passwordHash`, `token`, `refreshToken`) are redacted and removed. Because the same `requestId` appears in logs and in both success and error envelopes, you can trace any client-reported failure straight to its server-side log line. In development, `pino-pretty` makes logs readable; in production the raw JSON ships to your log aggregator.

## Production checklist

- [ ] Replace `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` with long, random, distinct values.
- [ ] Set `NODE_ENV=production` (enables 5xx message hiding and disables pretty logging).
- [ ] Set a restrictive `CORS_ORIGIN` (comma-separated origins, not `*`) for browser clients.
- [ ] Run migrations with `npm run prisma:deploy` (not `migrate dev`) in your release step.
- [ ] Put **PgBouncer** in front of Postgres and point `DATABASE_URL` at it; size the pool to your instance count.
- [ ] Run a managed/clustered Redis with persistence; confirm it is reachable from every app and worker instance.
- [ ] Deploy the worker (`npm run start:worker`) as its own process/service, scaled separately.
- [ ] Wire `/health/live` to your liveness probe and `/health/ready` to your readiness probe.
- [ ] Ensure your load balancer/proxy forwards `X-Forwarded-For` (the app trusts one proxy hop).
- [ ] Tune `RATE_LIMIT_WINDOW_S` / `RATE_LIMIT_MAX` for your traffic profile.
- [ ] Ship structured logs to an aggregator and index on `requestId`.
- [ ] Set sensible container resource limits and a `SIGTERM` grace period ≥ the 10s shutdown cap.
- [ ] Build the runtime image via the multi-stage `Dockerfile` and run `node dist/server.js`.
