import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

// Deferred adapter: tests decide precisely when each HTTP completion arrives.
function transport(client: AxiosInstance) {
  type Pending = { config: InternalAxiosRequestConfig; ok: (data?: unknown) => void; fail: (status?: number) => void };
  const queue: Pending[] = [];
  const waiters: ((pending: Pending) => void)[] = [];
  client.defaults.adapter = config => new Promise((resolve, reject) => {
    const response = (data: unknown, status = 200) => ({ config, data, status, statusText: '', headers: {} });
    const pending = { config, ok: (data = {}) => resolve(response(data)),
      fail: (status?: number) => reject(new AxiosError('Synthetic failure', status ? 'ERR_BAD_RESPONSE' : 'ERR_NETWORK', config, undefined, status ? response({}, status) : undefined)) };
    const waiter = waiters.shift();
    if (waiter) waiter(pending); else queue.push(pending);
  });
  return { next: () => queue.length ? Promise.resolve(queue.shift()!) : new Promise<Pending>(resolve => waiters.push(resolve)), queue };
}

let api: typeof import('../src/utils/apiClient').apiClient;
let http: ReturnType<typeof transport>;
const identity = (name: string) => { api.setAccessToken(`${name}-access`); sessionStorage.setItem('refreshToken', `${name}-refresh`); };
const outcome = <T,>(promise: Promise<T>) => promise.then(value => ({ value, error: undefined }), error => ({ value: undefined, error }));
beforeEach(async () => {
  sessionStorage.clear(); localStorage.clear(); vi.resetModules();
  api = (await import('../src/utils/apiClient')).apiClient;
  http = transport((api as unknown as { client: AxiosInstance }).client);
  identity('old');
});

