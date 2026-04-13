import React, { useEffect, useState } from 'react';
import { apiClient } from '../utils/apiClient';

interface Props { patientId: string | number; }

export default function VisitsCard({ patientId }: Props) {
  const [form, setForm] = useState({ visitType: '', chiefComplaint: '', diagnosis: '', treatmentProvided: '', followupInstructions: '', nextVisitDate: '' });
  const [visits, setVisits] = useState<any[]>([]);
  const [error, setError] = useState('');

  const loadVisits = async () => {
    const response = await apiClient.getVisitHistory(patientId);
    setVisits(response.data.visits || []);
  };

  useEffect(() => { loadVisits().catch(() => undefined); }, [patientId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await apiClient.createVisit(patientId, form);
      setForm({ visitType: '', chiefComplaint: '', diagnosis: '', treatmentProvided: '', followupInstructions: '', nextVisitDate: '' });
      await loadVisits();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save visit');
    }
  };

  return (
    <div style={styles.card}>
      <h3 style={styles.title}>Visits</h3>
      {error && <div style={styles.error}>{error}</div>}
      <form onSubmit={handleSubmit} style={styles.form}>
        {Object.entries({ visitType: 'Visit Type', chiefComplaint: 'Chief Complaint', diagnosis: 'Diagnosis', treatmentProvided: 'Treatment', followupInstructions: 'Follow-up Instructions', nextVisitDate: 'Next Visit Date' }).map(([key, label]) => (
          key === 'nextVisitDate'
            ? <input key={key} type="date" value={(form as any)[key]} onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))} style={styles.input} />
            : <input key={key} placeholder={label} value={(form as any)[key]} onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))} style={styles.input} />
        ))}
        <button type="submit" style={styles.button}>Save Visit</button>
      </form>
      <div style={styles.list}>{visits.slice(0, 5).map((visit) => <div key={visit.id} style={styles.item}>{new Date(visit.visit_date).toLocaleString()} • {visit.visit_type || 'Visit'} • {visit.diagnosis || 'No diagnosis'}</div>)}</div>
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
  item: { fontSize: 13 },
  error: { background: '#fee', color: '#c33', padding: 10, borderRadius: 6, marginBottom: 12 },
};