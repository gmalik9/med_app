import React, { useState, useEffect } from 'react';
import { apiClient } from '../utils/apiClient';

interface NoteEditorProps {
  patientId: number;
}

export default function NoteEditor({ patientId }: NoteEditorProps) {
  const [noteText, setNoteText] = useState('');
  const [savedNote, setSavedNote] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    loadNote();
  }, [patientId, selectedDate]);

  const loadNote = async () => {
    try {
      const response = await apiClient.getTodayNote(patientId, selectedDate);
      if (response.data.exists) {
        setNoteText(response.data.note.note_text);
        setSavedNote(response.data.note);
      } else {
        setNoteText('');
        setSavedNote(null);
      }
    } catch (err: any) {
      console.error('Error loading note:', err);
    }
  };

  const handleSave = async () => {
    if (!noteText.trim()) {
      setError('Note cannot be empty');
      return;
    }

    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await apiClient.saveNote(patientId, noteText, selectedDate);
      setSavedNote(response.data.note);
      setSuccess('Note saved successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save note');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.card}>
      <h2 style={styles.title}>Clinical Notes</h2>

      <div style={styles.group}>
        <label style={styles.label}>Date</label>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          style={styles.input}
        />
      </div>

      <div style={styles.group}>
        <label style={styles.label}>Note</label>
        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="Enter clinical notes for this patient..."
          style={styles.textarea}
          rows={10}
        />
      </div>

      {savedNote && (
        <div style={styles.meta}>
          <small>Last saved: {new Date(savedNote.updated_at).toLocaleString()}</small>
        </div>
      )}

      {error && <div style={styles.error}>{error}</div>}
      {success && <div style={styles.success}>{success}</div>}

      <button onClick={handleSave} disabled={loading} style={styles.saveBtn}>
        {loading ? 'Saving...' : 'Save Note'}
      </button>
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
  group: {
    display: 'flex',
    flexDirection: 'column',
    marginBottom: '16px',
  } as React.CSSProperties,
  label: {
    fontSize: '14px',
    fontWeight: '500',
    marginBottom: '6px',
    color: '#333',
  } as React.CSSProperties,
  input: {
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '14px',
  } as React.CSSProperties,
  textarea: {
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '14px',
    fontFamily: 'monospace',
    resize: 'vertical',
  } as React.CSSProperties,
  meta: {
    fontSize: '12px',
    color: '#999',
    marginBottom: '12px',
  } as React.CSSProperties,
  saveBtn: {
    padding: '10px 20px',
    backgroundColor: '#28a745',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
  } as React.CSSProperties,
  error: {
    backgroundColor: '#fee',
    color: '#c33',
    padding: '10px',
    borderRadius: '6px',
    marginBottom: '12px',
    fontSize: '14px',
  } as React.CSSProperties,
  success: {
    backgroundColor: '#efe',
    color: '#3c3',
    padding: '10px',
    borderRadius: '6px',
    marginBottom: '12px',
    fontSize: '14px',
  } as React.CSSProperties,
};
