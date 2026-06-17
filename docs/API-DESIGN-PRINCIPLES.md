# API Design Principles

These are the opinionated rules every endpoint follows. They exist so that clients can rely on one consistent shape, one error model, and one pagination contract across the whole API.

## Response envelope

Every response - success or failure - is a JSON object with a top-level `success` boolean.

### Success

```json
{
  "success": true,
  "data": { "id": "…", "email": "user@example.com" },
  "meta": { "requestId": "0f8c…" }
}
```

- `data` holds the resource (or array of resources).
- `meta.requestId` is always present; it echoes the `x-request-id` correlation id for the request.
- List endpoints add `meta.pagination` (see below).

Produced by `sendSuccess(res, data, statusCode?, extraMeta?)` and `sendPaginated(res, page, statusCode?)` from `@/core/http/response`.

### Error

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": { "formErrors": [], "fieldErrors": { "email": ["Invalid email"] } },
    "requestId": "0f8c…"
  }
}
```

- `code` is a stable, machine-readable string - clients should branch on this, not on `message`.
- `message` is human-readable. For 5xx errors in production it is replaced with `"Internal server error"` so internals never leak.
- `details` is optional (present for validation failures and any error constructed with details).
- `requestId` lets you correlate the client-side failure with server logs.

All errors are serialized by a single error middleware (`errorHandler`, the last middleware in the stack). Application code throws `AppError` subclasses from `@/core/errors`; it never builds the error body by hand.

## Error-code table

| `code`             | HTTP | Thrown by                           | Meaning                                          |
| ------------------ | ---- | ----------------------------------- | ------------------------------------------------ |
| `BAD_REQUEST`      | 400  | `BadRequestError`                   | Malformed or semantically invalid request        |
| `UNAUTHORIZED`     | 401  | `UnauthorizedError`                 | Missing/invalid credentials or token             |
| `FORBIDDEN`        | 403  | `ForbiddenError`                    | Authenticated but lacks the required role        |
| `NOT_FOUND`        | 404  | `NotFoundError` (+ Prisma `P2025`)  | Resource does not exist; unmatched route         |
| `CONFLICT`         | 409  | `ConflictError` (+ Prisma `P2002`)  | Uniqueness/state conflict (e.g. email taken)     |
| `VALIDATION_ERROR` | 422  | `ValidationError` / `ZodError`      | Request failed schema validation; see `details`  |
| `RATE_LIMITED`     | 429  | `TooManyRequestsError`              | Rate limit exceeded; see `Retry-After` header    |
| `INTERNAL_ERROR`   | 500  | `AppError` default / unknown errors | Unexpected failure; message hidden in production |

The error middleware also recognizes:

- `ZodError` → `422 VALIDATION_ERROR` with `err.flatten()` as `details`.
- Prisma `P2002` (unique constraint) → `409 CONFLICT`.
- Prisma `P2025` (record not found) → `404 NOT_FOUND`.

## Versioning

The API is versioned in the URI. Every module router is mounted under `/api/v1`:

```
/api/v1/auth/...
/api/v1/users/...
```

Operational endpoints (`/health/live`, `/health/ready`) and the docs (`/docs`) are intentionally unversioned. When a breaking change is needed, introduce `/api/v2` alongside `/api/v1` rather than mutating the existing contract.

## Cursor pagination

List endpoints use **keyset (cursor) pagination**, never offsets. Offsets get slower as the table grows and can skip or duplicate rows under concurrent writes; a keyset cursor stays O(log n) and stable.

### Request

```
GET /api/v1/users?limit=20&cursor=eyJpZCI6IjEyMyJ9
```

- `limit` - integer, 1–100, default 20.
- `cursor` - opaque base64url token returned by the previous page. Omit it for the first page.

### Response

```json
{
  "success": true,
  "data": [{ "id": "…" }, { "id": "…" }],
  "meta": {
    "requestId": "0f8c…",
    "pagination": {
      "nextCursor": "eyJpZCI6IjQ1NiJ9",
      "hasMore": true,
      "limit": 20
    }
  }
}
```

- `nextCursor` - pass this back as `?cursor=…` to fetch the next page; `null` when there are no more rows.
- `hasMore` - `true` when another page exists.
- `limit` - echoes the effective page size.

The cursor is a base64url-encoded JSON keyset (e.g. `{ "id": "…" }`), produced by `encodeCursor` and read by `decodeCursor`. It is opaque to clients: do not parse or construct it. A malformed cursor decodes to `null` and is treated as the first page. Rows are ordered by `(createdAt desc, id desc)`, backed by the `@@index([createdAt, id])` on `User`; the repository fetches `limit + 1` rows to detect `hasMore`.

## Idempotency keys

Mutating requests can be retried safely with an idempotency key. Send the header on a `POST` or `PATCH`:

```
Idempotency-Key: 5f3b2c10-…
```

The first response (for any status below 500) is cached for 24 hours under `idem:<userId|ip>:<key>`. A duplicate request with the same key replays the stored status and body instead of running the handler again. Requests without the header, and `GET`/`DELETE`/etc., are unaffected. Server errors (5xx) are not cached, so a failed call can be genuinely retried.

## Validation strategy

Each module defines Zod schemas (`*.schema.ts`). Routes attach `validate({ body, query, params })`, which:

1. Parses each provided part with its schema.
2. Stores the parsed result on `req.validated` (`{ body, query, params }`).
3. Replaces `req.body` with the parsed body, so controllers read already-coerced, typed input.

On failure it forwards a `ValidationError` carrying `ZodError.flatten()` as `details`, which the error middleware renders as `422 VALIDATION_ERROR`. Controllers read `req.validated!.query` for query input and `req.body` for body input - they assume validation already ran.

## Request ids

Every request gets a correlation id. The `requestId` middleware uses an incoming `x-request-id` header (when ≤ 200 chars) or generates a UUID, stores it on `req.id`, and echoes it back in the `x-request-id` response header. The id appears in:

- `meta.requestId` of every success envelope,
- `error.requestId` of every error envelope,
- every structured log line (via pino-http).

This makes it trivial to trace one request from the client, through the logs, to the exact error.
