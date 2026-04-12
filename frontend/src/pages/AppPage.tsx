import React, { useState } from 'react';
import { apiClient } from '../utils/apiClient';
import PatientForm from '../components/PatientForm';
import NoteEditor from '../components/NoteEditor';
import PatientHistory from '../components/PatientHistory';
import { useAuth } from '../hooks/useAuth';

interface Patient {
  id: number;
  patient_id: string;
  first_name: string;
  last_name: string;
  dob: string;
  phone: string;
  email: string;
  allergies: string;
  medical_conditions: string;
  medications: string;
}

export function AppPage() {
  const [patientId, setPatientId] = useState('');
  const [searchError, setSearchError] = useState('');
  const [patient, setPatient] = useState<Patient | null>(null);
  const [patientExists, setPatientExists] = useState(false);
  const [step, setStep] = useState<'search' | 'create' | 'edit'>('search');
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

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.headerTitle}>🏥 Medical Notes</h1>
        <div style={styles.userInfo}>
          <span>{user?.email}</span>
          <button onClick={logout} style={styles.logoutBtn}>
            Logout
          </button>
        </div>
      </header>

      <main style={styles.main}>
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
                />
              </div>

              <div style={styles.column}>
                <NoteEditor patientId={patient.id} />
              </div>
            </div>

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
