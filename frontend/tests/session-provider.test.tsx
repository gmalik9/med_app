import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { apiClient } from '../src/utils/apiClient';
import { LoginPage } from '../src/pages/LoginPage';

function deferred<T = any>() {
  let resolve!: (value: T) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}
const profile = (name: string) => ({ data: { user: { id: name === 'old' ? 1 : 2, email: `${name}@example.invalid`, role: 'doctor' }, accessToken: `${name}-access`, refreshToken: `${name}-refresh` } });
let auth: ReturnType<typeof useAuth>;
function Probe() { auth = useAuth(); return <div data-testid="identity">{auth.user?.email || 'anonymous'}</div>; }
async function mount(loginPage = false) { await act(async () => { render(<AuthProvider><Probe />{loginPage && <LoginPage />}</AuthProvider>); }); }
function storedIdentity() { apiClient.setAccessToken('old-access'); sessionStorage.setItem('refreshToken', 'old-refresh'); }
beforeEach(() => {
  vi.restoreAllMocks(); sessionStorage.clear(); apiClient.clearToken();
  vi.spyOn(apiClient, 'getCapabilities').mockResolvedValue({ data: { allowRegistration: false, aiEnabled: false, sessionTimeoutMinutes: 7 } } as any);
  vi.spyOn(apiClient, 'getDoctorProfile').mockResolvedValue(profile('old') as any);
  vi.spyOn(apiClient, 'login').mockResolvedValue(profile('new') as any);
  vi.spyOn(apiClient, 'register').mockResolvedValue(profile('new') as any);
  vi.spyOn(apiClient, 'logout').mockImplementation(() => { apiClient.clearToken(); return Promise.resolve({} as any); });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('provider lifecycle generations', () => {
  it.each(['success', 'failure'])('ignores late bootstrap %s after a newer login', async completion => {
    storedIdentity(); const bootstrap = deferred(); vi.mocked(apiClient.getDoctorProfile).mockReturnValue(bootstrap.promise);
    await mount(); await act(async () => auth.login('new@example.invalid', 'synthetic'));
    await act(async () => { if (completion === 'success') bootstrap.resolve(profile('old')); else bootstrap.reject(new Error('offline')); });
    expect(screen.getByTestId('identity')).toHaveTextContent('new@example.invalid');
    expect(auth.isAuthenticated).toBe(true); expect(apiClient.getAccessToken()).toBe('new-access');
  });

  it('cannot restore bootstrap identity after logout', async () => {
    storedIdentity(); const bootstrap = deferred(); vi.mocked(apiClient.getDoctorProfile).mockReturnValue(bootstrap.promise);
    await mount(); await act(async () => auth.logout());
    await act(async () => bootstrap.resolve(profile('old')));
    expect(auth.isAuthenticated).toBe(false); expect(apiClient.getAccessToken()).toBeNull();
  });

  it.each(['login', 'register'] as const)('ignores late %s after logout', async method => {
    const pending = deferred(); vi.mocked(apiClient[method]).mockReturnValue(pending.promise);
    await mount(); let result!: Promise<unknown>;
    await act(async () => { result = (method === 'login' ? auth.login('new@example.invalid', 'synthetic') : auth.register('new@example.invalid', 'synthetic', 'Synthetic', 'Test')).catch(error => error); });
    await act(async () => auth.logout());
    await act(async () => { pending.resolve(profile('new')); await result; });
    expect(auth.isAuthenticated).toBe(false); expect(apiClient.getAccessToken()).toBeNull();
  });

  it('commits only the latest of two overlapping login attempts', async () => {
    const old = deferred(); vi.mocked(apiClient.login).mockReturnValueOnce(old.promise);
    await mount(); let first!: Promise<unknown>;
    await act(async () => { first = auth.login('old@example.invalid', 'synthetic').catch(error => error); });
    await act(async () => auth.login('new@example.invalid', 'synthetic'));
    await act(async () => { old.resolve(profile('old')); await first; });
    expect(auth.user?.email).toBe('new@example.invalid'); expect(apiClient.getAccessToken()).toBe('new-access');
  });

  it('shows a bootstrap outage, keeps credentials and allows retry without trusting cached user data', async () => {
    storedIdentity(); sessionStorage.setItem('user', JSON.stringify(profile('old').data.user));
    vi.mocked(apiClient.getDoctorProfile).mockRejectedValueOnce(new Error('offline'));
    await mount(); expect(auth.isAuthenticated).toBe(false); expect(apiClient.getAccessToken()).toBe('old-access');
    expect(screen.getByText(/Unable to verify your session/)).toBeVisible();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry session' })));
    expect(auth.isAuthenticated).toBe(true); expect(auth.user?.email).toBe('old@example.invalid');
  });

  it('shows failed revocation but ignores an old logout failure after a newer login', async () => {
    const revocation = deferred();
    vi.mocked(apiClient.logout).mockImplementation(() => { apiClient.clearToken(); return revocation.promise; });
    await mount(); await act(async () => auth.logout());
    await act(async () => auth.login('new@example.invalid', 'synthetic'));
    await act(async () => revocation.reject(new Error('offline')));
    expect(auth.user?.email).toBe('new@example.invalid'); expect(screen.queryByText(/could not be confirmed/)).toBeNull();
    vi.mocked(apiClient.logout).mockImplementation(() => { apiClient.clearToken(); return Promise.reject(new Error('offline')); });
    await act(async () => auth.logout());
    expect(screen.getByText(/server sign-out could not be confirmed/)).toBeVisible(); expect(auth.isAuthenticated).toBe(false);
  });

  it('uses the configured inactivity limit and resets it on activity', async () => {
    vi.useFakeTimers(); storedIdentity(); await mount();
    await act(async () => vi.advanceTimersByTime(6 * 60 * 1000));
    fireEvent.keyDown(window, { key: 'Shift' });
    await act(async () => vi.advanceTimersByTime(6 * 60 * 1000));
    expect(auth.isAuthenticated).toBe(true);
    await act(async () => vi.advanceTimersByTime(60 * 1000));
    expect(apiClient.logout).toHaveBeenCalledTimes(1); expect(auth.isAuthenticated).toBe(false);
  });

  it('does not grant a fresh inactivity window when capabilities arrive late', async () => {
    vi.useFakeTimers(); const capabilities = deferred();
    vi.mocked(apiClient.getCapabilities).mockReturnValue(capabilities.promise);
    storedIdentity(); await mount();
    await act(async () => vi.advanceTimersByTime(8 * 60 * 1000));
    await act(async () => capabilities.resolve({ data: { allowRegistration: false, aiEnabled: false, sessionTimeoutMinutes: 7 } }));
    await act(async () => vi.advanceTimersByTime(0));
    expect(apiClient.logout).toHaveBeenCalledTimes(1); expect(auth.isAuthenticated).toBe(false);
  });

  it('ignores an expiration event from an older generation', async () => {
    await mount(); const oldGeneration = apiClient.getSessionGeneration();
    await act(async () => auth.login('new@example.invalid', 'synthetic'));
    await act(async () => window.dispatchEvent(new CustomEvent('session-expired', { detail: { generation: oldGeneration } })));
    expect(auth.isAuthenticated).toBe(true); expect(auth.user?.email).toBe('new@example.invalid');
  });

  it('hides registration when disabled and exposes it only when allowed', async () => {
    await mount(true);
    expect(screen.queryByRole('button', { name: /Don't have an account/ })).toBeNull();
    expect(screen.getByText(/Self-registration is disabled/)).toBeVisible();
  });

  it('shows registration when capabilities allow it', async () => {
    vi.mocked(apiClient.getCapabilities).mockResolvedValue({ data: { allowRegistration: true, aiEnabled: false, sessionTimeoutMinutes: 7 } } as any);
    await mount(true); fireEvent.click(screen.getByRole('button', { name: /Don't have an account/ }));
    expect(screen.getByPlaceholderText('First Name')).toBeVisible();
  });

  it('makes capabilities failure visible, hides signup while unknown and allows settings retry', async () => {
    vi.mocked(apiClient.getCapabilities).mockRejectedValueOnce(new Error('offline'));
    await mount(true); expect(screen.queryByRole('button', { name: /Don't have an account/ })).toBeNull();
    expect(screen.getByText(/Unable to load sign-in options/)).toBeVisible();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry settings' })));
    expect(screen.queryByRole('button', { name: 'Retry settings' })).toBeNull();
  });
});