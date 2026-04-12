import React, { useEffect, useState } from 'react';
import { apiClient } from '../utils/apiClient';

interface Props { patientId: number; }

export default function TemplatesAnalyticsPanel({ patientId }: Props) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [trends, setTrends] = useState<any>(null);

  useEffect(() => {
    apiClient.getTemplates().then((r) => setTemplates(r.data.templates || [])).catch(() => undefined);
    apiClient.getDashboard().then((r) => setStats(r.data.stats)).catch(() => undefined);
    apiClient.getPatientTrends(patientId).then((r) => setTrends(r.data.trends)).catch(() => undefined);
  }, [patientId]);

  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>
        <h3 style={styles.title}>Note Templates</h3>
        <div style={styles.list}>{templates.slice(0, 5).map((template) => <div key={template.id} style={styles.item}>{template.template_name} • {template.template_category || 'General'}</div>)}</div>
      </div>
      <div style={styles.card}>
        <h3 style={styles.title}>Analytics</h3>
        {stats && <div style={styles.list}><div style={styles.item}>Total Patients: {stats.totalPatients}</div><div style={styles.item}>Notes This Month: {stats.notesThisMonth}</div><div style={styles.item}>Appointments Today: {stats.appointmentsToday}</div></div>}
        {trends?.vitals?.length ? <div style={styles.item}>Recent vitals points: {trends.vitals.length}</div> : null}
        <button onClick={() => window.print()} style={styles.button}>Print / Export</button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 },
  card: { background: 'white', padding: 24, borderRadius: 12, boxShadow: '0 4px 6px rgba(0,0,0,0.1)' },
  title: { marginTop: 0 },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  item: { fontSize: 13, color: '#444' },
  button: { marginTop: 12, padding: '10px 16px', background: '#0066cc', color: 'white', border: 'none', borderRadius: 6 },
};