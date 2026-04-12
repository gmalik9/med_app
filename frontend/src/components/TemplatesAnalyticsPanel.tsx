import React, { useEffect, useState } from 'react';
import { apiClient } from '../utils/apiClient';

interface Props { 
  patientId: number;
}

export default function TemplatesAnalyticsPanel({ patientId }: Props) {
  const [vitals, setVitals] = useState<any[]>([]);
  const [trends, setTrends] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPatientData();
  }, [patientId]);

  const loadPatientData = async () => {
    try {
      setLoading(true);
      // Load patient vitals history
      const vitalsResponse = await apiClient.getVitalsHistory(patientId, 10);
      setVitals(vitalsResponse.data.vitals || []);
      
      // Load patient trends
      const trendsResponse = await apiClient.getPatientTrends(patientId);
      setTrends(trendsResponse.data.trends || {});
    } catch (err) {
      console.error('Error loading patient analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>
        <h3 style={styles.title}>Vitals History</h3>
        {loading ? (
          <div style={styles.loading}>Loading vitals...</div>
        ) : vitals.length > 0 ? (
          <div style={styles.list}>
            {vitals.slice(0, 5).map((vital, idx) => (
              <div key={idx} style={styles.item}>
                <div style={styles.vitalDate}>{new Date(vital.recorded_date).toLocaleString()}</div>
                <div style={styles.vitalData}>
                  {vital.temperature && <span>🌡️ {vital.temperature}°C</span>}
                  {vital.heart_rate && <span>❤️ {vital.heart_rate} bpm</span>}
                  {vital.blood_pressure_systolic && <span>🩸 {vital.blood_pressure_systolic}/{vital.blood_pressure_diastolic}</span>}
                  {vital.oxygen_saturation && <span>O₂ {vital.oxygen_saturation}%</span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={styles.empty}>No vitals recorded yet</div>
        )}
      </div>

      <div style={styles.card}>
        <h3 style={styles.title}>Patient Analytics</h3>
        {loading ? (
          <div style={styles.loading}>Loading analytics...</div>
        ) : (
          <div style={styles.list}>
            {trends?.totalNotes !== undefined && (
              <div style={styles.item}>
                📝 Total Notes: {trends.totalNotes}
              </div>
            )}
            {trends?.totalAppointments !== undefined && (
              <div style={styles.item}>
                📅 Total Appointments: {trends.totalAppointments}
              </div>
            )}
            {trends?.vitals?.length ? (
              <div style={styles.item}>
                📊 Vital Records: {trends.vitals.length}
              </div>
            ) : (
              <div style={styles.item}>No vital trends available</div>
            )}
            <button onClick={() => window.print()} style={styles.button}>🖨️ Print / Export</button>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 },
  card: { background: 'white', padding: 24, borderRadius: 12, boxShadow: '0 4px 6px rgba(0,0,0,0.1)' },
  title: { marginTop: 0, fontSize: '16px', fontWeight: '600' },
  list: { display: 'flex', flexDirection: 'column', gap: 12 },
  item: { fontSize: 13, color: '#444', padding: '8px 0', borderBottom: '1px solid #eee' },
  vitalDate: { fontSize: '11px', color: '#999', marginBottom: '4px' },
  vitalData: { display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '12px' },
  empty: { fontSize: 13, color: '#999', fontStyle: 'italic' },
  loading: { fontSize: 13, color: '#666' },
  button: { marginTop: 12, padding: '10px 16px', background: '#0066cc', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '13px', width: '100%' },
};