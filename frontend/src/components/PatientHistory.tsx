import React, { useState, useEffect } from 'react';
import { apiClient } from '../utils/apiClient';

interface PatientHistoryProps {
  patientId: string | number;
}

export default function PatientHistory({ patientId }: PatientHistoryProps) {
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadHistory();
  }, [patientId]);

  const loadHistory = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiClient.getNoteHistory(patientId);
      setNotes(response.data.notes);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  const getCodeColor = (code: string) => {
    const colors = [
      { bg: '#e3f2fd', text: '#0d47a1' },
      { bg: '#e8f5e9', text: '#1b5e20' },
      { bg: '#fff3e0', text: '#e65100' },
      { bg: '#f3e5f5', text: '#6a1b9a' },
      { bg: '#fce4ec', text: '#ad1457' },
    ];
    const index = code.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % colors.length;
    return colors[index];
  };

  const formatLocalDate = (dateString?: string) => {
    if (!dateString) return 'Not available';
    const plainDateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
    if (plainDateMatch) {
      const [, year, month, day] = plainDateMatch;
      return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString();
    }

    const parsed = new Date(dateString);
    return Number.isNaN(parsed.getTime()) ? dateString : parsed.toLocaleDateString();
  };

  return (
    <div style={styles.card}>
      <h2 style={styles.title}>Clinical Notes History</h2>

      {error && <div style={styles.error}>{error}</div>}

      {loading ? (
        <p>Loading...</p>
      ) : notes.length === 0 ? (
        <p style={styles.empty}>No notes yet</p>
      ) : (
        <div style={styles.notesList}>
          {notes.map((note) => (
            <div key={note.id} style={styles.noteItem}>
              <div style={styles.noteHeader}>
                <strong>{formatLocalDate(note.note_date)}</strong>
                <small style={styles.doctor}>
                  Dr. {note.first_name} {note.last_name}
                </small>
              </div>
              {!!note.medical_codes?.length && (
                <div style={styles.codesList}>
                  {note.medical_codes.map((code: string) => {
                    const colors = getCodeColor(code);
                    return (
                      <span key={code} style={{ ...styles.codePill, backgroundColor: colors.bg, color: colors.text }}>
                        {code}
                      </span>
                    );
                  })}
                </div>
              )}
              <p style={styles.noteText}>{note.note_text}</p>
              <small style={styles.timestamp}>
                Created: {new Date(note.created_at).toLocaleString()}
              </small>
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
    padding: '24px',
    borderRadius: '12px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
  } as React.CSSProperties,
  title: {
    marginTop: 0,
    marginBottom: '20px',
    fontSize: '18px',
    color: '#333',
  } as React.CSSProperties,
  notesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  } as React.CSSProperties,
  noteItem: {
    padding: '16px',
    backgroundColor: '#f9f9f9',
    borderLeft: '4px solid #0066cc',
    borderRadius: '6px',
  } as React.CSSProperties,
  noteHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  } as React.CSSProperties,
  doctor: {
    color: '#666',
    fontSize: '13px',
  } as React.CSSProperties,
  noteText: {
    margin: '8px 0',
    whiteSpace: 'pre-wrap',
    fontSize: '14px',
    lineHeight: '1.5',
    color: '#444',
  } as React.CSSProperties,
  codesList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginBottom: '10px',
  } as React.CSSProperties,
  codePill: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '5px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: '600',
  } as React.CSSProperties,
  timestamp: {
    color: '#999',
    fontSize: '12px',
  } as React.CSSProperties,
  empty: {
    color: '#999',
    textAlign: 'center',
    padding: '20px',
  } as React.CSSProperties,
  error: {
    backgroundColor: '#fee',
    color: '#c33',
    padding: '10px',
    borderRadius: '6px',
    marginBottom: '12px',
    fontSize: '14px',
  } as React.CSSProperties,
};
