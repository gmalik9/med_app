import axios, { AxiosInstance } from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

class ApiClient {
  private client: AxiosInstance;
  private accessToken: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Load token from localStorage
    this.accessToken = localStorage.getItem('accessToken');

    // Add authorization header
    this.client.interceptors.request.use((config) => {
      if (this.accessToken) {
        config.headers.Authorization = `Bearer ${this.accessToken}`;
      }
      return config;
    });
  }

  setAccessToken(token: string) {
    this.accessToken = token;
    localStorage.setItem('accessToken', token);
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  clearToken() {
    this.accessToken = null;
    localStorage.removeItem('accessToken');
  }

  // Auth endpoints
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

  refreshToken(refreshToken: string) {
    return this.client.post('/api/auth/refresh', { refreshToken });
  }

  // Patient endpoints
  searchPatient(patientId: string) {
    return this.client.get('/api/patients/search', { params: { patientId } });
  }

  createPatient(patientId: string, firstName: string, lastName: string) {
    return this.client.post('/api/patients/create', {
      patientId,
      firstName,
      lastName,
    });
  }

  getPatient(id: number) {
    return this.client.get(`/api/patients/${id}`);
  }

  updatePatient(id: number, data: any) {
    return this.client.put(`/api/patients/${id}`, data);
  }

  // Note endpoints
  getTodayNote(patientId: number, date?: string) {
    return this.client.get(`/api/notes/patient/${patientId}`, { params: { date } });
  }

  saveNote(patientId: number, noteText: string, date?: string) {
    return this.client.post(`/api/notes/patient/${patientId}`, { noteText, date });
  }

  getNoteHistory(patientId: number, limit?: number) {
    return this.client.get(`/api/notes/patient/${patientId}/history`, { params: { limit } });
  }

  // Phase 2: Vital Signs
  recordVitals(patientId: number, vitals: any) {
    return this.client.post(`/api/vitals/patient/${patientId}`, vitals);
  }

  getLatestVitals(patientId: number) {
    return this.client.get(`/api/vitals/patient/${patientId}/latest`);
  }

  getVitalsHistory(patientId: number, limit?: number) {
    return this.client.get(`/api/vitals/patient/${patientId}/history`, { params: { limit } });
  }

  // Phase 2: Appointments
  createAppointment(patientId: number, appointmentDate: string, appointmentType: string, reason: string) {
    return this.client.post('/api/appointments/create', {
      patientId,
      appointmentDate,
      appointmentType,
      reason,
    });
  }

  getUpcomingAppointments() {
    return this.client.get('/api/appointments/upcoming');
  }

  getAppointmentHistory(patientId: number) {
    return this.client.get(`/api/appointments/patient/${patientId}/history`);
  }

  // Phase 2: Visit History
  createVisit(patientId: number, visitData: any) {
    return this.client.post('/api/visits/create', { patientId, ...visitData });
  }

  getVisitHistory(patientId: number, limit?: number) {
    return this.client.get(`/api/visits/patient/${patientId}`, { params: { limit } });
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

  getPatientTrends(patientId: number) {
    return this.client.get(`/api/analytics/patient/${patientId}/trends`);
  }
}

export const apiClient = new ApiClient();
