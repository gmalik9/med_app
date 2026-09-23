import React, { useState } from 'react';
import { apiClient } from '../utils/apiClient';
import { useIdempotentSubmission } from '../hooks/useIdempotentSubmission';
import { HistoryPaging, useHistoryPage } from './PatientHistory';

interface Props { patientId: string | number; }

export default function AppointmentsCard({ patientId }: Props) {
  const [appointmentDate, setAppointmentDate] = useState('');
  const [appointmentType, setAppointmentType] = useState('');
  const [reason, setReason] = useState('');
  const page = useHistoryPage(`appointments:${patientId}`, 'appointments', cursor => apiClient.getAppointmentHistory(patientId, 30, cursor));
  const history = page.rows;
  const [error, setError] = useState('');
  const submission = useIdempotentSubmission('appointment', String(patientId), { appointmentDate, appointmentType, reason });

  const loadHistory = page.refreshAll;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (!await submission.submit(key => apiClient.createAppointment(patientId, appointmentDate, appointmentType, reason, key))) return;
      setAppointmentDate('');
      setAppointmentType('');
      setReason('');
      await loadHistory();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create appointment');
    }
  };

  return (
    <div style={styles.card}>
      <h3 style={styles.title}>Appointments</h3>
      {error && <div style={styles.error}>{error}</div>}
      {submission.notice && <div role="status">{submission.notice}</div>}
      {submission.uncertain && <button type="button" disabled={submission.pending} onClick={submission.acknowledgeReconciled}>History checked — start new submission</button>}
      <form onSubmit={handleSubmit} style={styles.form}>
        <input type="datetime-local" aria-label="Appointment date" value={appointmentDate} onChange={(e) => setAppointmentDate(e.target.value)} style={styles.input} required />
        <input placeholder="Type" value={appointmentType} onChange={(e) => setAppointmentType(e.target.value)} style={styles.input} />
        <input placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} style={styles.input} />
        <button type="submit" disabled={submission.pending} style={styles.button}>{submission.uncertain ? 'Retry same submission' : 'Schedule'}</button>
      </form>
      <div style={styles.list}>
        {history.map((item) => <div key={item.id} style={styles.item}>{new Date(item.appointment_date).toLocaleString()} • {item.appointment_type || 'General'} • {item.status}</div>)}
      </div>
      <HistoryPaging page={page} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: { background: 'white', padding: 24, borderRadius: 12, boxShadow: '0 4px 6px rgba(0,0,0,0.1)' },
  title: { marginTop: 0 },
  form: { display: 'flex', flexDirection: 'column', gap: 10 },
  input: { padding: 10, border: '1px solid #ddd', borderRadius: 6 },
  button: { padding: 10, background: '#0066cc', color: '#fff', border: 'none', borderRadius: 6 },
  list: { marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 },
  item: { fontSize: 13, color: '#444' },
  error: { background: '#fee', color: '#c33', padding: 10, borderRadius: 6, marginBottom: 12 },
};