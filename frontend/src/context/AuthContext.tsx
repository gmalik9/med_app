import React, { createContext, useState, ReactNode, useEffect, useContext, useCallback, useRef } from 'react';
import { CanceledError } from 'axios';
import { apiClient, AuthCapabilities } from '../utils/apiClient';

interface User {
  id: number;
  email: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, firstName: string, lastName: string) => Promise<void>;
  logout: () => void;
  refreshToken: (token: string) => Promise<void>;
  capabilities: AuthCapabilities | null;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [capabilities, setCapabilities] = useState<AuthCapabilities | null>(null);
  const [capabilitiesError, setCapabilitiesError] = useState(false);
  const [capabilitiesAttempt, setCapabilitiesAttempt] = useState(0);
  const [sessionError, setSessionError] = useState('');
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [bootstrapFailed, setBootstrapFailed] = useState(false);
  const mounted = useRef(true);
  const activity = useRef({ generation: -1, time: 0 });

  useEffect(() => {
    mounted.current = true;
    const expired = (event: Event) => {
      const generation = (event as CustomEvent<{ generation: number }>).detail?.generation;
      if (generation !== undefined && generation !== apiClient.getSessionGeneration()) return;
      setUser(null); setIsAuthenticated(false);
      setBootstrapFailed(false);
      setSessionError('Your session expired. Please sign in again.');
    };
    window.addEventListener('session-expired', expired);
    return () => { mounted.current = false; window.removeEventListener('session-expired', expired); };
  }, []);

  useEffect(() => {
    let active = true;
    apiClient.getCapabilities().then(response => {
      if (active) { setCapabilities(response.data); setCapabilitiesError(false); }
    }).catch(() => { if (active) setCapabilitiesError(true); });
    return () => { active = false; };
  }, [capabilitiesAttempt]);

  useEffect(() => {
    let active = true;
    const generation = apiClient.getSessionGeneration();
    // A stored user object is not proof of a valid server-side session.
    if (apiClient.getAccessToken()) {
      void apiClient.getDoctorProfile().then(response => {
        if (!active || generation !== apiClient.getSessionGeneration()) return;
        setUser(response.data.user);
        setIsAuthenticated(true);
        setBootstrapFailed(false); setSessionError('');
      }).catch(() => {
        if (!active || generation !== apiClient.getSessionGeneration()) return;
        // A temporary outage is not a revocation. Keep credentials for retry,
        // but do not authenticate a cached user without a server response.
        setBootstrapFailed(true);
        setSessionError('Unable to verify your session. Check your connection and retry.');
      });
    }
    return () => { active = false; };
  }, [bootstrapAttempt]);

  const startIdentity = () => {
    const generation = apiClient.beginSession();
    setUser(null); setIsAuthenticated(false); setSessionError(''); setBootstrapFailed(false);
    return generation;
  };

  const acceptIdentity = (data: { user: User; accessToken: string; refreshToken: string }, generation: number) => {
    if (!mounted.current || !apiClient.setSessionTokens(data.accessToken, data.refreshToken, generation)) throw new CanceledError('Session changed');
    setUser(data.user); setIsAuthenticated(true);
  };

  const login = async (email: string, password: string) => {
    const generation = startIdentity();
    acceptIdentity((await apiClient.login(email, password)).data, generation);
  };

  const register = async (email: string, password: string, firstName: string, lastName: string) => {
    const generation = startIdentity();
    acceptIdentity((await apiClient.register(email, password, firstName, lastName)).data, generation);
  };

  const logout = useCallback(() => {
    // Immediate local logout; a failed server revocation is visible, not claimed
    // as success. Its late completion must never disturb a newer login.
    const revocation = apiClient.logout();
    const generation = apiClient.getSessionGeneration();
    setUser(null); setIsAuthenticated(false); setSessionError(''); setBootstrapFailed(false);
    void revocation.catch(() => {
      if (mounted.current && generation === apiClient.getSessionGeneration()) {
        setSessionError('Signed out on this tab, but server sign-out could not be confirmed. Other copies of this session may remain active until expiry.');
      }
    });
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    const generation = apiClient.getSessionGeneration();
    if (activity.current.generation !== generation) activity.current = { generation, time: Date.now() };
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      clearTimeout(timer);
      if (!capabilities) return; // Server enforcement remains authoritative.
      const remaining = capabilities.sessionTimeoutMinutes * 60 * 1000 - (Date.now() - activity.current.time);
      timer = setTimeout(() => { if (generation === apiClient.getSessionGeneration()) logout(); }, Math.max(0, remaining));
    };
    const reset = () => { activity.current.time = Date.now(); schedule(); };
    const events = ['pointerdown', 'keydown', 'touchstart'];
    events.forEach(event => window.addEventListener(event, reset));
    schedule();
    return () => { clearTimeout(timer); events.forEach(event => window.removeEventListener(event, reset)); };
  }, [isAuthenticated, user, capabilities, logout]);

  const refreshToken = async (token: string) => {
    // The client owns the generation-checked atomic token pair update.
    await apiClient.refreshToken(token);
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, login, register, logout, refreshToken, capabilities }}>
      {capabilitiesError && <div role="status">Unable to load sign-in options and the inactivity limit. Server session limits still apply. <button onClick={() => setCapabilitiesAttempt(value => value + 1)}>Retry settings</button></div>}
      {sessionError && <div role="status">{sessionError} {bootstrapFailed && <button onClick={() => setBootstrapAttempt(value => value + 1)}>Retry session</button>}</div>}
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
