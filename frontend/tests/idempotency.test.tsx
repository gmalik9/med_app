import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';
import { AxiosError, type AxiosInstance } from 'axios';
import { useIdempotentSubmission } from '../src/hooks/useIdempotentSubmission';
import { apiClient } from '../src/utils/apiClient';
import AppointmentsCard from '../src/components/AppointmentsCard';
import VisitsCard from '../src/components/VisitsCard';
import VitalsCard from '../src/components/VitalsCard';

const deferred = () => {
  let resolve!: (value?: unknown) => void; let reject!: (error: Error) => void;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
beforeEach(() => {
  sessionStorage.clear(); localStorage.clear();
  vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('TextEncoder', TextEncoder);
  apiClient.setAccessToken('synthetic-old');
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('same-intent submission keys', () => {
  it('reuses only the uncertain key, persists no draft, then generates a new key after success', async () => {
    const { result } = renderHook(() => useIdempotentSubmission('visit', 'SYN-PATIENT', { diagnosis: 'SYNTHETIC_BODY' }));
    const send = vi.fn().mockRejectedValueOnce(new Error('lost response')).mockResolvedValue({});
    await act(async () => { await expect(result.current.submit(send)).rejects.toThrow('lost response'); });
    const key = send.mock.calls[0][0];
    expect(key).toMatch(/^[a-f0-9-]{36}$/);
    expect(sessionStorage.getItem('clinical-write:visit')).toBe(key);
    expect(JSON.stringify({ ...sessionStorage })).not.toMatch(/SYN-PATIENT|SYNTHETIC_BODY|diagnosis/);
    expect(localStorage.length).toBe(0);
    await act(async () => { expect(await result.current.submit(send)).toBe(true); });
    expect(send.mock.calls[1][0]).toBe(key);
    expect(sessionStorage.getItem('clinical-write:visit')).toBeNull();
    await act(async () => { await result.current.submit(send); });
    expect(send.mock.calls[2][0]).not.toBe(key);
  });
  it('blocks changed fields after uncertainty and allows an explicit retry when original fields are restored', async () => {
    const { result, rerender } = renderHook(({ body }) => useIdempotentSubmission('visit', 'SYN', body), { initialProps: { body: { diagnosis: 'original' } } });
    const send = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValue({});
    await act(async () => { await result.current.submit(send).catch(() => {}); });
    rerender({ body: { diagnosis: 'edited' } });
    await act(async () => { expect(await result.current.submit(send)).toBe(false); });
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.current.notice).toContain('Restore the original');
    rerender({ body: { diagnosis: 'original' } });
    await act(async () => { await result.current.submit(send); });
    expect(send.mock.calls[1][0]).toBe(send.mock.calls[0][0]);
  });
  it('does not clear edits made while a request was pending and excludes duplicate clicks', async () => {
    const { result, rerender } = renderHook(({ body }) => useIdempotentSubmission('visit', 'SYN', body), { initialProps: { body: { diagnosis: 'original' } } });
    const flight = deferred(); const send = vi.fn(() => flight.promise);
    let first!: Promise<boolean>;
    act(() => { first = result.current.submit(send); });
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    await act(async () => { expect(await result.current.submit(send)).toBe(false); });
    rerender({ body: { diagnosis: 'new edit' } });
    await act(async () => { flight.resolve(); expect(await first).toBe(false); });
    expect(result.current.notice).toContain('kept');
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('fails closed after remount/reload without a matching in-memory fingerprint', async () => {
    const old = renderHook(() => useIdempotentSubmission('visit', 'SYN', { diagnosis: 'body' }));
    await act(async () => { await old.result.current.submit(() => Promise.reject(new Error('lost'))).catch(() => {}); });
    const key = sessionStorage.getItem('clinical-write:visit'); old.unmount();
    const next = renderHook(() => useIdempotentSubmission('visit', 'SYN', { diagnosis: 'body' }));
    const send = vi.fn();
    await act(async () => { expect(await next.result.current.submit(send)).toBe(false); });
    expect(send).not.toHaveBeenCalled(); expect(sessionStorage.getItem('clinical-write:visit')).toBe(key);
    expect(next.result.current.notice).toContain('cannot be identified');
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    act(() => next.result.current.acknowledgeReconciled());
    expect(sessionStorage.getItem('clinical-write:visit')).toBe(key);
    act(() => next.result.current.acknowledgeReconciled());
    await act(async () => { await next.result.current.submit(send); });
    expect(send.mock.calls[0][0]).not.toBe(key);
  });
  it.each(['patient', 'identity'])('does not replay an uncertain intent after %s changes', async change => {
    const hook = renderHook(({ patient }) => useIdempotentSubmission('visit', patient, { diagnosis: 'body' }), { initialProps: { patient: 'SYN-A' } });
    const send = vi.fn().mockRejectedValue(new Error('lost'));
    await act(async () => { await hook.result.current.submit(send).catch(() => {}); });
    if (change === 'patient') hook.rerender({ patient: 'SYN-B' });
    else { apiClient.setAccessToken('new-identity'); hook.rerender({ patient: 'SYN-A' }); }
    await act(async () => { expect(await hook.result.current.submit(send)).toBe(false); });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('suppresses stale patient failure callbacks and retains the unresolved key', async () => {
    const hook = renderHook(({ patient }) => useIdempotentSubmission('visit', patient, { diagnosis: 'body' }), { initialProps: { patient: 'SYN-A' } });
    const flight = deferred(); const send = vi.fn<(key: string) => Promise<unknown>>(() => flight.promise); let pending!: Promise<boolean>;
    act(() => { pending = hook.result.current.submit(send); });
    await waitFor(() => expect(send).toHaveBeenCalled());
    hook.rerender({ patient: 'SYN-B' });
    await act(async () => { flight.reject(new Error('old patient')); expect(await pending).toBe(false); });
    expect(sessionStorage.getItem('clinical-write:visit')).toBe(send.mock.calls[0][0]);
  });
  it('fails before HTTP when durable key bookkeeping cannot be written', async () => {
    const hook = renderHook(() => useIdempotentSubmission('visit', 'SYN', {}));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage unavailable'); });
    const send = vi.fn();
    await act(async () => { await expect(hook.result.current.submit(send)).rejects.toThrow('storage unavailable'); });
    expect(send).not.toHaveBeenCalled();
  });
  it('rechecks identity after asynchronous fingerprinting before dispatch', async () => {
    const hashing = deferred();
    vi.spyOn(crypto.subtle, 'digest').mockReturnValue(hashing.promise as Promise<ArrayBuffer>);
    const hook = renderHook(() => useIdempotentSubmission('visit', 'SYN', { diagnosis: 'old session' }));
    const send = vi.fn(); let pending!: Promise<boolean>;
    act(() => { pending = hook.result.current.submit(send); });
    apiClient.setAccessToken('new-identity-during-hash');
    await act(async () => { hashing.resolve(new Uint8Array(32).buffer); expect(await pending).toBe(false); });
    expect(send).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('clinical-write:visit')).toBeNull();
  });
});

describe('write card integration', () => {
  const cases = [
    { Component: AppointmentsCard, method: 'createAppointment' as const, label: 'Schedule', input: 'Reason', keyIndex: 4, operation: 'appointment' },
    { Component: VisitsCard, method: 'createVisit' as const, label: 'Save Visit', input: 'Diagnosis', keyIndex: 2, operation: 'visit' },
    { Component: VitalsCard, method: 'recordVitals' as const, label: 'Record Vitals', input: 'Heart Rate', keyIndex: 2, operation: 'vitals' },
  ];
  beforeEach(() => {
    vi.spyOn(apiClient, 'getAppointmentHistory').mockResolvedValue({ data: { appointments: [], hasMore: false, nextCursor: null } } as any);
    vi.spyOn(apiClient, 'getVisitHistory').mockResolvedValue({ data: { visits: [], hasMore: false, nextCursor: null } } as any);
    vi.spyOn(apiClient, 'getLatestVitals').mockResolvedValue({ data: { vitalSigns: null } } as any);
    vi.spyOn(apiClient, 'getVitalsHistory').mockResolvedValue({ data: { vitalSigns: [], hasMore: false, nextCursor: null } } as any);
  });
  async function renderReadyCard({ Component, method }: (typeof cases)[number]) {
    render(<Component patientId="SYN" />);
    if (method === 'recordVitals') fireEvent.click(screen.getByRole('button', { name: /Show.*Vitals History/ }));
    await screen.findByText('No more records.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  }
  for (const c of cases) {
    it(`${c.method} exposes explicit same-key retry after a lost response`, async () => {
      const send = vi.spyOn(apiClient, c.method).mockRejectedValueOnce(new Error('lost')).mockResolvedValue({ data: {} } as any);
      await renderReadyCard(c);
      fireEvent.change(screen.getByPlaceholderText(c.input), { target: { value: '73' } });
      fireEvent.submit(screen.getByRole('button', { name: c.label }).closest('form')!);
      await screen.findByRole('button', { name: 'Retry same submission' });
      const first = send.mock.calls[0][c.keyIndex];
      fireEvent.submit(screen.getByRole('button', { name: 'Retry same submission' }).closest('form')!);
      await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
      expect(send.mock.calls[1][c.keyIndex]).toBe(first);
      await waitFor(() => expect(screen.getByPlaceholderText(c.input)).toHaveValue(''));
      await screen.findByText('No more records.');
      expect(screen.getByRole('button', { name: c.label })).toBeEnabled();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(sessionStorage.getItem(`clinical-write:${c.operation}`)).toBeNull();
    });
    it(`${c.method} preserves edits made before the old successful response`, async () => {
      const flight = deferred(); const send = vi.spyOn(apiClient, c.method).mockImplementation(() => flight.promise as any);
      await renderReadyCard(c);
      const submitButton = screen.getByRole('button', { name: c.label });
      fireEvent.change(screen.getByPlaceholderText(c.input), { target: { value: '73' } });
      fireEvent.submit(submitButton.closest('form')!);
      await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
      expect(submitButton).toBeDisabled();
      fireEvent.change(screen.getByPlaceholderText(c.input), { target: { value: '74' } });
      await act(async () => { flight.resolve({ data: {} }); });
      // Resolving HTTP does not settle the native WebCrypto digest for the edit.
      // Wait for the actual submission boundary, not just a partial act flush.
      await waitFor(() => expect(submitButton).toBeEnabled());
      expect(screen.getByPlaceholderText(c.input)).toHaveValue('74');
      expect(screen.getByRole('status')).toHaveTextContent('kept');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Retry same submission' })).not.toBeInTheDocument();
      expect(sessionStorage.getItem(`clinical-write:${c.operation}`)).toBeNull();
      expect(send).toHaveBeenCalledTimes(1);
    });
  }

  it('createVisit waits for the edited fingerprint before settling a confirmed write', async () => {
    const flight = deferred();
    const send = vi.spyOn(apiClient, 'createVisit').mockImplementation(() => flight.promise as any);
    render(<VisitsCard patientId="SYN" />);
    await screen.findByText('No more records.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Diagnosis'), { target: { value: '73' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Save Visit' }).closest('form')!);
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));

    // Delay only the new edit's digest; keep the real WebCrypto fingerprint.
    const editedDigest = deferred();
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    const hashing = vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (algorithm, data) => {
      const result = await digest(algorithm, data);
      await editedDigest.promise;
      return result;
    });
    fireEvent.change(screen.getByPlaceholderText('Diagnosis'), { target: { value: '74' } });
    expect(hashing).toHaveBeenCalledTimes(1);
    await act(async () => { flight.resolve({ data: {} }); });
    expect(send.mock.calls[0][1]).toMatchObject({ diagnosis: '73' });
    expect(sessionStorage.getItem('clinical-write:visit')).toBeNull();
    expect(screen.getByPlaceholderText('Diagnosis')).toHaveValue('74');
    expect(screen.getByRole('button', { name: 'Save Visit' })).toBeDisabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    await act(async () => { editedDigest.resolve(); });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save Visit' })).toBeEnabled());
    expect(screen.getByPlaceholderText('Diagnosis')).toHaveValue('74');
    expect(screen.getByRole('status')).toHaveTextContent('The submitted version was saved. Current edits were not submitted and have been kept.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('createVisit keeps a confirmed write separate from a failed history refresh', async () => {
    const refresh = deferred();
    const history = vi.mocked(apiClient.getVisitHistory)
      .mockImplementationOnce(() => Promise.resolve({ data: { visits: [], hasMore: false, nextCursor: null } } as any))
      .mockImplementationOnce(() => refresh.promise as any)
      .mockResolvedValue({ data: { visits: [{ id: 1, diagnosis: '73', visit_date: '2031-01-01T12:00:00Z' }], hasMore: false, nextCursor: null } } as any);
    const send = vi.spyOn(apiClient, 'createVisit').mockResolvedValue({ data: { visit: { id: 1 } } } as any);
    render(<VisitsCard patientId="SYN" />);
    await screen.findByText('No more records.');
    fireEvent.change(screen.getByPlaceholderText('Diagnosis'), { target: { value: '73' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Save Visit' }).closest('form')!);
    await waitFor(() => expect(history).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: 'Save Visit' })).toBeEnabled();
    expect(screen.getByPlaceholderText('Diagnosis')).toHaveValue('');
    expect(sessionStorage.getItem('clinical-write:visit')).toBeNull();

    // This is a genuine GET failure after confirmed POST success, not a bad page.
    fireEvent.change(screen.getByPlaceholderText('Diagnosis'), { target: { value: '74' } });
    await act(async () => { refresh.reject(new Error('synthetic history unavailable')); });
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load records. Please retry.');
    expect(screen.getByRole('button', { name: 'Save Visit' })).toBeEnabled();
    expect(screen.queryByText('Failed to save visit')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry same submission' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'History checked — start new submission' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Save outcome not confirmed/)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Diagnosis')).toHaveValue('74');
    expect(sessionStorage.getItem('clinical-write:visit')).toBeNull();
    expect(send).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Retry loading records' }));
    await screen.findByText(/• 73$/);
    expect(history).toHaveBeenCalledTimes(3);
    for (const call of history.mock.calls) expect(call).toEqual(['SYN', 30, undefined]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Diagnosis')).toHaveValue('74');
    expect(screen.getByRole('button', { name: 'Save Visit' })).toBeEnabled();
    expect(sessionStorage.getItem('clinical-write:visit')).toBeNull();
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('API key header compatibility with hardened sessions', () => {
  it('adds optional keys only to create calls, preserving keys across same-session refresh', async () => {
    const client = (apiClient as unknown as { client: AxiosInstance }).client;
    const saved = client.defaults.adapter;
    const seen: any[] = [];
    client.defaults.adapter = async config => {
      seen.push(config);
      const response = { config, data: {}, status: 201, statusText: '', headers: {} };
      return response;
    };
    try {
      const key = crypto.randomUUID();
      await apiClient.createAppointment('SYN', '2031-01-01T12:00', '', '', key);
      await apiClient.createVisit('SYN', {}, key);
      await apiClient.recordVitals('SYN', { heartRate: 73 }, key);
      await apiClient.createVisit('SYN', {});
      for (const config of seen.slice(0, 3)) {
        expect(config.headers['Idempotency-Key']).toBe(key);
        expect(config.headers.Authorization).toBe('Bearer synthetic-old');
      }
      expect(seen[3].headers['Idempotency-Key']).toBeUndefined();
      sessionStorage.setItem('refreshToken', 'synthetic-refresh'); let first = true;
      client.defaults.adapter = async config => {
        const response = { config, data: {}, status: 201, statusText: '', headers: {} };
        if (config.url === '/api/auth/refresh') return { ...response, data: { accessToken: 'rotated', refreshToken: 'rotated-refresh' } };
        expect(config.headers['Idempotency-Key']).toBe(key);
        if (first) { first = false; throw new AxiosError('expired', 'ERR_BAD_RESPONSE', config, undefined, { ...response, status: 401 }); }
        expect(config.headers.Authorization).toBe('Bearer rotated');
        return response;
      };
      await apiClient.createVisit('SYN', {}, key);
    } finally { client.defaults.adapter = saved; }
  });
});
