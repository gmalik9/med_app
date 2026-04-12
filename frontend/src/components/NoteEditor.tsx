import React, { useState, useEffect } from 'react';
import { apiClient } from '../utils/apiClient';

interface NoteEditorProps {
  patientId: number;
}

export default function NoteEditor({ patientId }: NoteEditorProps) {
  const [noteText, setNoteText] = useState('');
  const [savedNote, setSavedNote] = useState<any>(null);
  const [medicalCodes, setMedicalCodes] = useState<string[]>([]);
  const [medicalCodeInput, setMedicalCodeInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

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

  useEffect(() => {
    loadNote();
  }, [patientId, selectedDate]);

  const loadNote = async () => {
    try {
      const response = await apiClient.getTodayNote(patientId, selectedDate);
      if (response.data.exists) {
        setNoteText(response.data.note.note_text);
        setMedicalCodes(response.data.note.medical_codes || []);
        setSavedNote(response.data.note);
      } else {
        setNoteText('');
        setMedicalCodes([]);
        setSavedNote(null);
      }
    } catch (err: any) {
      console.error('Error loading note:', err);
    }
  };

  const addMedicalCode = () => {
    const code = medicalCodeInput.trim().toUpperCase();
    if (!code) return;
    setMedicalCodes((prev) => [...prev, code]);
    setMedicalCodeInput('');
  };

  const removeMedicalCode = (codeToRemove: string) => {
    setMedicalCodes((prev) => prev.filter((code) => code !== codeToRemove));
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
      const response = await apiClient.saveNote(patientId, noteText, selectedDate, medicalCodes);
      setSavedNote(response.data.note);
      setMedicalCodes(response.data.note.medical_codes || []);
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

      <div style={styles.group}>
        <label style={styles.label}>Medical Codes</label>
        <div style={styles.codeInputRow}>
          <input
            type="text"
            value={medicalCodeInput}
            onChange={(e) => setMedicalCodeInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addMedicalCode();
              }
            }}
            placeholder="Add a code and press Enter"
            style={styles.input}
          />
          <button type="button" onClick={addMedicalCode} style={styles.addCodeBtn}>
            Add Code
          </button>
        </div>
        <div style={styles.codesList}>
          {medicalCodes.map((code) => {
            const colors = getCodeColor(code);
            return (
              <span key={code} style={{ ...styles.codePill, backgroundColor: colors.bg, color: colors.text }}>
                {code}
                <button type="button" onClick={() => removeMedicalCode(code)} style={{ ...styles.codeRemoveBtn, color: colors.text }}>
                  ×
                </button>
              </span>
            );
          })}
        </div>
      </div>

      {savedNote && (
        <div style={styles.meta}>
          <small>
            Note date: {formatLocalDate(savedNote.note_date)} • Last saved: {new Date(savedNote.updated_at).toLocaleString()}
          </small>
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
  codeInputRow: {
    display: 'flex',
    gap: '8px',
  } as React.CSSProperties,
  addCodeBtn: {
    padding: '10px 14px',
    backgroundColor: '#0066cc',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,
  codesList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginTop: '10px',
  } as React.CSSProperties,
  codePill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: '600',
  } as React.CSSProperties,
  codeRemoveBtn: {
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: '14px',
    padding: 0,
    lineHeight: 1,
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
