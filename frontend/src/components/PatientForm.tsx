import React, { useState } from 'react';
import { apiClient } from '../utils/apiClient';

interface PatientFormProps {
  patientId: string;
  initialData?: any;
  onCreated: (patient: any) => void;
  onCancel: () => void;
  isEdit?: boolean;
}

export default function PatientForm({
  patientId,
  initialData,
  onCreated,
  onCancel,
  isEdit = false,
}: PatientFormProps) {
  const [firstName, setFirstName] = useState(initialData?.first_name || '');
  const [lastName, setLastName] = useState(initialData?.last_name || '');
  const [dob, setDob] = useState(initialData?.dob || '');
  const [phone, setPhone] = useState(initialData?.phone || '');
  const [email, setEmail] = useState(initialData?.email || '');
  const [allergies, setAllergies] = useState(initialData?.allergies || '');
  const [medications, setMedications] = useState(initialData?.medications || '');
  const [medicalConditions, setMedicalConditions] = useState(initialData?.medical_conditions || '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

  return (
    <div style={styles.card}>
      <h2 style={styles.title}>{isEdit ? 'Edit Patient' : 'Create Patient'}</h2>
      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.group}>
          <label style={styles.label}>Patient ID:</label>
          <input
            type="text"
            value={patientId}
            readOnly
            disabled
            style={{ ...styles.input, ...styles.readOnly }}
          />
        </div>

        <div style={styles.twoCol}>
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

        <div style={styles.twoCol}>
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
            <label style={styles.label}>Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={styles.input}
            />
          </div>
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
    padding: '24px',
    borderRadius: '12px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
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
  buttonGroup: {
    display: 'flex',
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
