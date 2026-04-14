import React, { useEffect, useState } from 'react';
import { apiClient } from '../utils/apiClient';

interface Props {
  patientId: string | number;
}

export default function VitalsCard({ patientId }: Props) {
  const [isMobile, setIsMobile] = React.useState(typeof window !== 'undefined' && window.innerWidth <= 768);
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
  const [history, setHistory] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  React.useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const loadLatest = async () => {
    try {
      const response = await apiClient.getLatestVitals(patientId);
      setLatest(response.data.vitalSigns);
    } catch (err) {
      console.error('Error loading latest vitals:', err);
    }
  };

  const loadHistory = async () => {
    try {
      const response = await apiClient.getVitalsHistory(patientId, 20);
      setHistory(response.data.vitals || []);
    } catch (err) {
      console.error('Error loading vitals history:', err);
    }
  };

  useEffect(() => {
    loadLatest();
    loadHistory();
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
      await loadHistory();
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
      <form onSubmit={handleSubmit} style={{ ...styles.grid, gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))' }}>
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

      <div style={styles.historySection}>
        <button
          type="button"
          onClick={() => setShowHistory(!showHistory)}
          style={styles.toggleButton}
        >
          {showHistory ? '▼ Hide' : '▶ Show'} Vitals History
        </button>
        
        {showHistory && (
          <div style={styles.history}>
            {history.length > 0 ? (
              history.map((vital, idx) => (
                <div key={idx} style={styles.historyItem}>
                  <div style={styles.vitalTimestamp}>
                    {new Date(vital.recorded_date).toLocaleString()}
                  </div>
                  <div style={styles.vitalValues}>
                    {vital.temperature && <span>🌡️ {vital.temperature}°C</span>}
                    {vital.heart_rate && <span>❤️ {vital.heart_rate} bpm</span>}
                    {vital.blood_pressure_systolic && <span>🩸 {vital.blood_pressure_systolic}/{vital.blood_pressure_diastolic} mmHg</span>}
                    {vital.oxygen_saturation && <span>O₂ {vital.oxygen_saturation}%</span>}
                    {vital.weight && <span>⚖️ {vital.weight} kg</span>}
                    {vital.height && <span>📏 {vital.height} cm</span>}
                  </div>
                  {vital.notes && <div style={styles.vitalNotes}>{vital.notes}</div>}
                </div>
              ))
            ) : (
              <div style={styles.noHistory}>No vitals recorded yet</div>
            )}
          </div>
        )}
      </div>
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
  historySection: { marginTop: 20, paddingTop: 20, borderTop: '1px solid #eee' },
  toggleButton: { padding: '8px 16px', background: '#6c757d', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '13px' },
  history: { marginTop: 12, maxHeight: '400px', overflowY: 'auto' },
  historyItem: { padding: '10px', marginBottom: '8px', background: '#f9f9f9', borderRadius: '6px', borderLeft: '3px solid #0066cc' },
  vitalTimestamp: { fontSize: '11px', color: '#666', marginBottom: '6px', fontWeight: 'bold' },
  vitalValues: { display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '12px' },
  vitalNotes: { fontSize: '11px', color: '#666', marginTop: '6px', fontStyle: 'italic' },
  noHistory: { padding: '12px', textAlign: 'center', color: '#999', fontSize: '13px' },
};