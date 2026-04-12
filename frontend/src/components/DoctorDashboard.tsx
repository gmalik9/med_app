import React, { useState, useEffect } from 'react';
import { apiClient } from '../utils/apiClient';

interface DashboardData {
  upcomingAppointments: any[];
  todayVisits: any[];
  templates: any[];
  analyticsData: any;
}

interface NewTemplate {
  name: string;
  category: string;
  text: string;
}

export default function DoctorDashboard() {
  const [data, setData] = useState<DashboardData>({
    upcomingAppointments: [],
    todayVisits: [],
    templates: [],
    analyticsData: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [newTemplate, setNewTemplate] = useState<NewTemplate>({ name: '', category: '', text: '' });
  const [savingTemplate, setSavingTemplate] = useState(false);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [appointmentsRes, visitsRes, templatesRes, analyticsRes] = await Promise.all([
        apiClient.getUpcomingAppointments().catch(() => ({ data: { appointments: [] } })),
        apiClient.getTodayVisits().catch(() => ({ data: { visits: [] } })),
        apiClient.getTemplates().catch(() => ({ data: { templates: [] } })),
        apiClient.getDashboard().catch(() => ({ data: null })),
      ]);

      setData({
        upcomingAppointments: appointmentsRes.data.appointments || [],
        todayVisits: visitsRes.data.visits || [],
        templates: templatesRes.data.templates || [],
        analyticsData: analyticsRes.data,
      });
    } catch (err: any) {
      console.error('Dashboard load error:', err);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const saveTemplate = async () => {
    if (!newTemplate.name.trim() || !newTemplate.text.trim()) {
      alert('Template name and text are required');
      return;
    }

    try {
      setSavingTemplate(true);
      await apiClient.createTemplate({
        templateName: newTemplate.name,
        templateCategory: newTemplate.category || 'General',
        templateText: newTemplate.text,
        isPublic: false,
      });
      setNewTemplate({ name: '', category: '', text: '' });
      setShowCreateTemplate(false);
      await loadDashboardData();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to save template');
    } finally {
      setSavingTemplate(false);
    }
  };

  if (loading) {
    return <div style={styles.loading}>Loading dashboard...</div>;
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div style={styles.dashboard}>
      <h2 style={styles.title}>📊 Doctor Dashboard</h2>

      {error && <div style={styles.error}>{error}</div>}

      {/* Analytics Section */}
      {data.analyticsData && (
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>📈 Today's Summary</h3>
          <div style={styles.statsGrid}>
            <div style={styles.statBox}>
              <div style={styles.statNumber}>{data.analyticsData.totalPatients || 0}</div>
              <div style={styles.statLabel}>Total Patients</div>
            </div>
            <div style={styles.statBox}>
              <div style={styles.statNumber}>{data.analyticsData.totalNotes || 0}</div>
              <div style={styles.statLabel}>Notes Created</div>
            </div>
            <div style={styles.statBox}>
              <div style={styles.statNumber}>{data.analyticsData.totalVisits || 0}</div>
              <div style={styles.statLabel}>Visits</div>
            </div>
            <div style={styles.statBox}>
              <div style={styles.statNumber}>{data.analyticsData.totalAppointments || 0}</div>
              <div style={styles.statLabel}>Appointments</div>
            </div>
          </div>
        </div>
      )}

      {/* Scheduled Visits Section */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>🏥 Today & Upcoming Visits</h3>
        {data.todayVisits.length === 0 ? (
          <p style={styles.emptyMessage}>No scheduled visits</p>
        ) : (
          <div style={styles.visitsList}>
            {data.todayVisits.map((visit, idx) => (
              <div key={idx} style={styles.visitItem}>
                <div style={styles.visitHeader}>
                  <strong>Visit #{idx + 1}</strong>
                  <span style={styles.visitDate}>{formatDate(visit.visit_date)}</span>
                </div>
                <div style={styles.visitDetails}>
                  <p>
                    <strong>Type:</strong> {visit.visit_type}
                  </p>
                  <p>
                    <strong>Chief Complaint:</strong> {visit.chief_complaint}
                  </p>
                  {visit.diagnosis && (
                    <p>
                      <strong>Diagnosis:</strong> {visit.diagnosis}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Appointments Section */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>📅 Upcoming Appointments</h3>
        {data.upcomingAppointments.length === 0 ? (
          <p style={styles.emptyMessage}>No upcoming appointments</p>
        ) : (
          <div style={styles.appointmentsList}>
            {data.upcomingAppointments.map((apt, idx) => (
              <div key={idx} style={styles.appointmentItem}>
                <div style={styles.appointmentHeader}>
                  <strong>Appointment #{idx + 1}</strong>
                  <span style={styles.appointmentStatus}>{apt.status}</span>
                </div>
                <div style={styles.appointmentDetails}>
                  <p>
                    <strong>Date:</strong> {formatDate(apt.appointment_date)}
                  </p>
                  <p>
                    <strong>Type:</strong> {apt.appointment_type}
                  </p>
                  <p>
                    <strong>Reason:</strong> {apt.reason}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Templates Section */}
      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={styles.cardTitle}>📝 Quick Templates</h3>
          <button
            onClick={() => setShowCreateTemplate(true)}
            style={{ ...styles.button, padding: '8px 12px', fontSize: '14px' }}
          >
            + Create Template
          </button>
        </div>
        {data.templates.length === 0 ? (
          <p style={styles.emptyMessage}>No templates available</p>
        ) : (
          <div style={styles.templatesList}>
            {data.templates.slice(0, 5).map((template, idx) => (
              <div key={idx} style={styles.templateItem}>
                <div style={styles.templateName}>{template.template_name}</div>
                {template.template_category && (
                  <div style={styles.templateCategory}>{template.template_category}</div>
                )}
                <p style={styles.templateText}>{template.template_text.substring(0, 100)}...</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Template Modal */}
      {showCreateTemplate && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <h2>Create New Template</h2>
            <div style={styles.formGroup}>
              <label>Template Name:</label>
              <input
                type="text"
                value={newTemplate.name}
                onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                placeholder="e.g., General Checkup"
                style={styles.input}
              />
            </div>
            <div style={styles.formGroup}>
              <label>Category:</label>
              <input
                type="text"
                value={newTemplate.category}
                onChange={(e) => setNewTemplate({ ...newTemplate, category: e.target.value })}
                placeholder="e.g., Checkup, Lab Results"
                style={styles.input}
              />
            </div>
            <div style={styles.formGroup}>
              <label>Template Text:</label>
              <textarea
                value={newTemplate.text}
                onChange={(e) => setNewTemplate({ ...newTemplate, text: e.target.value })}
                placeholder="Enter template text..."
                style={{ ...styles.textarea, minHeight: '150px' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={saveTemplate}
                disabled={savingTemplate}
                style={styles.button}
              >
                {savingTemplate ? 'Saving...' : 'Save Template'}
              </button>
              <button
                onClick={() => {
                  setShowCreateTemplate(false);
                  setNewTemplate({ name: '', category: '', text: '' });
                }}
                style={{ ...styles.button, background: '#6c757d' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  dashboard: {
    backgroundColor: '#f5f5f5',
    padding: '24px',
    borderRadius: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  } as React.CSSProperties,
  title: {
    margin: 0,
    fontSize: '24px',
    color: '#333',
    marginBottom: '12px',
  } as React.CSSProperties,
  card: {
    backgroundColor: 'white',
    padding: '20px',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
  } as React.CSSProperties,
  cardTitle: {
    margin: '0 0 16px 0',
    fontSize: '16px',
    color: '#0066cc',
    fontWeight: '600',
  } as React.CSSProperties,
  error: {
    backgroundColor: '#fee',
    color: '#c33',
    padding: '12px',
    borderRadius: '6px',
    fontSize: '14px',
  } as React.CSSProperties,
  loading: {
    textAlign: 'center',
    padding: '40px',
    color: '#666',
    fontSize: '16px',
  } as React.CSSProperties,
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: '12px',
  } as React.CSSProperties,
  statBox: {
    padding: '16px',
    backgroundColor: '#f0f7ff',
    borderRadius: '8px',
    textAlign: 'center',
    border: '1px solid #ddd',
  } as React.CSSProperties,
  statNumber: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#0066cc',
  } as React.CSSProperties,
  statLabel: {
    fontSize: '12px',
    color: '#666',
    marginTop: '8px',
  } as React.CSSProperties,
  emptyMessage: {
    color: '#999',
    fontStyle: 'italic',
    margin: 0,
  } as React.CSSProperties,
  visitsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  } as React.CSSProperties,
  visitItem: {
    padding: '12px',
    backgroundColor: '#f9f9f9',
    borderLeft: '4px solid #4CAF50',
    borderRadius: '4px',
  } as React.CSSProperties,
  visitHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '8px',
  } as React.CSSProperties,
  visitDate: {
    fontSize: '12px',
    color: '#999',
  } as React.CSSProperties,
  visitDetails: {
    fontSize: '13px',
    color: '#555',
  } as React.CSSProperties,
  appointmentsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  } as React.CSSProperties,
  appointmentItem: {
    padding: '12px',
    backgroundColor: '#f9f9f9',
    borderLeft: '4px solid #2196F3',
    borderRadius: '4px',
  } as React.CSSProperties,
  appointmentHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '8px',
  } as React.CSSProperties,
  appointmentStatus: {
    fontSize: '12px',
    backgroundColor: '#e3f2fd',
    color: '#0066cc',
    padding: '4px 8px',
    borderRadius: '4px',
  } as React.CSSProperties,
  appointmentDetails: {
    fontSize: '13px',
    color: '#555',
  } as React.CSSProperties,
  templatesList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '12px',
  } as React.CSSProperties,
  templateItem: {
    padding: '12px',
    backgroundColor: '#fff9e6',
    borderRadius: '6px',
    border: '1px solid #ffe082',
  } as React.CSSProperties,
  templateName: {
    fontWeight: 'bold',
    color: '#333',
    marginBottom: '4px',
  } as React.CSSProperties,
  templateCategory: {
    fontSize: '11px',
    color: '#999',
    marginBottom: '4px',
  } as React.CSSProperties,
  templateText: {
    fontSize: '12px',
    color: '#666',
    margin: 0,
  } as React.CSSProperties,
  modal: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  } as React.CSSProperties,
  modalContent: {
    backgroundColor: 'white',
    padding: '24px',
    borderRadius: '12px',
    maxWidth: '500px',
    width: '90%',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
  } as React.CSSProperties,
  formGroup: {
    marginBottom: '16px',
  } as React.CSSProperties,
  input: {
    width: '100%',
    padding: '10px',
    marginTop: '4px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '14px',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,
  textarea: {
    width: '100%',
    padding: '10px',
    marginTop: '4px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '14px',
    boxSizing: 'border-box' as const,
    fontFamily: 'monospace',
  } as React.CSSProperties,
};
