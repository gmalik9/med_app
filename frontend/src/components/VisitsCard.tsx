import React, { useState } from 'react';
import { apiClient } from '../utils/apiClient';
import { useIdempotentSubmission } from '../hooks/useIdempotentSubmission';
import { HistoryPaging, useHistoryPage } from './PatientHistory';

interface Props { patientId: string | number; }

export default function VisitsCard({ patientId }: Props) {
  const [form, setForm] = useState({ visitType: '', chiefComplaint: '', diagnosis: '', treatmentProvided: '', followupInstructions: '', nextVisitDate: '' });
  const page = useHistoryPage(`visits:${patientId}`, 'visits', cursor => apiClient.getVisitHistory(patientId, 30, cursor));
  const visits = page.rows;
  const [error, setError] = useState('');
  const submission = useIdempotentSubmission('visit', String(patientId), form);

  const loadVisits = page.refreshAll;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (!await submission.submit(key => apiClient.createVisit(patientId, form, key))) return;
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
      {submission.notice && <div role="status">{submission.notice}</div>}
      {submission.uncertain && <button type="button" disabled={submission.pending} onClick={submission.acknowledgeReconciled}>History checked — start new submission</button>}
      <form onSubmit={handleSubmit} style={styles.form}>
        {Object.entries({ visitType: 'Visit Type', chiefComplaint: 'Chief Complaint', diagnosis: 'Diagnosis', treatmentProvided: 'Treatment', followupInstructions: 'Follow-up Instructions', nextVisitDate: 'Next Visit Date' }).map(([key, label]) => (
          key === 'nextVisitDate'
            ? <input key={key} type="date" value={(form as any)[key]} onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))} style={styles.input} />
            : <input key={key} placeholder={label} value={(form as any)[key]} onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))} style={styles.input} />
        ))}
        <button type="submit" disabled={submission.pending} style={styles.button}>{submission.uncertain ? 'Retry same submission' : 'Save Visit'}</button>
      </form>
      <div style={styles.list}>{visits.map((visit) => <div key={visit.id} style={styles.item}>{new Date(visit.visit_date).toLocaleString()} • {visit.visit_type || 'Visit'} • {visit.diagnosis || 'No diagnosis'}</div>)}</div>
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
  item: { fontSize: 13 },
  error: { background: '#fee', color: '#c33', padding: 10, borderRadius: 6, marginBottom: 12 },
};