// @vitest-environment jsdom
import { createElement } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import type { AxiosInstance } from 'axios';
import { apiClient } from '../../frontend/src/utils/apiClient';
import { PatientsListPage } from '../../frontend/src/pages/PatientsListPage';
import { paginationHttp } from './helpers/pagination-http';
import { testPassword } from './helpers/syntheticSecrets';
import { auditDatabaseUrl } from './helpers/auditDatabase';

describe('actual nullable PostgreSQL directory response rendered over mock transport', () => {
  let db: Pool | undefined; let admin: Pool | undefined;
  let http: Awaited<ReturnType<typeof paginationHttp>> | undefined;
  let first: any; let last: any;
  const schema = `pagination_render_${randomUUID().replaceAll('-', '')}`;
  const client = (apiClient as unknown as { client: AxiosInstance }).client;
  const originalAdapter = client.defaults.adapter;

  beforeAll(async () => {
    const testUrl = process.env.TEST_DATABASE_URL;
    if (!testUrl) throw new Error('TEST_DATABASE_URL required; no skipped integration tests');
    const url = new URL(auditDatabaseUrl(testUrl));
    admin = new Pool({ connectionString: testUrl });
    await admin.query(`CREATE SCHEMA ${schema}`);
    console.log(`TRACK_F2_RENDER_SCHEMA=${schema}`);
    url.searchParams.set('options', `-c search_path=${schema} -c timezone=America/Los_Angeles`);
    process.env.DATABASE_URL = url.toString();
    db = (await import('../src/db')).default;
    await (await import('../src/db/schema')).initializeDatabase();
    await (await import('../src/db/migrations')).migrateDatabase();
    const app = (await import('../src/app')).createApp();
    http = await paginationHttp(app);
    const account = await http.post('/api/auth/register')
      .send({ email: 'pagination-render@example.invalid', password: testPassword }).expect(201);
    await db.query(`
      INSERT INTO patients(patient_id, first_name, created_at) VALUES ('SYN-NULL-RENDER', 'Synthetic nullable', NULL);
      INSERT INTO patients(patient_id, first_name, created_at)
        SELECT 'SYN-RENDER-' || i, 'Synthetic dated', TIMESTAMP '2031-11-02 01:30:00' FROM generate_series(1,50) i;
    `);
    const get = (cursor?: string) => http!.get('/api/patients/')
      .set('Authorization', `Bearer ${account.body.accessToken}`).query({ limit: 50, ...(cursor ? { cursor } : {}) });
    first = (await get().expect(200)).body;
    last = (await get(first.nextCursor).expect(200)).body;
    expect(first.patients).toHaveLength(50);
    expect(first.patients[0]).toMatchObject({ patient_id: 'SYN-NULL-RENDER', created_at: null });
    expect(first.hasMore).toBe(true);
    expect(last.patients).toHaveLength(1);
    expect(last).toMatchObject({ hasMore: false, nextCursor: null });
  });
  afterAll(async () => {
    await http?.close();
    await db?.end();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  });
  beforeEach(() => {
    sessionStorage.clear(); localStorage.clear();
    apiClient.setAccessToken('synthetic-render-transport-only');
  });
  afterEach(() => {
    cleanup();
    client.defaults.adapter = originalAdapter;
    vi.restoreAllMocks();
  });

  const transport = (pages: unknown[]) => {
    const calls: any[] = [];
    client.defaults.adapter = async config => {
      calls.push(config);
      if (config.url !== '/api/patients/' || !pages.length) throw new Error('Unexpected synthetic transport request');
      return { data: pages.shift(), status: 200, statusText: 'OK', headers: {}, config };
    };
    return calls;
  };

  it('renders the unmodified nullable DB row, then traverses the real backend continuation', async () => {
    const calls = transport([first, last]);
    render(createElement(PatientsListPage));
    await screen.findByText('ID: SYN-NULL-RENDER');
    expect(screen.getByText('Not available')).toBeInTheDocument();
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
    expect(screen.queryByText('No more records.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByText('No more records.');
    expect(screen.getAllByText(/^ID: SYN-/)).toHaveLength(51);
    expect(calls.map(c => c.params)).toEqual([
      { limit: 50, offset: undefined, cursor: undefined },
      { limit: 50, offset: undefined, cursor: first.nextCursor },
    ]);
  });

  it.each(['2031-02-29', '2031-04-31T12:00:00Z', 'invalid-calendar'])('renders an adversarial %s date as unavailable, not a rollover or crash', async created_at => {
    transport([{ ...first, patients: first.patients.map((p: any, i: number) => i === 0 ? { ...p, created_at } : p) }]);
    render(createElement(PatientsListPage));
    await screen.findByText('ID: SYN-NULL-RENDER');
    expect(screen.getByText('Not available')).toBeInTheDocument();
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
  });

  it.each(['false hasMore', 'missing hasMore', 'missing records'])('rejects real-response mutation: %s, then retries without advancing', async contradiction => {
    const invalid = structuredClone(first);
    if (contradiction === 'false hasMore') invalid.hasMore = false;
    if (contradiction === 'missing hasMore') delete invalid.hasMore;
    if (contradiction === 'missing records') delete invalid.patients;
    const calls = transport([invalid, first]);
    render(createElement(PatientsListPage));
    await screen.findByRole('alert');
    expect(screen.queryByText('No more records.')).not.toBeInTheDocument();
    expect(screen.queryByText('ID: SYN-NULL-RENDER')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading records' }));
    await screen.findByText('ID: SYN-NULL-RENDER');
    expect(calls).toHaveLength(2);
    expect(calls[1].params).toEqual(calls[0].params);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load more' })).toBeInTheDocument();
  });
});
