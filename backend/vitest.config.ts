import { defineConfig } from 'vitest/config';
import { randomBytes } from 'node:crypto';
export default defineConfig({ envDir: false, test: { include: ['tests/**/*.test.ts'], setupFiles: ['tests/helpers/environment.ts'], testTimeout: 30000, hookTimeout: 60000, fileParallelism: false,
  env: { NODE_ENV: 'test', SEED_DATABASE: 'false', ENABLE_EXTERNAL_AI: 'false', GEMINI_API_KEY: '',
    JWT_SECRET: randomBytes(48).toString('base64url'),
    JWT_REFRESH_SECRET: randomBytes(48).toString('base64url') } } });
