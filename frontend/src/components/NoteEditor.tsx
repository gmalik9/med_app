import React, { useState, useEffect } from 'react';
import { apiClient } from '../utils/apiClient';

interface NoteEditorProps {
  patientId: number;
}

interface Template {
  id: number;
  template_name: string;
  template_category: string;
  template_text: string;
  creator_id: number;
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
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: '', category: '', text: '' });

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
    loadTemplates();
  }, [patientId, selectedDate]);

  const loadTemplates = async () => {
    try {
      const response = await apiClient.getTemplates();
      setTemplates(response.data.templates || []);
    } catch (err: any) {
      console.error('Error loading templates:', err);
    }
  };

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

  const applyTemplate = (template: Template) => {
    setNoteText(template.template_text);
    setSuccess(`Template "${template.template_name}" applied!`);
    setTimeout(() => setSuccess(''), 2000);
  };

  const saveTemplate = async () => {
    if (!newTemplate.name.trim() || !newTemplate.text.trim()) {
      setError('Template name and text are required');
      return;
    }
    
    try {
      await apiClient.createTemplate({
        templateName: newTemplate.name,
        templateCategory: newTemplate.category || 'General',
        templateText: newTemplate.text,
        isPublic: false
      });
      setNewTemplate({ name: '', category: '', text: '' });
      setShowCreateTemplate(false);
      setSuccess('Template saved successfully!');
      await loadTemplates();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save template');
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
        <div style={styles.templateHeader}>
          <label style={styles.label}>Quick Templates</label>
          <button
            type="button"
            onClick={() => setShowCreateTemplate(!showCreateTemplate)}
            style={styles.createTemplateBtn}
          >
            {showCreateTemplate ? 'Cancel' : '+ Create Template'}
          </button>
        </div>

        {showCreateTemplate && (
          <div style={styles.templateForm}>
            <input
              type="text"
              placeholder="Template Name"
              value={newTemplate.name}
              onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
              style={styles.input}
            />
            <input
              type="text"
              placeholder="Category (e.g., Consultation, Follow-up)"
              value={newTemplate.category}
              onChange={(e) => setNewTemplate({ ...newTemplate, category: e.target.value })}
              style={styles.input}
            />
            <textarea
              placeholder="Template Text"
              value={newTemplate.text}
              onChange={(e) => setNewTemplate({ ...newTemplate, text: e.target.value })}
              style={{ ...styles.textarea, minHeight: '100px' }}
            />
            <button
              type="button"
              onClick={saveTemplate}
              style={styles.saveTemplateBtn}
            >
              Save Template
            </button>
          </div>
        )}

        {templates.length > 0 && (
          <div style={styles.templateList}>
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => applyTemplate(template)}
                style={styles.templateButton}
                title={`Category: ${template.template_category}`}
              >
                {template.template_name}
              </button>
            ))}
          </div>
        )}
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
  templateHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  } as React.CSSProperties,
  createTemplateBtn: {
    padding: '6px 12px',
    backgroundColor: '#6c757d',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
  } as React.CSSProperties,
  templateForm: {
    backgroundColor: '#f9f9f9',
    padding: '12px',
    borderRadius: '6px',
    marginBottom: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  } as React.CSSProperties,
  saveTemplateBtn: {
    padding: '8px 16px',
    backgroundColor: '#28a745',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
  } as React.CSSProperties,
  templateList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginTop: '8px',
  } as React.CSSProperties,
  templateButton: {
    padding: '6px 12px',
    backgroundColor: '#e7f3ff',
    color: '#0066cc',
    border: '1px solid #0066cc',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500',
  } as React.CSSProperties,
};
