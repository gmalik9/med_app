import React, { useState } from 'react';
import { apiClient } from '../utils/apiClient';
import PatientForm from '../components/PatientForm';
import NoteEditor from '../components/NoteEditor';
import PatientHistory from '../components/PatientHistory';
import VitalsCard from '../components/VitalsCard';
import AppointmentsCard from '../components/AppointmentsCard';
import VisitsCard from '../components/VisitsCard';
import TemplatesAnalyticsPanel from '../components/TemplatesAnalyticsPanel';
import ScheduledVisitsPanel from '../components/ScheduledVisitsPanel';
import DoctorDashboard from '../components/DoctorDashboard';
import DoctorProfile from '../components/DoctorProfile';
import { PatientsListPage } from './PatientsListPage';
import { useAuth } from '../hooks/useAuth';

interface Patient {
  id: number;
  patient_id: string;
  first_name: string;
  last_name: string;
  gender?: string;
  dob: string;
  phone: string;
  email: string;
  allergies: string;
  medical_conditions: string;
  medications: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function AppPage() {
  const [patientId, setPatientId] = useState('');
  const [searchError, setSearchError] = useState('');
  const [patient, setPatient] = useState<Patient | null>(null);
  const [patientExists, setPatientExists] = useState(false);
  const [step, setStep] = useState<'search' | 'create' | 'edit' | 'patients' | 'dashboard' | 'profile'>('search');
  const [loading, setLoading] = useState(false);
  const { logout, user } = useAuth();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearchError('');
    setLoading(true);

    try {
      const response = await apiClient.searchPatient(patientId);
      if (response.data.exists) {
        setPatient(response.data.patient);
        setPatientExists(true);
        setStep('edit');
      } else {
        setPatientExists(false);
        setStep('create');
      }
    } catch (err: any) {
      setSearchError(err.response?.data?.error || 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePatientCreated = (newPatient: Patient) => {
    setPatient(newPatient);
    setPatientExists(true);
    setStep('edit');
  };

  const handleReset = () => {
    setPatientId('');
    setPatient(null);
    setPatientExists(false);
    setStep('search');
    setSearchError('');
  };

  const handleActivateDeactivate = async (patientId: number, is_active: boolean) => {
    try {
      await apiClient.updatePatientStatus(patientId, is_active);
      
      if (patient && patient.id === patientId) {
        setPatient(prev => prev ? { ...prev, is_active } : null);
      }

      return true;
    } catch (err: any) {
      setSearchError(err.response?.data?.error || 'Failed to update patient status');
      throw err;
    }
  };

  const handleEditFromList = (patientFromList: Patient) => {
    setPatient(patientFromList);
    setPatientId(patientFromList.patient_id);
    setPatientExists(true);
    setStep('edit');
  };

  const handleBackFromPatients = () => {
    setStep('search');
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.headerTitle}>🏥 Medical Notes</h1>
          <button onClick={() => setStep('search')} style={styles.dashboardBtn}>
            📋 Medical Notes
          </button>
          <button onClick={() => setStep('dashboard')} style={styles.dashboardBtn}>
            Dashboard
          </button>
          <button onClick={() => setStep('patients')} style={styles.patientsListBtn}>
            View All Patients
          </button>
        </div>
        <div style={styles.userInfo}>
          <span>{user?.email}</span>
          <button onClick={() => setStep('profile')} style={styles.profileBtn}>
            👤 Profile
          </button>
          <button onClick={logout} style={styles.logoutBtn}>
            Logout
          </button>
        </div>
      </header>

      <main style={styles.main}>
        {step === 'profile' && (
          <DoctorProfile onClose={() => setStep('search')} />
        )}

        {step === 'dashboard' && (
          <div>
            <button onClick={() => setStep('search')} style={styles.backButton}>
              ← Back to Search
            </button>
            <DoctorDashboard />
          </div>
        )}

        {step === 'patients' && (
          <div>
            <PatientsListPage onEditPatient={handleEditFromList} onBack={handleBackFromPatients} />
          </div>
        )}

        {step === 'search' && (
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Search Patient</h2>
            <form onSubmit={handleSearch} style={styles.form}>
              <input
                type="text"
                placeholder="Enter Patient ID"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                required
                style={styles.input}
                autoFocus
              />
              <button type="submit" disabled={loading} style={styles.button}>
                {loading ? 'Searching...' : 'Search'}
              </button>
            </form>
            <div style={styles.searchActions}>
              <button onClick={() => setStep('patients')} style={styles.viewAllBtn}>
                View All Patients
              </button>
            </div>
            {searchError && <div style={styles.error}>{searchError}</div>}
          </div>
        )}

        {step === 'create' && (
          <PatientForm
            patientId={patientId}
            onCreated={handlePatientCreated}
            onCancel={handleReset}
          />
        )}

        {step === 'edit' && patient && (
          <div style={styles.editContainer}>
            <button onClick={handleReset} style={styles.backButton}>
              ← Back to Search
            </button>

            <div style={styles.twoColumn}>
              <div style={styles.column}>
                <PatientForm
                  patientId={patientId}
                  initialData={patient}
                  onCreated={setPatient}
                  onCancel={handleReset}
                  isEdit
                  onStatusChange={handleActivateDeactivate}
                />
              </div>

              <div style={styles.column}>
                <NoteEditor patientId={patient.id} />
              </div>
            </div>

            <div style={styles.twoColumn}>
              <div style={styles.column}>
                <VitalsCard patientId={patient.id} />
              </div>
              <div style={styles.column}>
                <AppointmentsCard patientId={patient.id} />
              </div>
            </div>

            <VisitsCard patientId={patient.id} />

            <ScheduledVisitsPanel patientId={patient.id} />

            <TemplatesAnalyticsPanel patientId={patient.id} />

            <PatientHistory patientId={patient.id} />
          </div>
        )}
      </main>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  } as React.CSSProperties,
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  } as React.CSSProperties,
  patientsListBtn: {
    padding: '8px 16px',
    backgroundColor: '#0066cc',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  } as React.CSSProperties,
  dashboardBtn: {
    padding: '8px 16px',
    backgroundColor: '#28a745',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  } as React.CSSProperties,
  header: {
    backgroundColor: 'white',
    borderBottom: '1px solid #e0e0e0',
    padding: '16px 24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
  } as React.CSSProperties,
  headerTitle: {
    margin: 0,
    fontSize: '24px',
    color: '#333',
  } as React.CSSProperties,
  userInfo: {
    display: 'flex',
    gap: '16px',
    alignItems: 'center',
  } as React.CSSProperties,
  profileBtn: {
    padding: '8px 16px',
    backgroundColor: '#0066cc',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
  } as React.CSSProperties,
  logoutBtn: {
    padding: '8px 16px',
    backgroundColor: '#f0f0f0',
    border: '1px solid #ddd',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
  } as React.CSSProperties,
  main: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '24px',
  } as React.CSSProperties,
  card: {
    backgroundColor: 'white',
    padding: '32px',
    borderRadius: '12px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
  } as React.CSSProperties,
  cardTitle: {
    marginTop: 0,
    marginBottom: '20px',
    fontSize: '20px',
    color: '#333',
  } as React.CSSProperties,
  form: {
    display: 'flex',
    gap: '12px',
  } as React.CSSProperties,
  searchActions: {
    marginTop: '16px',
  } as React.CSSProperties,
  input: {
    flex: 1,
    padding: '12px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '16px',
  } as React.CSSProperties,
  button: {
    padding: '12px 24px',
    backgroundColor: '#0066cc',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '500',
  } as React.CSSProperties,
  viewAllBtn: {
    marginTop: '16px',
    width: '100%',
    padding: '12px',
    backgroundColor: '#0066cc',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '500',
  } as React.CSSProperties,
  error: {
    backgroundColor: '#fee',
    color: '#c33',
    padding: '12px',
    borderRadius: '6px',
    marginTop: '12px',
    fontSize: '14px',
  } as React.CSSProperties,
  editContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  } as React.CSSProperties,
  backButton: {
    alignSelf: 'flex-start',
    padding: '8px 16px',
    backgroundColor: '#f0f0f0',
    border: '1px solid #ddd',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
  } as React.CSSProperties,
  twoColumn: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '24px',
  } as React.CSSProperties,
  column: {
    display: 'flex',
    flexDirection: 'column',
  } as React.CSSProperties,
};
