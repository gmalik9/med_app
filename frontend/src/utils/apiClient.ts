import axios, { AxiosInstance } from 'axios';

// Smart API URL detection
// In Docker/Container: use the service name (http://backend:5000)
// In Browser on Host: use localhost:5001 (the exposed port)
// In Render/Remote: use backend service URL from environment or construct from hostname
// Build-time env: use VITE_API_URL if provided
function getApiUrl(): string {
  // Priority 1: Use build-time environment variable if set
  const buildTimeUrl = import.meta.env.VITE_API_URL;
  if (buildTimeUrl && buildTimeUrl !== 'undefined') {
    console.log('[API Client] Using build-time VITE_API_URL:', buildTimeUrl);
    return buildTimeUrl;
  }
  
  // Priority 2: Detect runtime environment
  // In Node/SSR context (where we can't access window), use docker service name
  if (typeof window === 'undefined') {
    console.log('[API Client] Using Docker service name (Node context)');
    return 'http://backend:5000';
  }
  
  // Priority 3: Browser running on host - use relative or localhost
  // Check if we're accessing from localhost or 127.0.0.1
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
    // Browser accessing from localhost - API should also be on localhost
    const apiUrl = `${protocol}//localhost:5001`;
    console.log('[API Client] Using localhost URL for browser:', apiUrl);
    return apiUrl;
  }
  
  // Priority 4: For Render/remote deployment - construct backend URL
  // Replace 'frontend' with 'backend' in the hostname
  if (hostname.includes('onrender.com') || hostname.includes('render.com')) {
    const backendHostname = hostname.replace('frontend', 'backend');
    const apiUrl = `${protocol}//` + backendHostname;
    console.log('[API Client] Using Render backend URL:', apiUrl);
    return apiUrl;
  }
  
  // Priority 5: Generic remote access - assume same domain, use /api proxy
  console.log('[API Client] Using same-origin API for remote access');
  return '/api';
}

const API_URL = getApiUrl();

class ApiClient {
  private client: AxiosInstance;
  private accessToken: string | null = null;

  constructor() {
    console.log('[API Client] Initializing with API_URL:', API_URL);
    
    this.client = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 90000, // 90 second timeout for Render cold starts
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

    // Add error interceptor for better debugging
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('[API Error]', {
          message: error.message,
          status: error.response?.status,
          data: error.response?.data,
          url: error.config?.url,
          baseURL: error.config?.baseURL,
        });
        return Promise.reject(error);
      }
    );
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

  createPatient(patientId: string, firstName: string, lastName: string) {
    return this.client.post('/api/patients/create', {
      patientId,
      firstName,
      lastName,
    });
  }

  getPatient(id: string | number) {
    return this.client.get(`/api/patients/${id}`);
  }

  getPatients() {
    return this.client.get('/api/patients/');
  }

  updatePatientStatus(id: string | number, is_active: boolean) {
    return this.client.patch(`/api/patients/${id}/active`, { is_active });
  }

  updatePatient(id: string | number, data: any) {
    return this.client.put(`/api/patients/${id}`, data);
  }

  // Note endpoints
  getTodayNote(patientId: string | number, date?: string) {
    return this.client.get(`/api/notes/patient/${patientId}`, { params: { date } });
  }

  saveNote(patientId: string | number, noteText: string, date?: string, medicalCodes: string[] = []) {
    return this.client.post(`/api/notes/patient/${patientId}`, { noteText, date, medicalCodes });
  }

  getNoteHistory(patientId: string | number, limit?: number) {
    return this.client.get(`/api/notes/patient/${patientId}/history`, { params: { limit } });
  }

  // Phase 2: Vital Signs
  recordVitals(patientId: string | number, vitals: any) {
    return this.client.post(`/api/vitals/patient/${patientId}`, vitals);
  }

  getLatestVitals(patientId: string | number) {
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

  updateAppointmentStatus(appointmentId: number, status: string) {
    return this.client.put(`/api/appointments/${appointmentId}/status`, { status });
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