describe('session generation HTTP boundaries', () => {
  it('never refreshes/replays an old clinical write under a new account after a delayed 401', async () => {
    const result = outcome(api.saveNote('SYN', 'synthetic draft'));
    const old = await http.next();
    identity('new'); old.fail(401);
    // Drain only work caused by the old completion; no timing/sleep assumptions.
    const finished = await Promise.race([result.then(value => ({ value })), http.next().then(request => ({ request }))]);
    expect(finished).toHaveProperty('value.error');
    expect(api.getAccessToken()).toBe('new-access');
    expect(sessionStorage.getItem('refreshToken')).toBe('new-refresh');
  });

  it.each(['logout', 'new login'])('drops a refresh completion after %s', async action => {
    const result = outcome(api.getDoctorProfile());
    (await http.next()).fail(401);
    const refresh = await http.next();
    expect(refresh.config.url).toBe('/api/auth/refresh');
    if (action === 'logout') {
      const revoked = api.logout(); (await http.next()).ok(); await revoked;
    } else identity('new');
    refresh.ok({ accessToken: 'late-access', refreshToken: 'late-refresh' });
    expect((await result).error).toBeDefined();
    expect(api.getAccessToken()).toBe(action === 'logout' ? null : 'new-access');
    expect(sessionStorage.getItem('refreshToken')).toBe(action === 'logout' ? null : 'new-refresh');
  });

  it('does not let an old refresh network failure clear a new identity', async () => {
    const result = outcome(api.getDoctorProfile()); (await http.next()).fail(401);
    const refresh = await http.next(); identity('new'); refresh.fail();
    await result;
    expect(api.getAccessToken()).toBe('new-access');
  });

  it('keeps credentials on a refresh transport outage, allowing a later retry', async () => {
    const result = outcome(api.getDoctorProfile()); (await http.next()).fail(401);
    (await http.next()).fail(); await result;
    expect(api.getAccessToken()).toBe('old-access');
    expect(sessionStorage.getItem('refreshToken')).toBe('old-refresh');
  });

  it('preserves explicit captured logout credentials if a new login happens before dispatch', async () => {
    const revoked = api.logout(); identity('new');
    const logout = await http.next();
    expect(logout.config.headers.Authorization).toBe('Bearer old-access');
    expect(JSON.parse(logout.config.data)).toEqual({ refreshToken: 'old-refresh' });
    logout.ok(); await revoked;
    expect(api.getAccessToken()).toBe('new-access');
  });

  it('drops successful old profile/clinical responses after an identity switch', async () => {
    const result = outcome(api.getDoctorProfile()); const profile = await http.next();
    identity('new'); profile.ok({ user: { id: 1, email: 'old@example.invalid' } });
    expect((await result).error).toBeDefined();
  });

  it('captures the old identity at call time, before a subsequent account switch', async () => {
    const result = outcome(api.saveNote('SYN', 'synthetic draft'));
    identity('new');
    const old = await http.next();
    expect(old.config.headers.Authorization).toBe('Bearer old-access');
    old.ok(); expect((await result).error).toBeDefined();
  });

  it('coalesces concurrent 401s and reuses the refreshed credential for a later old-access 401', async () => {
    const a = api.getDoctorProfile(); const b = api.getDoctorProfile(); const c = api.getDoctorProfile();
    const first = await http.next(); const second = await http.next(); const delayed = await http.next();
    first.fail(401); const refresh = await http.next(); second.fail(401);
    refresh.ok({ accessToken: 'rotated-access', refreshToken: 'rotated-refresh' });
    const retryA = await http.next(); const retryB = await http.next();
    for (const retry of [retryA, retryB]) {
      expect(retry.config.url).toBe('/api/auth/profile');
      expect(retry.config.headers.Authorization).toBe('Bearer rotated-access'); retry.ok();
    }
    await Promise.all([a, b]); delayed.fail(401);
    const retryC = await http.next();
    expect(retryC.config.url).toBe('/api/auth/profile'); retryC.ok(); await c;
    expect(http.queue).toHaveLength(0);
    expect(api.getAccessToken()).toBe('rotated-access');
    expect(sessionStorage.getItem('refreshToken')).toBe('rotated-refresh');
  });

  it('expires only the current session on authoritative refresh rejection (including server idle expiry)', async () => {
    const expired = vi.fn(); window.addEventListener('session-expired', expired);
    try {
      const result = outcome(api.getDoctorProfile()); (await http.next()).fail(401);
      (await http.next()).fail(401); await result;
      expect(api.getAccessToken()).toBeNull(); expect(sessionStorage.getItem('refreshToken')).toBeNull();
      expect(expired).toHaveBeenCalledTimes(1);
    } finally { window.removeEventListener('session-expired', expired); }
  });

  it.each([undefined, 429, 503])('preserves current auth on unrelated request failure %s', async status => {
    const result = outcome(api.getDoctorProfile()); (await http.next()).fail(status); await result;
    expect(api.getAccessToken()).toBe('old-access');
  });

  it('does not let an old refresh finalizer detach a newer single-flight refresh', async () => {
    const old = outcome(api.getDoctorProfile()); (await http.next()).fail(401);
    const oldRefresh = await http.next(); identity('new');
    const current = api.getDoctorProfile(); (await http.next()).fail(401);
    const newRefresh = await http.next(); oldRefresh.fail(401); await old;
    const another = api.getDoctorProfile(); (await http.next()).fail(401);
    newRefresh.ok({ accessToken: 'new-rotated-access', refreshToken: 'new-rotated-refresh' });
    for (let i = 0; i < 2; i++) {
      const retry = await http.next(); expect(retry.config.url).toBe('/api/auth/profile'); retry.ok();
    }
    await Promise.all([current, another]); expect(api.getAccessToken()).toBe('new-rotated-access');
  });

  it('drops login and register completions after logout', async () => {
    for (const operation of [() => api.login('synthetic@example.invalid', 'synthetic'), () => api.register('synthetic@example.invalid', 'synthetic', 'Synthetic', 'Test')]) {
      const result = outcome(operation()); const pending = await http.next();
      api.clearToken(); pending.ok({ accessToken: 'late', refreshToken: 'late' });
      expect((await result).error).toBeDefined(); expect(api.getAccessToken()).toBeNull();
    }
  });

  it('does not attach bearer credentials or expire sessions on public capabilities failures', async () => {
    const result = outcome(api.getCapabilities()); const pending = await http.next();
    expect(pending.config.headers.Authorization).toBeUndefined(); pending.fail(401); await result;
    expect(api.getAccessToken()).toBe('old-access');
  });

  it('does not expire a newer same-session token pair on a delayed retried-request 401', async () => {
    const result = outcome(api.getDoctorProfile()); (await http.next()).fail(401);
    (await http.next()).ok({ accessToken: 'first-access', refreshToken: 'first-refresh' });
    const retry = await http.next();
    const rotatedAgain = api.refreshToken('first-refresh');
    (await http.next()).ok({ accessToken: 'second-access', refreshToken: 'second-refresh' });
    await rotatedAgain; retry.fail(401); await result;
    expect(api.getAccessToken()).toBe('second-access');
    expect(sessionStorage.getItem('refreshToken')).toBe('second-refresh');
  });
});