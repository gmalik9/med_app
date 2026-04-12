import React, { useEffect, useState } from 'react';
import { apiClient } from '../utils/apiClient';

interface Props { patientId: number; }

export default function AppointmentsCard({ patientId }: Props) {
  const [appointmentDate, setAppointmentDate] = useState('');
  const [appointmentType, setAppointmentType] = useState('');
  const [reason, setReason] = useState('');
  const [history, setHistory] = useState<any[]>([]);
  const [error, setError] = useState('');

  const loadHistory = async () => {
    const response = await apiClient.getAppointmentHistory(patientId);
    setHistory(response.data.appointments || []);
  };

  useEffect(() => { loadHistory().catch(() => undefined); }, [patientId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await apiClient.createAppointment(patientId, appointmentDate, appointmentType, reason);
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
      <form onSubmit={handleSubmit} style={styles.form}>
        <input type="datetime-local" value={appointmentDate} onChange={(e) => setAppointmentDate(e.target.value)} style={styles.input} required />
        <input placeholder="Type" value={appointmentType} onChange={(e) => setAppointmentType(e.target.value)} style={styles.input} />
        <input placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} style={styles.input} />
        <button type="submit" style={styles.button}>Schedule</button>
      </form>
      <div style={styles.list}>
        {history.slice(0, 5).map((item) => <div key={item.id} style={styles.item}>{new Date(item.appointment_date).toLocaleString()} • {item.appointment_type || 'General'} • {item.status}</div>)}
      </div>
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