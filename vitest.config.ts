import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    clearMocks: true,
    // Injected before any module loads so `@/config`'s Zod validation passes
    // without a real .env. Infra (Postgres/Redis) is mocked in the tests.
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'fatal',
      DATABASE_URL: 'postgresql://app:app@localhost:5433/app?schema=public',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'test_access_secret_at_least_16_chars',
      JWT_REFRESH_SECRET: 'test_refresh_secret_at_least_16_chars',
      JWT_ACCESS_TTL: '15m',
      JWT_REFRESH_TTL: '7d',
      BCRYPT_ROUNDS: '8',
      RATE_LIMIT_WINDOW_S: '60',
      RATE_LIMIT_MAX: '100',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      // Composition root, generated types, and infra adapters aren't unit-testable.
      exclude: [
        'src/server.ts',
        'src/worker.ts',
        'src/**/*.d.ts',
        'src/**/*.types.ts',
        'src/config/**',
        'src/core/types/**',
        'src/core/logger/**',
        'src/infra/db/**',
        'src/infra/cache/redis.ts',
        'src/infra/queue/**',
      ],
    },
  },
});
