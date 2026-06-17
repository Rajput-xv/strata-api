# Template Guide

This guide shows how to (a) reuse this template for a brand-new project, and (b) add a new feature module that mirrors the established `users` patterns - cursor list, cache-aside, validation, and role-based access control.

## (a) Reuse this template for a new project

1. **Copy / clone** the repository to your new project directory and re-point the git remote.
2. **Rename the project** in `package.json` (`name`, `description`). The internal log tag lives in `src/core/logger/logger.ts` as `base: { service: 'strata-api' }` - change it to your service name if you like.
3. **Install dependencies:** `npm i`.
4. **Configure env:** `cp .env.example .env`, then set real values - especially `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `DATABASE_URL`, and `REDIS_URL`.
5. **Start infrastructure:** `docker compose up -d`.
6. **Model your data** in `prisma/schema.prisma`, then `npm run prisma:migrate`.
7. **Run it:** `npm run dev` (and `npm run worker` if you use queues).
8. **Build features** as vertical modules under `src/modules/<feature>/`, following the six steps below.

The kernel (`src/core`), infra (`src/infra`), middleware (`src/middleware`), and wiring (`src/app.ts`, `src/server.ts`) are meant to be reused as-is. Most of your work happens in `prisma/schema.prisma` and `src/modules/`.

## (b) Add a new feature module in 6 steps

Each module is a self-contained vertical slice. The dependency flow inside a module is:

```
schema.ts → repository.ts → service.ts → controller.ts → routes.ts → register in src/routes/index.ts
   (Zod)      (Prisma)      (business)     (HTTP edge)     (wiring)        (mount under /api/v1)
```

The steps below build a fictional **`products`** module that mirrors `users`: a cursor-paginated list, a cached `getById`, Zod validation, and ADMIN-only writes.

### Step 0 - model the data (Prisma)

Add the model to `prisma/schema.prisma`, including the keyset-pagination index, then migrate.

```prisma
model Product {
  id          String   @id @default(uuid())
  name        String
  priceCents  Int
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // Keyset pagination index: order by (createdAt desc, id desc)
  @@index([createdAt, id])
}
```

```bash
npm run prisma:migrate
```

### Step 1 - `schema.ts` (Zod schemas + inferred types)

`src/modules/products/products.schema.ts`

```ts
import { z } from 'zod';

export const listProductsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export const createProductSchema = z.object({
  name: z.string().min(1).max(200),
  priceCents: z.coerce.number().int().min(0),
});

export const updateProductSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  priceCents: z.coerce.number().int().min(0).optional(),
});

export const productIdParam = z.object({ id: z.string().uuid() });

export type ListProductsQuery = z.infer<typeof listProductsQuery>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
```

### Step 2 - `repository.ts` (the only Prisma-facing layer)

`src/modules/products/products.repository.ts`

```ts
import { prisma } from '@/infra/db/prisma';
import type { Prisma, Product } from '@prisma/client';

