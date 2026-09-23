import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { AxiosInstance } from 'axios';
import { webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';
import { apiClient } from '../src/utils/apiClient';
import PatientHistory from '../src/components/PatientHistory';
import AppointmentsCard from '../src/components/AppointmentsCard';
import VisitsCard from '../src/components/VisitsCard';
import VitalsCard from '../src/components/VitalsCard';
import ScheduledVisitsPanel from '../src/components/ScheduledVisitsPanel';
import TemplatesAnalyticsPanel from '../src/components/TemplatesAnalyticsPanel';
import { PatientsListPage } from '../src/pages/PatientsListPage';
import { validateHistoryPage } from '../src/utils/pagination';

const deferred = () => {
  let resolve!: (value: any) => void; let reject!: (value: unknown) => void;
  const promise = new Promise<any>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const row = (id: number) => ({
  id, patient_id: `SYN-${id}`, first_name: `SYNTHETIC-${id}`, last_name: '',
  note_text: `SYNTHETIC-${id}`, note_date: '2031-11-02', created_at: '2031-11-02T01:30:00',
  appointment_type: `SYNTHETIC-${id}`, appointment_date: '2031-11-02T01:30:00', status: 'scheduled',
  visit_type: 'Synthetic visit', visit_date: '2031-11-02T01:30:00', diagnosis: `SYNTHETIC-${id}`,
  notes: `SYNTHETIC-${id}`, recorded_date: '2031-11-02T01:30:00', temperature: `SYNTHETIC-${id}`, is_active: true,
});
const cursorToken = (label: string) => btoa(label).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const response = (field: string, ids: number[], cursor: string | null = null) => ({
  data: { [field]: ids.map(row), hasMore: cursor !== null, nextCursor: cursor === null ? null : cursorToken(cursor) },
});
const cases = [
  { name: 'notes', Component: PatientHistory, method: 'getNoteHistory', field: 'notes', limit: 30 },
  { name: 'appointments', Component: AppointmentsCard, method: 'getAppointmentHistory', field: 'appointments', limit: 30 },
  { name: 'visits', Component: VisitsCard, method: 'getVisitHistory', field: 'visits', limit: 30 },
  { name: 'vitals', Component: VitalsCard, method: 'getVitalsHistory', field: 'vitalSigns', limit: 20 },
  { name: 'scheduled', Component: ScheduledVisitsPanel, method: 'getVisitHistory', field: 'visits', limit: 20 },
  { name: 'analytics', Component: TemplatesAnalyticsPanel, method: 'getVitalsHistory', field: 'vitalSigns', limit: 10 },
  { name: 'directory', Component: (_props: { patientId: string }) => <PatientsListPage />, method: 'getPatients', field: 'patients', limit: 50 },
] as const;
const revealVitals = (name: string) => { if (name === 'vitals') fireEvent.click(screen.getByRole('button', { name: /Show.*Vitals History/ })); };
const marker = (id: number) => new RegExp(`SYNTHETIC-${id}\\b`);

beforeEach(() => {
  sessionStorage.clear(); localStorage.clear();
  apiClient.setAccessToken('synthetic-pagination-session');
  vi.spyOn(apiClient, 'getNoteHistory').mockResolvedValue(response('notes', []) as any);
  vi.spyOn(apiClient, 'getAppointmentHistory').mockResolvedValue(response('appointments', []) as any);
  vi.spyOn(apiClient, 'getVisitHistory').mockResolvedValue(response('visits', []) as any);
  vi.spyOn(apiClient, 'getVitalsHistory').mockResolvedValue(response('vitalSigns', []) as any);
  vi.spyOn(apiClient, 'getPatients').mockResolvedValue(response('patients', []) as any);
  vi.spyOn(apiClient, 'getLatestVitals').mockResolvedValue({ data: { vitalSigns: null } } as any);
  vi.spyOn(apiClient, 'getPatientTrends').mockResolvedValue({ data: { trends: { totalNotes: 0 } } } as any);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe.each(cases)('$name pagination display', c => {
  it('renders >100 records across pages without five-row truncation or duplicate IDs', async () => {
    const get = vi.mocked(apiClient[c.method]);
    get.mockResolvedValueOnce(response(c.field, Array.from({ length: 100 }, (_, i) => i + 1), 'cursor-100') as any)
      .mockResolvedValueOnce(response(c.field, [100, ...Array.from({ length: 31 }, (_, i) => i + 101)]) as any);
    render(<c.Component patientId="SYN-A" />); revealVitals(c.name);
    const overlappingRowMarkers = (await screen.findAllByText(marker(100))).length;
    expect(overlappingRowMarkers).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByText('No more records.');
    expect(screen.getAllByText(marker(1)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(marker(131)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(marker(100))).toHaveLength(overlappingRowMarkers);
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(2);
    if (c.name === 'directory') expect(get.mock.calls[1]).toEqual([50, undefined, cursorToken('cursor-100')]);
    else if (c.name === 'scheduled') expect(get.mock.calls[1]).toEqual(['SYN-A', 20, cursorToken('cursor-100'), 'upcoming']);
    else expect(get.mock.calls[1]).toEqual(['SYN-A', c.limit, cursorToken('cursor-100')]);
    // Two render fields in some cards intentionally share the marker, but no
    // React duplicate-key warning or duplicated row is caused by overlapping pages.
  });

  it('keeps loaded records on error, retries the same cursor, and disables duplicate load-more requests', async () => {
    const get = vi.mocked(apiClient[c.method]); const pending = deferred(); const retry = deferred();
    get.mockResolvedValueOnce(response(c.field, [1, 6], 'cursor-6') as any)
      .mockReturnValueOnce(pending.promise).mockReturnValueOnce(retry.promise);
    render(<c.Component patientId="SYN-A" />); revealVitals(c.name);
    await screen.findByRole('button', { name: 'Load more' });
    const more = screen.getByRole('button', { name: 'Load more' });
    fireEvent.click(more); fireEvent.click(more);
    expect(more).toBeDisabled(); expect(get).toHaveBeenCalledTimes(2);
    expect(screen.getAllByText(marker(6)).length).toBeGreaterThan(0);
    expect(screen.getByText('Loading records...')).toBeInTheDocument();
    await act(async () => pending.reject({ response: { data: { error: 'SENSITIVE_SERVER_DETAIL' } } }));
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load records');
    expect(screen.queryByText('SENSITIVE_SERVER_DETAIL')).not.toBeInTheDocument();
    expect(screen.queryByText('No more records.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading records' }));
    await act(async () => retry.resolve(response(c.field, [7])));
    expect(get.mock.calls[2]).toEqual(get.mock.calls[1]);
    expect(screen.getAllByText(marker(6)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(marker(7)).length).toBeGreaterThan(0);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('No more records.')).toBeInTheDocument();
  });

  it('shows initial loading/error/retry and distinguishes an empty successful page', async () => {
    const get = vi.mocked(apiClient[c.method]); const pending = deferred();
    get.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(response(c.field, []) as any);
    render(<c.Component patientId="SYN-A" />); revealVitals(c.name);
    expect(screen.getByText('Loading records...')).toBeInTheDocument();
    expect(screen.queryByText('No more records.')).not.toBeInTheDocument();
    await act(async () => pending.reject(new Error('synthetic network failure')));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading records' }));
    await screen.findByText('No more records.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each(['resolve', 'reject'] as const)('new-data reset discards stale continuation %s', async outcome => {
    const get = vi.mocked(apiClient[c.method]); const pending = deferred();
    get.mockResolvedValueOnce(response(c.field, [1], 'old-cursor') as any).mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(response(c.field, [901]) as any);
    render(<c.Component patientId="SYN-A" />); revealVitals(c.name);
    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));
    act(() => window.dispatchEvent(new Event('clinical-data-updated')));
    await screen.findByText('No more records.');
    await act(async () => outcome === 'resolve' ? pending.resolve(response(c.field, [902], 'obsolete')) : pending.reject(new Error('old page')));
    expect(screen.getAllByText(marker(901)).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(marker(1))).toHaveLength(0);
    expect(screen.queryAllByText(marker(902))).toHaveLength(0);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(get.mock.calls[2][2]).toBeUndefined();
  });

  it('explicit refresh restarts without a cursor', async () => {
    const get = vi.mocked(apiClient[c.method]);
    get.mockResolvedValueOnce(response(c.field, [1], 'old') as any).mockResolvedValueOnce(response(c.field, [2]) as any);
    render(<c.Component patientId="SYN-A" />); revealVitals(c.name);
    await screen.findByRole('button', { name: 'Load more' });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh records' }));
    await screen.findByText('No more records.');
    expect(screen.queryAllByText(marker(1))).toHaveLength(0);
    expect(screen.getAllByText(marker(2)).length).toBeGreaterThan(0);
    expect(get.mock.calls[1][2]).toBeUndefined();
  });
});

describe.each(cases.filter(c => c.name !== 'directory'))('$name patient isolation', c => {
  it.each(['resolve', 'reject'] as const)('ignores late A %s after B is selected', async outcome => {
    const get = vi.mocked(apiClient[c.method]); const pending = deferred();
    get.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(response(c.field, [202]) as any);
    const view = render(<c.Component patientId="SYN-A" />); revealVitals(c.name);
    view.rerender(<c.Component patientId="SYN-B" />);
    await screen.findByText('No more records.');
    await act(async () => outcome === 'resolve' ? pending.resolve(response(c.field, [101], 'A-cursor')) : pending.reject(new Error('A error')));
    expect(screen.queryAllByText(marker(101))).toHaveLength(0);
    expect(screen.getAllByText(marker(202)).length).toBeGreaterThan(0);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    expect(get.mock.calls[1][0]).toBe('SYN-B');
    expect(get.mock.calls[1][2]).toBeUndefined();
  });
});

it('changing the visit filter resets pagination and rejects an older filter response', async () => {
  const pending = deferred(); const get = vi.mocked(apiClient.getVisitHistory);
  get.mockResolvedValueOnce(response('visits', [1], 'upcoming-cursor') as any).mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce(response('visits', [2]) as any);
  render(<ScheduledVisitsPanel patientId="SYN-A" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));
  fireEvent.click(screen.getByRole('button', { name: 'Upcoming' }));
  await screen.findByText('No more records.');
  await act(async () => pending.resolve(response('visits', [3], 'obsolete')));
  expect(get.mock.calls[2]).toEqual(['SYN-A', 20, undefined, 'all']);
  expect(screen.queryAllByText(marker(3))).toHaveLength(0);
  expect(screen.getAllByText(marker(2)).length).toBeGreaterThan(0);
});

it('patient directory resets on session generation changes and suppresses old account rows', async () => {
  const pending = deferred(); const get = vi.mocked(apiClient.getPatients);
  get.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(response('patients', [2]) as any);
  const view = render(<PatientsListPage />);
  apiClient.setAccessToken('synthetic-new-account');
  view.rerender(<PatientsListPage />);
  await screen.findByText('No more records.');
  await act(async () => pending.resolve(response('patients', [1], 'old')));
  expect(screen.queryAllByText(marker(1))).toHaveLength(0);
  expect(screen.getAllByText(marker(2)).length).toBeGreaterThan(0);
});

it('latest vitals and analytics cannot display late A data after a patient switch', async () => {
  const latest = deferred(); const analytics = deferred();
  vi.mocked(apiClient.getLatestVitals).mockReturnValueOnce(latest.promise);
  vi.mocked(apiClient.getPatientTrends).mockReturnValueOnce(analytics.promise);
  const view = render(<><VitalsCard patientId="SYN-A" /><TemplatesAnalyticsPanel patientId="SYN-A" /></>);
  view.rerender(<><VitalsCard patientId="SYN-B" /><TemplatesAnalyticsPanel patientId="SYN-B" /></>);
  await act(async () => {
    latest.resolve({ data: { vitalSigns: { id: 1, recorded_date: '1999-01-01T00:00:00' } } });
    analytics.resolve({ data: { trends: { totalNotes: 999999 } } });
  });
  expect(screen.queryByText(/Latest:/)).not.toBeInTheDocument();
  expect(screen.queryByText(/999999/)).not.toBeInTheDocument();
});

it('does not claim completion when the server returns an unusable continuation', async () => {
  vi.mocked(apiClient.getNoteHistory).mockResolvedValueOnce({ data: { notes: [row(1)], hasMore: true, nextCursor: null } } as any);
  render(<PatientHistory patientId="SYN-A" />);
  await screen.findByRole('alert');
  expect(screen.queryByText('No more records.')).not.toBeInTheDocument();
});

const malformedPages = [
  { name: 'false hasMore with cursor', change: () => ({ hasMore: false }) },
  { name: 'missing hasMore with cursor', change: () => ({ hasMore: undefined }) },
  { name: 'string hasMore with cursor', change: () => ({ hasMore: 'false' }) },
  { name: 'numeric hasMore', change: () => ({ hasMore: 1 }) },
  { name: 'missing array with cursor', change: (field: string) => ({ [field]: undefined }) },
  { name: 'null array with cursor', change: (field: string) => ({ [field]: null }) },
  { name: 'object array with cursor', change: (field: string) => ({ [field]: {} }) },
  { name: 'empty array with cursor', change: (field: string) => ({ [field]: [] }) },
  { name: 'missing terminal array', change: (field: string) => ({ [field]: undefined, hasMore: false, nextCursor: null }) },
  { name: 'true hasMore with null cursor', change: () => ({ nextCursor: null }) },
  { name: 'true hasMore with missing cursor', change: () => ({ nextCursor: undefined }) },
  { name: 'terminal missing cursor', change: () => ({ hasMore: false, nextCursor: undefined }) },
  { name: 'terminal empty cursor', change: () => ({ hasMore: false, nextCursor: '' }) },
  { name: 'empty cursor', change: () => ({ nextCursor: '' }) },
  { name: 'numeric cursor', change: () => ({ nextCursor: 123 }) },
  { name: 'array cursor', change: () => ({ nextCursor: [cursorToken('candidate')] }) },
  { name: 'padded cursor', change: () => ({ nextCursor: 'Zg==' }) },
  { name: 'noncanonical trailing bits', change: () => ({ nextCursor: 'Zh' }) },
  { name: 'invalid base64 length', change: () => ({ nextCursor: 'A' }) },
  { name: 'invalid alphabet', change: () => ({ nextCursor: 'not a cursor!' }) },
  { name: 'oversized cursor', change: () => ({ nextCursor: 'A'.repeat(1025) }) },
  { name: 'null row', change: (field: string) => ({ [field]: [row(2), null] }) },
  { name: 'missing stable row ID', change: (field: string) => ({ [field]: [row(2), { ...row(3), id: undefined }] }) },
  { name: 'out of range row ID', change: (field: string) => ({ [field]: [row(2), { ...row(3), id: 2147483648 }] }) },
  { name: 'oversized page', change: (field: string) => ({ [field]: Array.from({ length: 101 }, (_, i) => row(i + 2)) }) },
];

describe.each(cases)('$name strict page contract', c => {
  describe.each(['initial', 'continuation'] as const)('%s response', stage => {
    it.each(malformedPages)('rejects $name atomically and retries the original boundary', async bad => {
      const get = vi.mocked(apiClient[c.method]);
      if (stage === 'continuation') get.mockResolvedValueOnce(response(c.field, [1], 'prior') as any);
      // Undefined properties are absent on the actual JSON wire, not merely
      // present as undefined. Keep candidate rows to detect partial commits.
      const data = JSON.parse(JSON.stringify({ ...response(c.field, [2], 'candidate').data, ...bad.change(c.field) }));
      get.mockResolvedValueOnce({ data } as any).mockResolvedValueOnce(response(c.field, [2]) as any);
      render(<c.Component patientId="SYN-A" />); revealVitals(c.name);
      if (stage === 'continuation') fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));
      await screen.findByRole('alert');
      expect(screen.queryByText('No more records.')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
      expect(screen.queryAllByText(marker(2))).toHaveLength(0);
      if (stage === 'continuation') expect(screen.getAllByText(marker(1)).length).toBeGreaterThan(0);
      const failedCall = get.mock.calls.at(-1);
      fireEvent.click(screen.getByRole('button', { name: 'Retry loading records' }));
      await screen.findByText('No more records.');
      expect(get.mock.calls.at(-1)).toEqual(failedCall);
      expect(get).toHaveBeenCalledTimes(stage === 'initial' ? 2 : 3);
      expect(screen.getAllByText(marker(2)).length).toBeGreaterThan(0);
      if (stage === 'continuation') expect(screen.getAllByText(marker(1)).length).toBeGreaterThan(0);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  it('rejects a repeated boundary without accepting its rows and retries it', async () => {
    const get = vi.mocked(apiClient[c.method]);
    get.mockResolvedValueOnce(response(c.field, [1], 'prior') as any)
      .mockResolvedValueOnce(response(c.field, [2], 'prior') as any).mockResolvedValueOnce(response(c.field, [2]) as any);
    render(<c.Component patientId="SYN-A" />); revealVitals(c.name);
    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));
    await screen.findByRole('alert');
    expect(screen.queryAllByText(marker(2))).toHaveLength(0);
    expect(screen.queryByText('No more records.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading records' }));
    await screen.findByText('No more records.');
    expect(get.mock.calls[2]).toEqual(get.mock.calls[1]);
    expect(screen.getAllByText(marker(1)).length).toBeGreaterThan(0);
  });

  it('retains prior rows on invalid refresh and retries page one, not the saved continuation', async () => {
    const get = vi.mocked(apiClient[c.method]); const pending = deferred();
    get.mockResolvedValueOnce(response(c.field, [1], 'prior') as any)
      .mockResolvedValueOnce({ data: { [c.field]: [row(2)], hasMore: false, nextCursor: cursorToken('candidate') } } as any)
      .mockReturnValueOnce(pending.promise);
    render(<c.Component patientId="SYN-A" />); revealVitals(c.name);
    await screen.findByRole('button', { name: 'Load more' });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh records' }));
    await screen.findByRole('alert');
    expect(screen.getAllByText(marker(1)).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(marker(2))).toHaveLength(0);
    expect(screen.queryByText('No more records.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading records' }));
    expect(get.mock.calls[2]).toEqual(get.mock.calls[0]);
    expect(get.mock.calls[2][2]).toBeUndefined();
    expect(screen.getAllByText(marker(1)).length).toBeGreaterThan(0);
    await act(async () => pending.resolve(response(c.field, [3])));
    await screen.findByText('No more records.');
    expect(screen.queryAllByText(marker(1))).toHaveLength(0);
    expect(screen.getAllByText(marker(3)).length).toBeGreaterThan(0);
  });
});

describe('opaque cursor transport and envelope validation', () => {
  it.each([null, undefined, [], 'invalid', 42])('rejects a non-object envelope: %s', data => {
    expect(() => validateHistoryPage(data, 'records')).toThrow('Invalid records page');
  });
  it.each([0, -1, 1.5, '1', null, undefined])('rejects a malformed stable ID: %s', id => {
    expect(() => validateHistoryPage({ records: [{ id }], hasMore: false, nextCursor: null }, 'records')).toThrow();
  });
  it('accepts a canonical 1024-character opaque cursor unchanged and explicit terminal pages', () => {
    const nextCursor = cursorToken('a'.repeat(768));
    expect(nextCursor).toHaveLength(1024);
    expect(validateHistoryPage({ records: [{ id: 2147483647 }], hasMore: true, nextCursor }, 'records').nextCursor).toBe(nextCursor);
    expect(validateHistoryPage({ records: [], hasMore: false, nextCursor: null }, 'records')).toEqual({ rows: [], hasMore: false, nextCursor: null });
  });
});

describe('directory calendar display', () => {
  it.each([null, undefined, '', 'not-a-date', '2031-02-29', '2000-02-30', '1900-02-29', '2031-04-31T12:00:00Z',
    '2031-13-01', '2031-00-10', '2031-01-00', '0000-01-01', '2031-01-01T99:00:00Z', 42, {}])('safely marks unavailable creation dates: %s', async created_at => {
    vi.mocked(apiClient.getPatients).mockResolvedValueOnce({ data: { patients: [{ ...row(1), created_at }], hasMore: false, nextCursor: null } } as any);
    render(<PatientsListPage />);
    await screen.findByText('No more records.');
    expect(screen.getByText('Created:').parentElement).toHaveTextContent('Created: Not available');
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
    expect(screen.getAllByText(marker(1)).length).toBeGreaterThan(0);
  });
  it.each(['2000-02-29', '2024-02-29T23:30:00.123Z', '2031-11-02T01:30:00', '2031-01-01T23:30:00-08:00'])('preserves the existing valid display for %s', async created_at => {
    vi.mocked(apiClient.getPatients).mockResolvedValueOnce({ data: { patients: [{ ...row(1), created_at }], hasMore: false, nextCursor: null } } as any);
    render(<PatientsListPage />);
    await screen.findByText('No more records.');
    const expected = new Date(created_at.length === 10 ? `${created_at}T00:00:00` : created_at).toLocaleDateString();
    expect(screen.getByText('Created:').parentElement).toHaveTextContent(`Created: ${expected}`);
  });
});

it.each([
  { Component: AppointmentsCard, method: 'createAppointment', button: 'Schedule' },
  { Component: VisitsCard, method: 'createVisit', button: 'Save Visit' },
  { Component: VitalsCard, method: 'recordVitals', button: 'Record Vitals' },
] as const)('$method success refreshes related history displays without changing submission keys', async c => {
  vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('TextEncoder', TextEncoder);
  const save = vi.spyOn(apiClient, c.method).mockResolvedValue({ data: {} } as any);
  vi.mocked(apiClient.getNoteHistory).mockResolvedValueOnce(response('notes', [1], 'old-notes') as any)
    .mockResolvedValueOnce(response('notes', [2]) as any);
  render(<><c.Component patientId="SYN-A" /><PatientHistory patientId="SYN-A" /></>);
  await screen.findByRole('button', { name: 'Load more' });
  fireEvent.submit(screen.getByRole('button', { name: c.button }).closest('form')!);
  await screen.findAllByText(marker(2));
  expect(screen.queryAllByText(marker(1))).toHaveLength(0);
  expect(save.mock.calls).toHaveLength(1);
  expect(save.mock.calls[0].at(-1)).toMatch(/^[a-f0-9-]{36}$/);
  expect(vi.mocked(apiClient.getNoteHistory).mock.calls[1]).toEqual(['SYN-A', 30, undefined]);
});

it('client signatures forward optional cursors without manufacturing an offset or altering session headers', async () => {
  // Restore only GET spies; use the real Axios adapter, not an HTTP service.
  for (const method of ['getPatients', 'getNoteHistory', 'getVitalsHistory', 'getVisitHistory', 'getAppointmentHistory'] as const) vi.mocked(apiClient[method]).mockRestore();
  const client = (apiClient as unknown as { client: AxiosInstance }).client;
  const original = client.defaults.adapter;
  const calls: any[] = [];
  client.defaults.adapter = async config => { calls.push(config); return { data: {}, status: 200, statusText: 'OK', headers: {}, config }; };
  try {
    await apiClient.getPatients(20, undefined, 'directory-cursor');
    await apiClient.getPatients(20, 40);
    await apiClient.getNoteHistory('SYN', 10, 'notes-cursor');
    await apiClient.getVitalsHistory('SYN', 11, 'vitals-cursor');
    await apiClient.getAppointmentHistory('SYN', 12, 'appointments-cursor');
    await apiClient.getVisitHistory('SYN', 13, 'visits-cursor', 'upcoming');
    expect(calls.map(c => c.params)).toEqual([
      { limit: 20, offset: undefined, cursor: 'directory-cursor' }, { limit: 20, offset: 40, cursor: undefined },
      { limit: 10, cursor: 'notes-cursor' }, { limit: 11, cursor: 'vitals-cursor' },
      { limit: 12, cursor: 'appointments-cursor' }, { limit: 13, cursor: 'visits-cursor', filter: 'upcoming' },
    ]);
    expect(calls.every(c => c.headers.Authorization === 'Bearer synthetic-pagination-session')).toBe(true);
    expect(calls.every(c => c._generation === apiClient.getSessionGeneration())).toBe(true);
  } finally { client.defaults.adapter = original; }
});
