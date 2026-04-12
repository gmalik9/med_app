import React, { useEffect, useState } from 'react';
import { apiClient } from '../utils/apiClient';

interface Props {
  patientId: number;
}

export default function VitalsCard({ patientId }: Props) {
  const [form, setForm] = useState({
    temperature: '',
    heartRate: '',
    bloodPressureSystolic: '',
    bloodPressureDiastolic: '',
    respiratoryRate: '',
    oxygenSaturation: '',
    weight: '',
    height: '',
    notes: '',
  });
  const [latest, setLatest] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadLatest = async () => {
    const response = await apiClient.getLatestVitals(patientId);
    setLatest(response.data.vitalSigns);
  };

  useEffect(() => {
    loadLatest().catch(() => undefined);
  }, [patientId]);

  const handleChange = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiClient.recordVitals(patientId, {
        temperature: form.temperature || null,
        heartRate: form.heartRate || null,
        bloodPressureSystolic: form.bloodPressureSystolic || null,
        bloodPressureDiastolic: form.bloodPressureDiastolic || null,
        respiratoryRate: form.respiratoryRate || null,
        oxygenSaturation: form.oxygenSaturation || null,
        weight: form.weight || null,
        height: form.height || null,
        notes: form.notes,
      });
      setForm({ temperature: '', heartRate: '', bloodPressureSystolic: '', bloodPressureDiastolic: '', respiratoryRate: '', oxygenSaturation: '', weight: '', height: '', notes: '' });
      await loadLatest();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to record vitals');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.card}>
      <h3 style={styles.title}>Vital Signs</h3>
      {latest && <div style={styles.meta}>Latest: {new Date(latest.recorded_date).toLocaleString()}</div>}
      {error && <div style={styles.error}>{error}</div>}
      <form onSubmit={handleSubmit} style={styles.grid}>
        {[
          ['temperature', 'Temperature'],
          ['heartRate', 'Heart Rate'],
          ['bloodPressureSystolic', 'BP Systolic'],
          ['bloodPressureDiastolic', 'BP Diastolic'],
          ['respiratoryRate', 'Respiratory Rate'],
          ['oxygenSaturation', 'O2 Sat'],
          ['weight', 'Weight'],
          ['height', 'Height'],
        ].map(([key, label]) => (
          <input key={key} placeholder={label} value={(form as any)[key]} onChange={(e) => handleChange(key, e.target.value)} style={styles.input} />
        ))}
        <textarea placeholder="Notes" value={form.notes} onChange={(e) => handleChange('notes', e.target.value)} style={styles.textarea} />
        <button type="submit" disabled={saving} style={styles.button}>{saving ? 'Saving...' : 'Record Vitals'}</button>
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: { background: 'white', padding: 24, borderRadius: 12, boxShadow: '0 4px 6px rgba(0,0,0,0.1)' },
  title: { marginTop: 0, marginBottom: 12 },
  meta: { fontSize: 12, color: '#666', marginBottom: 12 },
  error: { background: '#fee', color: '#c33', padding: 10, borderRadius: 6, marginBottom: 12 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 },
  input: { padding: 10, border: '1px solid #ddd', borderRadius: 6 },
  textarea: { gridColumn: '1 / -1', padding: 10, border: '1px solid #ddd', borderRadius: 6, minHeight: 80 },
  button: { gridColumn: '1 / -1', padding: '10px 16px', background: '#0066cc', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' },
};