/** All Product data access lives here - the only layer that talks to Prisma directly. */
export const productsRepository = {
  findById: (id: string) => prisma.product.findUnique({ where: { id } }),
  create: (data: Prisma.ProductCreateInput) => prisma.product.create({ data }),
  update: (id: string, data: Prisma.ProductUpdateInput) => prisma.product.update({ where: { id }, data }),
  delete: (id: string) => prisma.product.delete({ where: { id } }),

  /** Keyset pagination: fetch limit+1 rows to detect `hasMore`. */
  list: (limit: number, cursorId?: string): Promise<Product[]> =>
    prisma.product.findMany({
      take: limit + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
};
```

### Step 3 - `service.ts` (business logic: cache-aside + pagination)

Define a public type alongside (mirroring `users.types.ts`) so you never leak DB internals:

`src/modules/products/products.types.ts`

```ts
export interface PublicProduct {
  id: string;
  name: string;
  priceCents: number;
  createdAt: string;
  updatedAt: string;
}
```

`src/modules/products/products.service.ts`

```ts
import type { Product } from '@prisma/client';
import { productsRepository } from '@/modules/products/products.repository';
import { cache } from '@/infra/cache/cache.service';
import { encodeCursor, decodeCursor } from '@/core/pagination/cursor';
import { NotFoundError } from '@/core/errors';
import type { PublicProduct } from '@/modules/products/products.types';
import type { Paginated } from '@/core/pagination/types';
import type { CreateProductInput, UpdateProductInput } from '@/modules/products/products.schema';

const CACHE_TTL = 300;
const cacheKey = (id: string): string => `product:${id}`;

export function toPublicProduct(p: Product): PublicProduct {
  return {
    id: p.id,
    name: p.name,
    priceCents: p.priceCents,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export const productsService = {
  async getById(id: string): Promise<PublicProduct> {
    return cache.wrap(cacheKey(id), CACHE_TTL, async () => {
      const found = await productsRepository.findById(id);
      if (!found) throw new NotFoundError('Product not found');
      return toPublicProduct(found);
    });
  },

  async list(limit: number, cursor?: string): Promise<Paginated<PublicProduct>> {
    const decoded = cursor ? decodeCursor<{ id: string }>(cursor) : null;
    const rows = await productsRepository.list(limit, decoded?.id);
    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map(toPublicProduct);
    const last = items[items.length - 1];
    return {
      items,
      hasMore,
      limit,
      nextCursor: hasMore && last ? encodeCursor({ id: last.id }) : null,
    };
  },

  async create(input: CreateProductInput): Promise<PublicProduct> {
    const created = await productsRepository.create(input);
    return toPublicProduct(created);
  },

  async update(id: string, input: UpdateProductInput): Promise<PublicProduct> {
    const updated = await productsRepository.update(id, input);
    await cache.del(cacheKey(id));
    return toPublicProduct(updated);
  },

  async remove(id: string): Promise<void> {
    await productsRepository.delete(id);
    await cache.del(cacheKey(id));
  },
};
```

### Step 4 - `controller.ts` (thin HTTP edge)

`src/modules/products/products.controller.ts`

```ts
import type { Request, Response } from 'express';
import { asyncHandler } from '@/core/http/asyncHandler';
import { sendSuccess, sendPaginated } from '@/core/http/response';
import { HttpStatus } from '@/core/http/httpStatus';
import { productsService } from '@/modules/products/products.service';
import type {
  ListProductsQuery,
  CreateProductInput,
  UpdateProductInput,
} from '@/modules/products/products.schema';

export const productsController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const { limit, cursor } = req.validated!.query as ListProductsQuery;
    const page = await productsService.list(limit, cursor);
    sendPaginated(res, page);
  }),

  getOne: asyncHandler(async (req: Request, res: Response) => {
    const product = await productsService.getById(req.params.id);
    sendSuccess(res, product);
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const product = await productsService.create(req.body as CreateProductInput);
    sendSuccess(res, product, HttpStatus.CREATED);
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const product = await productsService.update(req.params.id, req.body as UpdateProductInput);
    sendSuccess(res, product);
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    await productsService.remove(req.params.id);
    res.status(HttpStatus.NO_CONTENT).send();
  }),
};
```

### Step 5 - `routes.ts` (HTTP surface + middleware)

`src/modules/products/products.routes.ts`

```ts
import { Router } from 'express';
import { productsController } from '@/modules/products/products.controller';
import { authenticate, authorize, validate } from '@/middleware';
import {
  listProductsQuery,
  createProductSchema,
  updateProductSchema,
  productIdParam,
} from '@/modules/products/products.schema';

export const productRoutes = Router();

productRoutes.use(authenticate);
productRoutes.get('/', validate({ query: listProductsQuery }), productsController.list);
productRoutes.get('/:id', validate({ params: productIdParam }), productsController.getOne);
productRoutes.post(
  '/',
  authorize('ADMIN'),
  validate({ body: createProductSchema }),
  productsController.create,
);
productRoutes.patch(
  '/:id',
  authorize('ADMIN'),
  validate({ params: productIdParam, body: updateProductSchema }),
  productsController.update,
);
productRoutes.delete(
  '/:id',
  authorize('ADMIN'),
  validate({ params: productIdParam }),
  productsController.remove,
);
```

### Step 6 - register the router

Mount the new router in `src/routes/index.ts` under `/api/v1`:

```ts
import { Router } from 'express';
import { authRoutes } from '@/modules/auth/auth.routes';
import { userRoutes } from '@/modules/users/users.routes';
import { productRoutes } from '@/modules/products/products.routes';

/** Aggregates all versioned API modules. Mounted under /api/v1 in app.ts. */
export const apiRouter = Router();
apiRouter.use('/auth', authRoutes);
apiRouter.use('/users', userRoutes);
apiRouter.use('/products', productRoutes);
```

Your endpoints are now live at `/api/v1/products`. Optionally document them in `docs/openapi.yaml` so they appear at `/docs`, and add unit tests under `tests/`.

## Patterns to keep

- **Throw, don't format.** Services and controllers throw `AppError` subclasses (`NotFoundError`, `ConflictError`, …). The error middleware renders the envelope.
- **Wrap every async handler** in `asyncHandler`.
- **Validate at the edge** with `validate({ body, query, params })`; read `req.validated!.query` and `req.body` in the controller.
- **Cache reads, invalidate on write.** Wrap `getById` with `cache.wrap`, and `cache.del` the key on `update`/`remove`.
- **Paginate by keyset**, never offset; add `@@index([createdAt, id])` and fetch `limit + 1`.
- **Gate writes with `authorize('ADMIN')`** (or whatever roles apply), after `authenticate`.
- **Keep Prisma in the repository.** No other layer imports `prisma` for that module's tables.
