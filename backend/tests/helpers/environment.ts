import { vi } from 'vitest';

// Test settings come only from the explicit worker environment. Do not read any
// developer's ignored dotenv file, including when a unit imports config early.
vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));
