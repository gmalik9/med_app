import { randomBytes } from 'node:crypto';

// In-memory only: never derive credentials from published fixture labels.
export const syntheticSecret = () => randomBytes(32).toString('base64url');
export const syntheticDatabaseUrl = () => `postgresql://audit:${syntheticSecret()}@127.0.0.1:55439/medapp_audit`;
