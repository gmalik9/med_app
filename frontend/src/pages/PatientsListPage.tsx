import React, { useState, useEffect } from 'react';
import { apiClient } from '../utils/apiClient';
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
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface PatientsListPageProps {
  onEditPatient?: (patient: Patient) => void;
  onBack?: () => void;
}

export function PatientsListPage({ onEditPatient, onBack }: PatientsListPageProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState<number | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    fetchPatients();
  }, []);

  const fetchPatients = async () => {
    try {
      setLoading(true);
      const response = await apiClient.getPatients();
      setPatients(response.data.patients);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch patients');
    } finally {
      setLoading(false);
    }
  };

  const togglePatientStatus = async (patientId: number, currentStatus: boolean) => {
    try {
      setUpdating(patientId);
      const response = await apiClient.updatePatientStatus(patientId, !currentStatus);
      
      setPatients(prev => prev.map(patient => 
        patient.id === patientId 
          ? { ...patient, is_active: response.data.patient.is_active }
          : patient
      ));
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update patient status');
    } finally {
      setUpdating(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading patients...</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h2 style={styles.headerTitle}>All Patients</h2>
        {onBack && (
          <button onClick={onBack} style={styles.backButton}>
            ← Back to Search
          </button>
        )}
      </header>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.patientsGrid}>
        {patients.length === 0 ? (
          <div style={styles.emptyState}>
            <p>No patients found.</p>
          </div>
        ) : (
          patients.map((patient) => (
            <div key={patient.id} style={styles.patientCard}>
              <div style={styles.patientHeader}>
                <div>
                  <h3 style={styles.patientName}>
                    {patient.first_name} {patient.last_name}
                  </h3>
                  <p style={styles.patientId}>ID: {patient.patient_id}</p>
                </div>
                <div style={styles.statusBadge}>
                  <span style={{
                    ...styles.statusText,
                    backgroundColor: patient.is_active ? '#d4edda' : '#f8d7da',
                    color: patient.is_active ? '#155724' : '#721c24'
                  }}>
                    {patient.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>

              <div style={styles.patientInfo}>
                <p><strong>Date of Birth:</strong> {patient.dob ? formatDate(patient.dob) : 'Not provided'}</p>
                <p><strong>Phone:</strong> {patient.phone || 'Not provided'}</p>
                <p><strong>Email:</strong> {patient.email || 'Not provided'}</p>
                <p><strong>Created:</strong> {formatDate(patient.created_at)}</p>
              </div>

              <div
                style={{
                  ...styles.statusActionSection,
                  ...(patient.is_active ? styles.activeActionsSection : styles.inactiveActionsSection),
                }}
              >
                <div style={styles.statusActionHeader}>
                  <span style={styles.statusActionTitle}>
                    {patient.is_active ? 'Active Patient Actions' : 'Inactive Patient Actions'}
                  </span>
                </div>

                <div style={styles.patientActions}>
                  {onEditPatient && (
                    <button
                      onClick={() => onEditPatient(patient)}
                      style={styles.editButton}
                    >
                      ✎ Edit
                    </button>
                  )}
                  <button
                    onClick={() => togglePatientStatus(patient.id, patient.is_active)}
                    disabled={updating === patient.id}
                    style={{
                      ...styles.toggleButton,
                      backgroundColor: patient.is_active ? '#dc3545' : '#28a745',
                    }}
                  >
                    {updating === patient.id ? 'Updating...' : patient.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    padding: '16px',
    boxSizing: 'border-box',
    maxWidth: '100vw',
    overflowX: 'hidden',
  } as React.CSSProperties,
  header: {
    backgroundColor: 'white',
    borderBottom: '1px solid #e0e0e0',
    padding: '16px 24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
  } as React.CSSProperties,
  headerTitle: {
    margin: 0,
    fontSize: '24px',
    color: '#333',
  } as React.CSSProperties,
  backButton: {
    padding: '8px 16px',
    backgroundColor: '#f0f0f0',
    border: '1px solid #ddd',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
  } as React.CSSProperties,
  error: {
    backgroundColor: '#fee',
    color: '#c33',
    padding: '12px',
    borderRadius: '6px',
    marginBottom: '20px',
    fontSize: '14px',
  } as React.CSSProperties,
  loading: {
    textAlign: 'center',
    padding: '40px',
    fontSize: '18px',
    color: '#666',
  } as React.CSSProperties,
  patientsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '16px',
  } as React.CSSProperties,
  patientCard: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '16px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    border: '1px solid #e0e0e0',
    width: '100%',
    boxSizing: 'border-box',
    overflow: 'hidden',
  } as React.CSSProperties,
  patientHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '16px',
  } as React.CSSProperties,
  patientName: {
    margin: 0,
    fontSize: '18px',
    color: '#333',
  } as React.CSSProperties,
  patientId: {
    margin: '4px 0 0 0',
    fontSize: '14px',
    color: '#666',
  } as React.CSSProperties,
  statusBadge: {
    display: 'flex',
    alignItems: 'center',
  } as React.CSSProperties,
  statusText: {
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500',
  } as React.CSSProperties,
  patientInfo: {
    marginBottom: '16px',
  } as React.CSSProperties,
  patientActions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    justifyContent: 'flex-end',
  } as React.CSSProperties,
  statusActionSection: {
    borderRadius: '10px',
    padding: '12px',
    border: '1px solid transparent',
  } as React.CSSProperties,
  activeActionsSection: {
    backgroundColor: '#fff5f5',
    borderColor: '#f1b0b7',
  } as React.CSSProperties,
  inactiveActionsSection: {
    backgroundColor: '#f4fbf6',
    borderColor: '#a9d8b3',
  } as React.CSSProperties,
  statusActionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
  } as React.CSSProperties,
  statusActionTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#333',
  } as React.CSSProperties,
  editButton: {
    padding: '8px 16px',
    backgroundColor: '#0066cc',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  } as React.CSSProperties,
  toggleButton: {
    padding: '8px 16px',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  } as React.CSSProperties,
  emptyState: {
    textAlign: 'center',
    padding: '40px',
    color: '#666',
    fontSize: '16px',
  } as React.CSSProperties,
};