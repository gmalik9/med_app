import React, { useState, useEffect } from 'react';
import { apiClient } from '../utils/apiClient';

interface DoctorData {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  specialty?: string;
  license_number?: string;
  phone?: string;
  bio?: string;
}

interface DoctorProfileProps {
  onClose?: () => void;
}

export default function DoctorProfile({ onClose }: DoctorProfileProps) {
  const [doctor, setDoctor] = useState<DoctorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<DoctorData>>({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadDoctorProfile();
  }, []);

  const loadDoctorProfile = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/api/auth/profile');
      const doctorInfo = response.data.user || response.data;
      setDoctor(doctorInfo);
      setFormData(doctorInfo);
    } catch (err: any) {
      console.error('Failed to load doctor profile:', err);
      setError('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSave = async () => {
    try {
      setError('');
      setSuccess('');
      
      const updateData = {
        first_name: formData.first_name,
        last_name: formData.last_name,
        specialty: formData.specialty,
        license_number: formData.license_number,
        phone: formData.phone,
        bio: formData.bio,
      };

      const response = await apiClient.put('/api/auth/profile', updateData);
      setDoctor(response.data.user);
      setEditing(false);
      setSuccess('Profile updated successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      console.error('Failed to save profile:', err);
      setError(err.response?.data?.error || 'Failed to save profile');
    }
  };

  if (loading) {
    return <div style={styles.loading}>Loading profile...</div>;
  }

  if (!doctor) {
    return <div style={styles.error}>Failed to load profile</div>;
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>👨‍⚕️ Doctor Profile</h2>
        {onClose && (
          <button
            style={styles.closeButton}
            onClick={onClose}
            title="Close"
          >
            ✕
          </button>
        )}
      </div>

      {error && <div style={styles.errorMessage}>{error}</div>}
      {success && <div style={styles.successMessage}>{success}</div>}

      <div style={styles.card}>
        {!editing ? (
          <>
            <div style={styles.viewMode}>
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>Personal Information</h3>
                <div style={styles.infoGrid}>
                  <div style={styles.infoItem}>
                    <label style={styles.label}>First Name</label>
                    <p style={styles.value}>{doctor.first_name || '-'}</p>
                  </div>
                  <div style={styles.infoItem}>
                    <label style={styles.label}>Last Name</label>
                    <p style={styles.value}>{doctor.last_name || '-'}</p>
                  </div>
                </div>
                <div style={styles.infoItem}>
                  <label style={styles.label}>Email</label>
                  <p style={styles.value}>{doctor.email}</p>
                </div>
                <div style={styles.infoItem}>
                  <label style={styles.label}>Phone</label>
                  <p style={styles.value}>{doctor.phone || '-'}</p>
                </div>
              </div>

              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>Professional Information</h3>
                <div style={styles.infoGrid}>
                  <div style={styles.infoItem}>
                    <label style={styles.label}>Specialty</label>
                    <p style={styles.value}>{doctor.specialty || '-'}</p>
                  </div>
                  <div style={styles.infoItem}>
                    <label style={styles.label}>License Number</label>
                    <p style={styles.value}>{doctor.license_number || '-'}</p>
                  </div>
                </div>
              </div>

              {doctor.bio && (
                <div style={styles.section}>
                  <h3 style={styles.sectionTitle}>Bio</h3>
                  <p style={styles.bioText}>{doctor.bio}</p>
                </div>
              )}
            </div>

            <button
              style={styles.editButton}
              onClick={() => setEditing(true)}
            >
              ✏️ Edit Profile
            </button>
          </>
        ) : (
          <>
            <div style={styles.editMode}>
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>Personal Information</h3>
                <div style={styles.formGrid}>
                  <div style={styles.formItem}>
                    <label style={styles.formLabel}>First Name *</label>
                    <input
                      type="text"
                      name="first_name"
                      value={formData.first_name || ''}
                      onChange={handleChange}
                      style={styles.input}
                      placeholder="First name"
                    />
                  </div>
                  <div style={styles.formItem}>
                    <label style={styles.formLabel}>Last Name *</label>
                    <input
                      type="text"
                      name="last_name"
                      value={formData.last_name || ''}
                      onChange={handleChange}
                      style={styles.input}
                      placeholder="Last name"
                    />
                  </div>
                </div>
                <div style={styles.formItem}>
                  <label style={styles.formLabel}>Phone</label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone || ''}
                    onChange={handleChange}
                    style={styles.input}
                    placeholder="Phone number"
                  />
                </div>
              </div>

              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>Professional Information</h3>
                <div style={styles.formGrid}>
                  <div style={styles.formItem}>
                    <label style={styles.formLabel}>Specialty</label>
                    <input
                      type="text"
                      name="specialty"
                      value={formData.specialty || ''}
                      onChange={handleChange}
                      style={styles.input}
                      placeholder="e.g., Cardiology, General Medicine"
                    />
                  </div>
                  <div style={styles.formItem}>
                    <label style={styles.formLabel}>License Number</label>
                    <input
                      type="text"
                      name="license_number"
                      value={formData.license_number || ''}
                      onChange={handleChange}
                      style={styles.input}
                      placeholder="License number"
                    />
                  </div>
                </div>
              </div>

              <div style={styles.section}>
                <div style={styles.formItem}>
                  <label style={styles.formLabel}>Bio</label>
                  <textarea
                    name="bio"
                    value={formData.bio || ''}
                    onChange={handleChange}
                    style={styles.textarea}
                    placeholder="Add a brief bio..."
                    rows={4}
                  />
                </div>
              </div>
            </div>

            <div style={styles.buttonGroup}>
              <button
                style={styles.cancelButton}
                onClick={() => {
                  setEditing(false);
                  setFormData(doctor);
                }}
              >
                Cancel
              </button>
              <button
                style={styles.saveButton}
                onClick={handleSave}
              >
                Save Changes
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    padding: '24px',
    maxWidth: '600px',
    margin: '0 auto',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  } as React.CSSProperties,
  title: {
    margin: 0,
    fontSize: '24px',
    color: '#333',
  } as React.CSSProperties,
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    color: '#999',
    padding: '0',
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as React.CSSProperties,
  card: {
    backgroundColor: 'white',
    padding: '24px',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
  } as React.CSSProperties,
  viewMode: {
    marginBottom: '24px',
  } as React.CSSProperties,
  editMode: {
    marginBottom: '24px',
  } as React.CSSProperties,
  section: {
    marginBottom: '24px',
    paddingBottom: '24px',
    borderBottom: '1px solid #eee',
  } as React.CSSProperties,
  sectionTitle: {
    margin: '0 0 16px 0',
    fontSize: '16px',
    fontWeight: '600',
    color: '#0066cc',
  } as React.CSSProperties,
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
    marginBottom: '16px',
  } as React.CSSProperties,
  infoItem: {
    marginBottom: '16px',
  } as React.CSSProperties,
  label: {
    display: 'block',
    fontSize: '12px',
    fontWeight: '600',
    color: '#666',
    marginBottom: '6px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  } as React.CSSProperties,
  value: {
    margin: 0,
    fontSize: '16px',
    color: '#333',
  } as React.CSSProperties,
  bioText: {
    margin: 0,
    fontSize: '14px',
    color: '#555',
    lineHeight: '1.6',
  } as React.CSSProperties,
  formGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
    marginBottom: '16px',
  } as React.CSSProperties,
  formItem: {
    marginBottom: '16px',
  } as React.CSSProperties,
  formLabel: {
    display: 'block',
    fontSize: '12px',
    fontWeight: '600',
    color: '#666',
    marginBottom: '6px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  } as React.CSSProperties,
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '14px',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  } as React.CSSProperties,
  textarea: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '14px',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    resize: 'vertical',
  } as React.CSSProperties,
  buttonGroup: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    marginTop: '24px',
  } as React.CSSProperties,
  editButton: {
    backgroundColor: '#0066cc',
    color: 'white',
    border: 'none',
    padding: '10px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    width: '100%',
  } as React.CSSProperties,
  saveButton: {
    backgroundColor: '#4CAF50',
    color: 'white',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  } as React.CSSProperties,
  cancelButton: {
    backgroundColor: '#f0f0f0',
    color: '#333',
    border: '1px solid #ddd',
    padding: '10px 20px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  } as React.CSSProperties,
  loading: {
    textAlign: 'center',
    padding: '40px',
    color: '#666',
  } as React.CSSProperties,
  error: {
    textAlign: 'center',
    padding: '40px',
    color: '#c33',
  } as React.CSSProperties,
  errorMessage: {
    backgroundColor: '#fee',
    color: '#c33',
    padding: '12px',
    borderRadius: '6px',
    marginBottom: '16px',
    fontSize: '14px',
  } as React.CSSProperties,
  successMessage: {
    backgroundColor: '#e8f5e9',
    color: '#2e7d32',
    padding: '12px',
    borderRadius: '6px',
    marginBottom: '16px',
    fontSize: '14px',
  } as React.CSSProperties,
};
