import axios, { AxiosInstance, AxiosResponse, CanceledError, InternalAxiosRequestConfig } from 'axios';
import { resolveApiUrl } from './apiUrl';

// Explicit backend origin, otherwise same-origin reverse proxy.
const API_URL = resolveApiUrl(import.meta.env.VITE_API_URL);

export interface AuthCapabilities {
  allowRegistration: boolean;
  aiEnabled: boolean;
  sessionTimeoutMinutes: number;
}
type Tokens = { accessToken: string; refreshToken: string };
type SessionRequest = InternalAxiosRequestConfig & { _generation?: number; _retried?: boolean; _accessToken?: string | null };
const detached = (url = '') => /\/auth\/(?:logout|capabilities)$/.test(url);
const publicAuth = (url = '') => /\/auth\/(?:login|register|refresh|logout|capabilities)$/.test(url);

class ApiClient {
  private client: AxiosInstance;
  private accessToken: string | null = null;
  private generation = 0;
  private refreshing: { generation: number; promise: Promise<AxiosResponse<Tokens>> } | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 90000, // 90 second timeout for Render cold starts
    });

    // Remove legacy persistent credentials. Tab-scoped storage is still readable
    // by JavaScript; an HttpOnly-cookie/BFF migration remains a production task.
    for (const key of ['accessToken', 'refreshToken', 'user']) localStorage.removeItem(key);
    this.accessToken = sessionStorage.getItem('accessToken');

    // Synchronous capture is essential: an account switch before Axios's first
    // microtask must not relabel an already-created clinical request.
    this.client.interceptors.request.use((config) => {
      const request = config as SessionRequest;
      if (detached(request.url)) return request; // Preserve captured logout headers.
      request._generation ??= this.generation;
      if (request._generation !== this.generation) throw new CanceledError('Session changed');
      if (!publicAuth(request.url)) {
        request._accessToken = this.accessToken;
        if (this.accessToken) request.headers.Authorization = `Bearer ${this.accessToken}`;
        else request.headers.delete('Authorization');
      }
      return request;
    }, error => { throw error; }, { synchronous: true });

    this.client.interceptors.response.use(
      response => {
        const request = response.config as SessionRequest;
        if (!detached(request.url) && request._generation !== this.generation) throw new CanceledError('Session changed');
        return response;
      },
      async (error) => {
        const original = error.config as SessionRequest | undefined;
        if (!original || detached(original.url)) return Promise.reject(error);
        if (original._generation !== this.generation) throw new CanceledError('Session changed');
        if (error.response?.status === 401 && !publicAuth(original.url)) {
          const generation = this.generation;
          const refresh = sessionStorage.getItem('refreshToken');
          if (!original._retried && refresh) {
            original._retried = true;
            // Another request may already have refreshed this same generation.
            if (original._accessToken === this.accessToken) await this.refreshToken(refresh);
            if (generation !== this.generation) throw new CanceledError('Session changed');
            return this.client(original);
          }
          // A bounded retry may itself finish after another rotation. Its old
          // credential's rejection says nothing about the newer token pair.
          if (original._accessToken === this.accessToken) this.expireSession(generation);
        }
        return Promise.reject(error);
      }
    );
  }

  setAccessToken(token: string) {
    // Compatibility for existing callers: setting a new access credential starts
    // a generation. Internal refresh uses the atomic pair setter instead.
    if (token !== this.accessToken) this.generation++;
    this.accessToken = token;
    sessionStorage.setItem('accessToken', token);
  }

  getSessionGeneration() { return this.generation; }

  beginSession() { this.clearToken(); return this.generation; }

  setSessionTokens(accessToken: string, refreshToken: string, generation: number) {
    if (generation !== this.generation) return false;
    if (typeof accessToken !== 'string' || !accessToken || typeof refreshToken !== 'string' || !refreshToken) {
      throw new Error('Invalid session response');
    }
    // No await/callback between the generation check and the pair commit.
    sessionStorage.setItem('accessToken', accessToken);
    sessionStorage.setItem('refreshToken', refreshToken);
    this.accessToken = accessToken;
    return true;
  }

  private expireSession(generation: number) {
    if (generation !== this.generation) return;
    this.clearToken();
    window.dispatchEvent(new CustomEvent('session-expired', { detail: { generation: this.generation } }));
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  clearToken() {
    this.generation++;
    this.refreshing = null;
    this.accessToken = null;
    for (const key of ['accessToken', 'refreshToken', 'user']) sessionStorage.removeItem(key);
  }

  // Auth endpoints
  getCapabilities() {
    return this.client.get<AuthCapabilities>('/api/auth/capabilities');
  }

  register(email: string, password: string, firstName: string, lastName: string) {
    return this.client.post('/api/auth/register', {
      email,
      password,
      firstName,
      lastName,
    });
  }

  login(email: string, password: string) {
    return this.client.post('/api/auth/login', { email, password });
  }

  async refreshToken(refreshToken: string): Promise<AxiosResponse<Tokens>> {
    const generation = this.generation;
    if (refreshToken !== sessionStorage.getItem('refreshToken')) throw new CanceledError('Session changed');
    if (this.refreshing?.generation === generation) return this.refreshing.promise;
    const flight = { generation, promise: this.client.post<Tokens>('/api/auth/refresh', { refreshToken }).then(response => {
      if (generation !== this.generation || sessionStorage.getItem('refreshToken') !== refreshToken) throw new CanceledError('Session changed');
      this.setSessionTokens(response.data.accessToken, response.data.refreshToken, generation);
      return response;
    }).catch(error => {
      // Network errors, rate limits and service outages do not prove revocation.
      if (error.response?.status === 401) this.expireSession(generation);
      throw error;
    }).finally(() => { if (this.refreshing === flight) this.refreshing = null; }) };
    this.refreshing = flight;
    return flight.promise;
  }

  logout() {
    const token = this.accessToken;
    const refreshToken = sessionStorage.getItem('refreshToken');
    this.clearToken();
    return this.client.post('/api/auth/logout', refreshToken ? { refreshToken } : {}, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  }

  getDoctorProfile() {
    return this.client.get('/api/auth/profile');
  }

  updateDoctorProfile(data: any) {
    return this.client.put('/api/auth/profile', data);
  }

  // Patient endpoints
  searchPatient(patientId: string) {
    return this.client.get('/api/patients/search', { params: { patientId } });
  }

  createPatient(patientId: string, firstName: string, lastName: string, details: Record<string, unknown> = {}) {
    return this.client.post('/api/patients/create', {
      patientId,
      firstName,
      lastName,
      ...details,
    });
  }

  getPatient(id: string | number) {
    return this.client.get(`/api/patients/${id}`);
  }

  getPatients(limit = 50, offset?: number, cursor?: string) {
    return this.client.get('/api/patients/', { params: { limit, offset, cursor } });
  }

  updatePatientStatus(id: string | number, is_active: boolean) {
    return this.client.patch(`/api/patients/${id}/active`, { is_active });
  }

  updatePatient(id: string | number, data: any) {
    return this.client.put(`/api/patients/${id}`, data);
  }

  scanPatientSticker(image: Blob) {
    const formData = new FormData();
    formData.append('image', image, 'sticker-scan.jpg');

    return this.client.post('/api/patients/scan-sticker', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  }

  // Note endpoints
  getTodayNote(patientId: string | number, date?: string) {
    return this.client.get(`/api/notes/patient/${patientId}`, { params: { date } });
  }

  saveNote(patientId: string | number, noteText: string, date?: string, medicalCodes: string[] = [], expectedRevision = 0) {
    return this.client.post(`/api/notes/patient/${patientId}`, { noteText, date, medicalCodes, expectedRevision });
  }

  getNoteHistory(patientId: string | number, limit?: number, cursor?: string) {
    return this.client.get(`/api/notes/patient/${patientId}/history`, { params: { limit, cursor } });
  }

  // Phase 2: Vital Signs
  recordVitals(patientId: string | number, vitals: any, requestKey?: string) {
    return this.client.post(`/api/vitals/patient/${patientId}`, vitals, {
      headers: requestKey ? { 'Idempotency-Key': requestKey } : {},
    });
  }

  getLatestVitals(patientId: string | number) {
    return this.client.get(`/api/vitals/patient/${patientId}/latest`);
  }

  getVitalsHistory(patientId: string | number, limit?: number, cursor?: string) {
    return this.client.get(`/api/vitals/patient/${patientId}/history`, { params: { limit, cursor } });
  }

  // Phase 2: Appointments
  createAppointment(patientId: string | number, appointmentDate: string, appointmentType: string, reason: string, requestKey?: string) {
    return this.client.post('/api/appointments/create', {
      patientId: String(patientId),
      appointmentDate,
      appointmentType,
      reason,
    }, {
      headers: requestKey ? { 'Idempotency-Key': requestKey } : {},
    });
  }

  getUpcomingAppointments() {
    return this.client.get('/api/appointments/upcoming');
  }

  getAppointmentHistory(patientId: string | number, limit?: number, cursor?: string) {
    return this.client.get(`/api/appointments/patient/${patientId}/history`, { params: { limit, cursor } });
  }

  updateAppointmentStatus(appointmentId: number, status: string) {
    return this.client.put(`/api/appointments/${appointmentId}/status`, { status });
  }

  // Phase 2: Visit History
  createVisit(patientId: string | number, visitData: any, requestKey?: string) {
    return this.client.post('/api/visits/create', { ...visitData, patientId: String(patientId) }, {
      headers: requestKey ? { 'Idempotency-Key': requestKey } : {},
    });
  }

  getVisitHistory(patientId: string | number, limit?: number, cursor?: string, filter: 'all' | 'upcoming' = 'all') {
    return this.client.get(`/api/visits/patient/${patientId}`, { params: { limit, cursor, filter } });
  }

  getTodayVisits() {
    return this.client.get('/api/visits/doctor/today');
  }

  // Phase 3: Templates
  getTemplates() {
    return this.client.get('/api/templates/list');
  }

  getTemplatesByCategory(category: string) {
    return this.client.get(`/api/templates/category/${category}`);
  }

  createTemplate(templateData: any) {
    return this.client.post('/api/templates/create', templateData);
  }

  // Phase 3: Analytics
  getDashboard() {
    return this.client.get('/api/analytics/dashboard');
  }

  getPatientTrends(patientId: string | number) {
    return this.client.get(`/api/analytics/patient/${patientId}/trends`);
  }

  // AI Formatting
  formatNote(text: string) {
    return this.client.post('/api/format-note', { text });
  }
}

export const apiClient = new ApiClient();
