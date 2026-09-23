import { randomBytes } from 'node:crypto';

// Shared within a test worker so registration/login pairs use the same value.
// Fresh on each run; no credential material is persisted or printed.
export const testPassword = randomBytes(24).toString('base64url');
