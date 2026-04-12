import React, { useState, useEffect } from 'react';
import { apiClient } from '../utils/apiClient';

interface ScheduledVisitsPanelProps {
  patientId: number;
}

interface Visit {
  id?: number;
  visit_date: string;
  visit_type: string;
  chief_complaint: string;
  diagnosis?: string;
  treatment_provided?: string;
  followup_instructions?: string;
  next_visit_date?: string;
}

export default function ScheduledVisitsPanel({ patientId }: ScheduledVisitsPanelProps) {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(false);
  const [upcomingOnly, setUpcomingOnly] = useState(true);

  useEffect(() => {
    loadVisits();
  }, [patientId]);

  const loadVisits = async () => {
    try {
      setLoading(true);
      const response = await apiClient.getVisitHistory(patientId, 20);
      setVisits(response.data.visits || []);
    } catch (err: any) {
      console.error('Error loading visits:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isUpcoming = (visitDate: string) => {
    return new Date(visitDate) > new Date();
  };

  const isToday = (visitDate: string) => {
    const today = new Date();
    const visitD = new Date(visitDate);
    return (
      visitD.getDate() === today.getDate() &&
      visitD.getMonth() === today.getMonth() &&
      visitD.getFullYear() === today.getFullYear()
    );
  };

  const filteredVisits = upcomingOnly ? visits.filter((v) => isUpcoming(v.visit_date)) : visits;

  if (loading) {
    return <div style={styles.loading}>Loading visits...</div>;
  }

  if (visits.length === 0) {
    return (
      <div style={styles.card}>
        <h3 style={styles.title}>📅 Scheduled Visits</h3>
        <p style={styles.emptyMessage}>No visits scheduled</p>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <h3 style={styles.title}>📅 Scheduled Visits</h3>
        <button
          onClick={() => setUpcomingOnly(!upcomingOnly)}
          style={{
            ...styles.filterBtn,
            backgroundColor: upcomingOnly ? '#0066cc' : '#999',
          }}
        >
          {upcomingOnly ? 'Upcoming' : 'All'}
        </button>
      </div>

      {filteredVisits.length === 0 ? (
        <p style={styles.emptyMessage}>
          {upcomingOnly ? 'No upcoming visits scheduled' : 'No visits found'}
        </p>
      ) : (
        <div style={styles.visitsList}>
          {filteredVisits.map((visit, idx) => (
            <div
              key={idx}
              style={{
                ...styles.visitItem,
                borderLeftColor: isToday(visit.visit_date) ? '#ff9800' : '#2196F3',
                backgroundColor: isToday(visit.visit_date) ? '#fff8e1' : '#f9f9f9',
              }}
            >
              <div style={styles.visitHeader}>
                <div>
                  <strong style={styles.visitDate}>{formatDate(visit.visit_date)}</strong>
                  {isToday(visit.visit_date) && <span style={styles.todayBadge}>TODAY</span>}
                </div>
                <span style={styles.visitType}>{visit.visit_type}</span>
              </div>

              <div style={styles.visitDetails}>
                <p>
                  <strong>Chief Complaint:</strong> {visit.chief_complaint}
                </p>
                {visit.diagnosis && (
                  <p>
                    <strong>Diagnosis:</strong> {visit.diagnosis}
                  </p>
                )}
                {visit.treatment_provided && (
                  <p>
                    <strong>Treatment:</strong> {visit.treatment_provided}
                  </p>
                )}
                {visit.followup_instructions && (
                  <p>
                    <strong>Follow-up:</strong> {visit.followup_instructions}
                  </p>
                )}
                {visit.next_visit_date && (
                  <p>
                    <strong>Next Visit:</strong> {formatDate(visit.next_visit_date)}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  card: {
    backgroundColor: 'white',
    padding: '20px',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    marginTop: '16px',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  } as React.CSSProperties,
  title: {
    margin: 0,
    fontSize: '16px',
    color: '#333',
    fontWeight: '600',
  } as React.CSSProperties,
  filterBtn: {
    padding: '6px 12px',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '500',
  } as React.CSSProperties,
  loading: {
    textAlign: 'center',
    padding: '20px',
    color: '#666',
    fontSize: '14px',
  } as React.CSSProperties,
  emptyMessage: {
    color: '#999',
    fontStyle: 'italic',
    margin: 0,
    padding: '12px',
  } as React.CSSProperties,
  visitsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  } as React.CSSProperties,
  visitItem: {
    padding: '12px',
    borderLeft: '4px solid #2196F3',
    borderRadius: '4px',
    backgroundColor: '#f9f9f9',
  } as React.CSSProperties,
  visitHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  } as React.CSSProperties,
  visitDate: {
    fontSize: '13px',
    color: '#333',
  } as React.CSSProperties,
  todayBadge: {
    marginLeft: '8px',
    fontSize: '11px',
    backgroundColor: '#ff9800',
    color: 'white',
    padding: '2px 6px',
    borderRadius: '3px',
    fontWeight: 'bold',
  } as React.CSSProperties,
  visitType: {
    fontSize: '12px',
    backgroundColor: '#e3f2fd',
    color: '#0066cc',
    padding: '4px 8px',
    borderRadius: '4px',
  } as React.CSSProperties,
  visitDetails: {
    fontSize: '13px',
    color: '#555',
    marginTop: '8px',
  } as React.CSSProperties,
};
