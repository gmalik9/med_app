import React, { useState } from 'react';
import { apiClient } from '../utils/apiClient';

interface PatientFormProps {
  patientId: string;
  initialData?: any;
  onCreated: (patient: any) => void;
  onCancel: () => void;
  isEdit?: boolean;
  onStatusChange?: (patientId: number, isActive: boolean) => void;
  allowPatientIdEdit?: boolean;
  onPatientIdChange?: (patientId: string) => void;
}

export default function PatientForm({
  patientId,
  initialData,
  onCreated,
  onCancel,
  isEdit = false,
  onStatusChange,
  allowPatientIdEdit = false,
  onPatientIdChange,
}: PatientFormProps) {
  const [isMobile, setIsMobile] = React.useState(typeof window !== 'undefined' && window.innerWidth <= 768);
  const [firstName, setFirstName] = useState(initialData?.first_name || '');
  const [lastName, setLastName] = useState(initialData?.last_name || '');
  const [gender, setGender] = useState(initialData?.gender || '');
  const [dob, setDob] = useState(initialData?.dob || '');
  const [phone, setPhone] = useState(initialData?.phone || '');
  const [email, setEmail] = useState(initialData?.email || '');
  const [allergies, setAllergies] = useState(initialData?.allergies || '');
  const [medications, setMedications] = useState(initialData?.medications || '');
  const [medicalConditions, setMedicalConditions] = useState(initialData?.medical_conditions || '');
  const [isActive, setIsActive] = useState(initialData?.is_active !== false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);

  React.useEffect(() => {
    setFirstName(initialData?.first_name || initialData?.firstName || '');
    setLastName(initialData?.last_name || initialData?.lastName || '');
    setGender(initialData?.gender || '');
    setDob(initialData?.dob || '');
    setPhone(initialData?.phone || '');
    setEmail(initialData?.email || '');
    setAllergies(initialData?.allergies || '');
    setMedications(initialData?.medications || '');
    setMedicalConditions(initialData?.medical_conditions || initialData?.medicalConditions || '');
    setIsActive(initialData?.is_active !== false);
  }, [initialData]);

  React.useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const cumulativeMedicalCodes = initialData?.cumulative_medical_codes || [];

  const getCodeColor = (code: string) => {
    const colors = [
      { bg: '#e3f2fd', text: '#0d47a1' },
      { bg: '#e8f5e9', text: '#1b5e20' },
      { bg: '#fff3e0', text: '#e65100' },
      { bg: '#f3e5f5', text: '#6a1b9a' },
      { bg: '#fce4ec', text: '#ad1457' },
    ];
    const index = code.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % colors.length;
    return colors[index];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let result;
      if (isEdit && initialData) {
        result = await apiClient.updatePatient(initialData.id, {
          firstName,
          lastName,
          gender,
          dob: dob || null,
          phone,
          email,
          allergies,
          medications,
          medicalConditions,
        });
      } else {
        result = await apiClient.createPatient(patientId, firstName, lastName);
        await apiClient.updatePatient(result.data.patient.id, {
          firstName,
          lastName,
          gender,
          dob: dob || null,
          phone,
          email,
          allergies,
          medications,
          medicalConditions,
        });
        result = await apiClient.getPatient(result.data.patient.id);
      }
      onCreated(result.data.patient);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save patient');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusToggle = async () => {
    if (!isEdit || !initialData?.id || !onStatusChange) {
      return;
    }

    setError('');
    setStatusUpdating(true);

    try {
      const nextStatus = !isActive;
      await onStatusChange(initialData.id, nextStatus);
      setIsActive(nextStatus);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update patient status');
    } finally {
      setStatusUpdating(false);
    }
  };

  return (
    <div style={styles.card}>
      <h2 style={styles.title}>{isEdit ? 'Edit Patient' : 'Create Patient'}</h2>
      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.group}>
          <label style={styles.label}>Patient ID:</label>
          <input
            type="text"
            value={patientId}
            readOnly={!allowPatientIdEdit}
            disabled={!allowPatientIdEdit}
            onChange={(e) => onPatientIdChange?.(e.target.value)}
            style={{ ...styles.input, ...(allowPatientIdEdit ? {} : styles.readOnly) }}
          />
        </div>

        <div style={{ ...styles.twoCol, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
          <div style={styles.group}>
            <label style={styles.label}>First Name</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              style={styles.input}
            />
          </div>
          <div style={styles.group}>
            <label style={styles.label}>Last Name</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              style={styles.input}
            />
          </div>
        </div>

        <div style={{ ...styles.twoCol, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
          <div style={styles.group}>
            <label style={styles.label}>Date of Birth</label>
            <input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              style={styles.input}
            />
          </div>
          <div style={styles.group}>
            <label style={styles.label}>Gender</label>
            <select value={gender} onChange={(e) => setGender(e.target.value)} style={styles.input}>
              <option value="">Select gender</option>
              <option value="Female">Female</option>
              <option value="Male">Male</option>
              <option value="Non-binary">Non-binary</option>
              <option value="Other">Other</option>
              <option value="Prefer not to say">Prefer not to say</option>
            </select>
          </div>
        </div>

        <div style={{ ...styles.twoCol, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
          <div style={styles.group}>
            <label style={styles.label}>Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={styles.input}
            />
          </div>
          <div style={styles.group}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
            />
          </div>
        </div>

        <div style={styles.group}>
          <label style={styles.label}>Allergies</label>
          <textarea
            value={allergies}
            onChange={(e) => setAllergies(e.target.value)}
            placeholder="List any allergies..."
            style={styles.textarea}
            rows={2}
          />
        </div>

        <div style={styles.group}>
          <label style={styles.label}>Medications</label>
          <textarea
            value={medications}
            onChange={(e) => setMedications(e.target.value)}
            placeholder="Current medications..."
            style={styles.textarea}
            rows={2}
          />
        </div>

        <div style={styles.group}>
          <label style={styles.label}>Medical Conditions</label>
          <textarea
            value={medicalConditions}
            onChange={(e) => setMedicalConditions(e.target.value)}
            placeholder="Relevant medical history..."
            style={styles.textarea}
            rows={2}
          />
        </div>

        {isEdit && (
          <div style={styles.group}>
            <label style={styles.label}>Cumulative Medical Codes</label>
            <div style={styles.codesList}>
              {cumulativeMedicalCodes.length > 0 ? (
                cumulativeMedicalCodes.map((code: string) => {
                  const colors = getCodeColor(code);
                  return (
                    <span key={code} style={{ ...styles.codePill, backgroundColor: colors.bg, color: colors.text }}>
                      {code}
                    </span>
                  );
                })
              ) : (
                <span style={styles.noCodesText}>No medical codes recorded yet.</span>
              )}
            </div>
          </div>
        )}

        {isEdit && initialData && onStatusChange && (
          <div
            style={{
              ...styles.statusSection,
              ...(isActive ? styles.activeSection : styles.inactiveSection),
            }}
          >
            <div style={styles.statusSectionHeader}>
              <span style={styles.statusSectionTitle}>
                {isActive ? 'Active Patient Controls' : 'Inactive Patient Controls'}
              </span>
              <span
                style={{
                  ...styles.statusPill,
                  backgroundColor: isActive ? '#d4edda' : '#f8d7da',
                  color: isActive ? '#155724' : '#721c24',
                }}
              >
                {isActive ? 'Active' : 'Inactive'}
              </span>
            </div>

            <p style={styles.statusDescription}>
              {isActive
                ? 'This patient is currently active. You can deactivate them if they should no longer appear as active.'
                : 'This patient is currently inactive. You can reactivate them when they should return to active status.'}
            </p>

            <button
              type="button"
              onClick={handleStatusToggle}
              disabled={statusUpdating}
              style={{
                ...styles.statusButton,
                backgroundColor: isActive ? '#dc3545' : '#28a745',
              }}
            >
              {statusUpdating ? 'Updating...' : isActive ? 'Deactivate Patient' : 'Activate Patient'}
            </button>
          </div>
        )}

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.buttonGroup}>
          <button type="submit" disabled={loading} style={styles.submitBtn}>
            {loading ? 'Saving...' : 'Save'}
          </button>
          <button type="button" onClick={onCancel} style={styles.cancelBtn}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

const styles = {
  card: {
    backgroundColor: 'white',
    padding: '16px',
    borderRadius: '12px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    width: '100%',
    boxSizing: 'border-box',
    maxWidth: '100%',
    overflow: 'hidden',
  } as React.CSSProperties,
  title: {
    marginTop: 0,
    marginBottom: '20px',
    fontSize: '18px',
    color: '#333',
  } as React.CSSProperties,
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  } as React.CSSProperties,
  group: {
    display: 'flex',
    flexDirection: 'column',
  } as React.CSSProperties,
  label: {
    fontSize: '14px',
    fontWeight: '500',
    marginBottom: '6px',
    color: '#333',
  } as React.CSSProperties,
  input: {
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '14px',
  } as React.CSSProperties,
  readOnly: {
    backgroundColor: '#f5f5f5',
    cursor: 'not-allowed',
  } as React.CSSProperties,
  textarea: {
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '14px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    resize: 'vertical',
  } as React.CSSProperties,
  twoCol: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  } as React.CSSProperties,
  statusSection: {
    borderRadius: '10px',
    padding: '16px',
    border: '1px solid transparent',
  } as React.CSSProperties,
  activeSection: {
    backgroundColor: '#fff5f5',
    borderColor: '#f1b0b7',
  } as React.CSSProperties,
  inactiveSection: {
    backgroundColor: '#f4fbf6',
    borderColor: '#a9d8b3',
  } as React.CSSProperties,
  statusSectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '8px',
  } as React.CSSProperties,
  statusSectionTitle: {
    fontSize: '15px',
    fontWeight: '600',
    color: '#333',
  } as React.CSSProperties,
  statusPill: {
    padding: '4px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: '600',
  } as React.CSSProperties,
  statusDescription: {
    margin: '0 0 12px 0',
    fontSize: '14px',
    color: '#555',
    lineHeight: 1.4,
  } as React.CSSProperties,
  statusButton: {
    padding: '10px 16px',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
  } as React.CSSProperties,
  codesList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  } as React.CSSProperties,
  codePill: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: '600',
  } as React.CSSProperties,
  noCodesText: {
    fontSize: '13px',
    color: '#777',
  } as React.CSSProperties,
  buttonGroup: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    justifyContent: 'flex-end',
  } as React.CSSProperties,
  submitBtn: {
    padding: '10px 20px',
    backgroundColor: '#0066cc',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
  } as React.CSSProperties,
  cancelBtn: {
    padding: '10px 20px',
    backgroundColor: '#f0f0f0',
    border: '1px solid #ddd',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
  } as React.CSSProperties,
  error: {
    backgroundColor: '#fee',
    color: '#c33',
    padding: '10px',
    borderRadius: '6px',
    fontSize: '14px',
  } as React.CSSProperties,
};
