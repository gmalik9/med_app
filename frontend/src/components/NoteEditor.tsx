import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { apiClient } from '../utils/apiClient';
import { confirmDiscardChanges, useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { dictationSessionGeneration, useVoskDictation } from '../hooks/useVoskDictation';
import NoteDictation from './NoteDictation';

interface NoteEditorProps {
  patientId: string | number;
  onDirtyChange?: (dirty: boolean) => void;
}

const MAX_NOTE_CHARACTERS = 50_000;

interface NoteVersion {
  note_text: string;
  medical_codes?: string[];
  revision: number;
  note_date?: string;
  updated_at?: string;
}

function isNoteVersion(note: any): note is NoteVersion {
  return !!note && typeof note.note_text === 'string' && Number.isInteger(note.revision) && note.revision > 0
    && (note.medical_codes === undefined || note.medical_codes === null
      || (Array.isArray(note.medical_codes) && note.medical_codes.every((code: unknown) => typeof code === 'string')));
}

function readNote(data: any): NoteVersion | null {
  if (data?.exists === false) return null;
  if (data?.exists === true && isNoteVersion(data.note)) return data.note;
  throw new Error('Invalid note response');
}

function errorMessage(err: any, fallback: string): string {
  const message = err?.response?.data?.error || err?.message;
  return typeof message === 'string' ? message : fallback;
}

interface Template {
  id: number;
  template_name: string;
  template_category: string;
  template_text: string;
  creator_id: number;
}

export default function NoteEditor({ patientId, onDirtyChange }: NoteEditorProps) {
  const [noteText, setNoteText] = useState('');
  const [savedNote, setSavedNote] = useState<NoteVersion | null>(null);
  const [medicalCodes, setMedicalCodes] = useState<string[]>([]);
  const [medicalCodeInput, setMedicalCodeInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  });
  const [loadingNote, setLoadingNote] = useState(true);
  const [noteLoadFailed, setNoteLoadFailed] = useState(false);
  const generation = useRef(0);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: '', category: '', text: '' });
  const [isFormatting, setIsFormatting] = useState(false);
  const [aiDraft, setAiDraft] = useState<{ original: string; text: string } | null>(null);
  const [conflict, setConflict] = useState(false);
  const [serverVersion, setServerVersion] = useState<{ note: NoteVersion | null } | null>(null);
  const [loadingServer, setLoadingServer] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  // Synchronous locks prevent a second click before React has rendered disabled controls.
  const savingRequest = useRef<number | null>(null);
  const formattingRequest = useRef<number | null>(null);
  const serverRequest = useRef<number | null>(null);
  const templateRequest = useRef<number | null>(null);
  const noteTooLong = noteText.length > MAX_NOTE_CHARACTERS;
  const editingDisabled = loadingNote || noteLoadFailed || loading || isFormatting;
  const dictationDisabled = editingDisabled || conflict || Boolean(aiDraft) || loadingServer || savingTemplate;
  const sessionGeneration = dictationSessionGeneration();
  const dictation = useVoskDictation({
    contextKey: JSON.stringify([patientId, selectedDate, sessionGeneration]),
    enabled: !dictationDisabled,
    canStart: () => !dictationDisabled && savingRequest.current === null && formattingRequest.current === null
      && serverRequest.current === null && templateRequest.current === null,
    getGeneration: () => generation.current,
    onText: text => {
      const current = generation.current;
      const session = dictationSessionGeneration();
      // A functional update preserves typing made since capture started. Check
      // identity again inside React's updater, not only at the worker callback.
      setNoteText(previous => current === generation.current && session === dictationSessionGeneration()
        ? previous + (previous && !/\s$/.test(previous) ? ' ' : '') + text : previous);
      setSuccess('');
    },
  });
  const noteChanged = noteText !== (savedNote?.note_text || '')
    || JSON.stringify(medicalCodes) !== JSON.stringify(savedNote?.medical_codes || []);
  const templateChanged = Boolean(newTemplate.name || newTemplate.category || newTemplate.text);
  const dirty = noteChanged || Boolean(medicalCodeInput) || templateChanged || Boolean(aiDraft)
    || isFormatting || loading || conflict || savingTemplate || dictation.active || Boolean(dictation.partial);
  const confirmLeave = useUnsavedChanges(dirty, onDirtyChange);
  const noteBusy = () => editingDisabled || savingRequest.current !== null || formattingRequest.current !== null;

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

  useLayoutEffect(() => {
    const current = ++generation.current;
    setNoteText(''); setMedicalCodes([]); setSavedNote(null); setSuccess(''); setError('');
    setMedicalCodeInput(''); setAiDraft(null); setConflict(false); setServerVersion(null);
    setIsFormatting(false); setLoading(false); setLoadingServer(false); setSavingTemplate(false);
    setNewTemplate({ name: '', category: '', text: '' }); setShowCreateTemplate(false);
    savingRequest.current = null; formattingRequest.current = null;
    serverRequest.current = null; templateRequest.current = null;
    setLoadingNote(true); setNoteLoadFailed(false);
    void apiClient.getTodayNote(patientId, selectedDate).then(response => {
      if (generation.current !== current) return;
      const note = readNote(response.data);
      setNoteText(note?.note_text || '');
      setMedicalCodes(note?.medical_codes || []);
      setSavedNote(note);
    }).catch(() => {
      if (generation.current !== current) return;
      setNoteLoadFailed(true); setError('Failed to load note. Reload before editing.');
    }).finally(() => { if (generation.current === current) setLoadingNote(false); });
    return () => { generation.current++; };
  }, [patientId, selectedDate, sessionGeneration]);

  useEffect(() => {
    let active = true;
    void apiClient.getTemplates().then(response => {
      if (active) setTemplates(response.data.templates || []);
    }).catch(() => { /* Templates are optional; no note data is changed. */ });
    return () => { active = false; };
  }, []);

  const addMedicalCode = () => {
    if (noteBusy()) return;
    const code = medicalCodeInput.trim().toUpperCase();
    if (!code) return;
    setMedicalCodes((prev) => Array.from(new Set([...prev, code])));
    setMedicalCodeInput('');
  };

  const removeMedicalCode = (codeToRemove: string) => {
    if (noteBusy()) return;
    setMedicalCodes((prev) => prev.filter((code) => code !== codeToRemove));
  };

  const applyTemplate = (template: Template) => {
    if (noteBusy() || dictation.isActive() || !confirmLeave()) return;
    setNoteText(template.template_text);
    setAiDraft(null);
    setSuccess(`Template "${template.template_name}" applied!`);
  };

  const saveTemplate = async () => {
    if (templateRequest.current !== null || dictation.isActive()) return;
    if (!newTemplate.name.trim() || !newTemplate.text.trim()) {
      setError('Template name and text are required');
      return;
    }
    const current = generation.current;
    templateRequest.current = current;
    setSavingTemplate(true);
    setError('');
    try {
      await apiClient.createTemplate({
        templateName: newTemplate.name,
        templateCategory: newTemplate.category || 'General',
        templateText: newTemplate.text,
        isPublic: false
      });
      if (generation.current !== current) return;
      setNewTemplate({ name: '', category: '', text: '' });
      setShowCreateTemplate(false);
      setSuccess('Template saved successfully!');
      const response = await apiClient.getTemplates();
      if (generation.current === current) setTemplates(response.data.templates || []);
    } catch (err: any) {
      if (generation.current === current) setError(errorMessage(err, 'Failed to save template'));
    } finally {
      if (generation.current === current) { templateRequest.current = null; setSavingTemplate(false); }
    }
  };

  const handleSave = async () => {
    if (noteBusy() || dictation.isActive() || conflict || aiDraft || noteTooLong) return;
    if (medicalCodeInput.trim()) {
      setError('Add or clear the pending medical code before saving.');
      return;
    }
    if (!noteText.trim()) {
      setError('Note cannot be empty');
      return;
    }

    setError('');
    setSuccess('');
    setLoading(true);
    const current = generation.current;
    savingRequest.current = current;

    try {
      const response = await apiClient.saveNote(patientId, noteText, selectedDate, medicalCodes, savedNote?.revision ?? 0);
      if (current !== generation.current) return;
      if (!isNoteVersion(response.data?.note)) {
        setConflict(true);
        setError('Save response could not be verified. Your draft is kept. Load the server version to reconcile before saving again.');
        return;
      }
      setSavedNote(response.data.note);
      setNoteText(response.data.note.note_text);
      setMedicalCodes(response.data.note.medical_codes || []);
      setMedicalCodeInput('');
      setSuccess('Note saved successfully!');
      window.dispatchEvent(new Event('clinical-data-updated'));
    } catch (err: any) {
      if (current !== generation.current) return;
      if (err?.response?.status === 409) { setConflict(true); setServerVersion(null); }
      setError(errorMessage(err, 'Failed to save note'));
    } finally {
      if (current === generation.current) { savingRequest.current = null; setLoading(false); }
    }
  };

  const handleFormat = async () => {
    if (noteBusy() || dictation.isActive() || conflict || aiDraft || !noteText.trim()) return;
    const current = generation.current;
    const original = noteText;
    formattingRequest.current = current;
    setIsFormatting(true); setError(''); setSuccess('');
    try {
      const response = await apiClient.formatNote(original);
      if (current !== generation.current) return;
      const data = response.data;
      const finishReason = data?.finish_reason ?? data?.finishReason;
      if (typeof data?.text !== 'string' || !data.text.trim() || data.truncated || data.incomplete
        || data.error || (finishReason !== undefined && finishReason !== null && finishReason !== 'stop' && finishReason !== 'STOP')) {
        setError('AI response was empty, incomplete, or truncated. Original note kept; try again.');
        return;
      }
      setAiDraft({ original, text: data.text });
    } catch (err: any) {
      if (current === generation.current) setError(errorMessage(err, 'Failed to format note. Original note kept.'));
    } finally {
      if (current === generation.current) { formattingRequest.current = null; setIsFormatting(false); }
    }
  };

  const loadServerVersion = async () => {
    if (serverRequest.current !== null || dictation.isActive()) return;
    const current = generation.current;
    serverRequest.current = current;
    setLoadingServer(true); setError(''); setServerVersion(null);
    try {
      const response = await apiClient.getTodayNote(patientId, selectedDate);
      if (current === generation.current) setServerVersion({ note: readNote(response.data) });
    } catch (err: any) {
      if (current === generation.current) setError(errorMessage(err, 'Failed to load server version. Your draft is kept.'));
    } finally {
      if (current === generation.current) { serverRequest.current = null; setLoadingServer(false); }
    }
  };

  const reconcile = (useServerText: boolean) => {
    if (!serverVersion || loadingServer || dictation.isActive()) return;
    if (useServerText && !window.confirm('Replace your local draft and medical codes with the reviewed server version?')) return;
    if (useServerText) {
      setNoteText(serverVersion.note?.note_text || '');
      setMedicalCodes(serverVersion.note?.medical_codes || []);
      setMedicalCodeInput('');
    }
    // Revision changes only after an explicit choice, never merely from loading a conflict.
    setSavedNote(serverVersion.note);
    setConflict(false); setServerVersion(null); setError('');
    setSuccess(useServerText ? 'Server version loaded into the editor.' : 'Reviewed draft kept with the server revision. Save Note to submit your changes.');
  };

  return (
    <div style={styles.card}>
      <h2 style={styles.title}>Clinical Notes</h2>
      <p role="status">{dirty ? 'Unsaved changes or pending review.' : 'No unsaved note changes.'}</p>
      <p style={styles.meta}>Drafts stay in memory only. Session expiry or automatic logout can discard unsaved work. Save reviewed notes regularly.</p>

      <div style={styles.group}>
        <label style={styles.label}>Date</label>
        <input
          type="date"
          aria-label="Note date"
          disabled={loading}
          value={selectedDate}
          onChange={(e) => {
            if (savingRequest.current !== null) return;
            if (e.target.value && e.target.value !== selectedDate
              && (dictation.isActive() ? confirmDiscardChanges(true) : confirmLeave())) {
              // Accepted navigation is cancellation, never a final flush into a new date.
              dictation.cancel();
              setSelectedDate(e.target.value);
            }
          }}
          style={styles.input}
        />
      </div>

      <NoteDictation dictation={dictation} disabled={dictationDisabled} />

       <div style={styles.group}>
         <label style={styles.label}>Note</label>
         <textarea
           aria-label="Clinical note"
           aria-describedby="note-character-count"
           disabled={editingDisabled}
           value={noteText}
           onChange={(e) => { if (!noteBusy()) { setNoteText(e.target.value); setSuccess(''); } }}
           placeholder="Enter clinical notes for this patient..."
           style={styles.textarea}
           rows={10}
         />
         <p id="note-character-count" style={styles.meta}>{noteText.length.toLocaleString('en-US')} / 50,000 characters</p>
         {noteTooLong && <p role="alert">This note exceeds the 50,000-character save limit. All text is kept. Review and shorten it before saving; check medications, doses, and numbers carefully.</p>}
         <button 
           type="button" 
           onClick={handleFormat}
           disabled={editingDisabled || dictation.active || conflict || Boolean(aiDraft) || !noteText.trim()}
           style={styles.formatBtn}
         >
           {isFormatting ? 'Formatting...' : '🔮 Format with AI'}
         </button>
       </div>

      {aiDraft && (
        <section aria-label="AI draft review" style={styles.templateForm}>
          <h3>Review AI draft — not saved</h3>
          <p>Check every clinical fact, omission, and medical code. Accept only after review, then use Save Note separately.</p>
          <div style={styles.reviewColumns}>
            <label style={styles.group}>Original sent for formatting
              <textarea aria-label="Original note before AI formatting" readOnly value={aiDraft.original} rows={10} style={styles.textarea} />
            </label>
            <label style={styles.group}>AI proposal
              <textarea aria-label="AI proposed note" readOnly value={aiDraft.text} rows={10} style={styles.textarea} />
            </label>
          </div>
          {noteText !== aiDraft.original && <p role="alert">The note changed after formatting. Discard this proposal and format the current note again.</p>}
          <button type="button" disabled={noteText !== aiDraft.original} onClick={() => {
            if (noteText !== aiDraft.original) return;
            setNoteText(aiDraft.text); setAiDraft(null); setSuccess('AI draft accepted into the editor. Not saved.');
          }}>Accept AI draft</button>
          <button type="button" onClick={() => { setAiDraft(null); setSuccess('AI draft discarded. Your note is unchanged.'); }}>Discard AI draft</button>
        </section>
      )}

      {conflict && (
        <section aria-label="Note conflict reconciliation" style={styles.templateForm}>
          <h3>Reconcile with the server</h3>
          <p>Your local draft is kept in the editor. Load the server version separately, compare text and medical codes, then choose a version or edit your draft to merge. Nothing is saved automatically.</p>
          <button type="button" disabled={loadingServer} onClick={loadServerVersion}>{loadingServer ? 'Loading server version...' : 'Load server version for comparison'}</button>
          {serverVersion && (
            <>
              <p>Server revision: {serverVersion.note?.revision ?? 0}{!serverVersion.note && ' (no saved note)'}</p>
              <label style={styles.group}>Server note
                <textarea aria-label="Server note for comparison" readOnly value={serverVersion.note?.note_text || ''} rows={10} style={styles.textarea} />
              </label>
              <p>Server medical codes: {serverVersion.note?.medical_codes?.join(', ') || 'None'}</p>
              <button type="button" onClick={() => reconcile(true)}>Use server version</button>
              <button type="button" onClick={() => reconcile(false)}>Use reviewed draft with server revision</button>
            </>
          )}
        </section>
      )}

      <div style={styles.group}>
        <div style={styles.templateHeader}>
          <label style={styles.label}>Quick Templates</label>
          <button
            type="button"
            disabled={savingTemplate || dictation.active}
            onClick={() => {
              if (dictation.isActive()) return;
              if (showCreateTemplate && templateChanged && !window.confirm('Discard the unsaved template?')) return;
              if (showCreateTemplate) setNewTemplate({ name: '', category: '', text: '' });
              setShowCreateTemplate(!showCreateTemplate);
            }}
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
              aria-label="Template name"
              disabled={savingTemplate}
              value={newTemplate.name}
              onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
              style={styles.input}
            />
            <input
              type="text"
              placeholder="Category (e.g., Consultation, Follow-up)"
              aria-label="Template category"
              disabled={savingTemplate}
              value={newTemplate.category}
              onChange={(e) => setNewTemplate({ ...newTemplate, category: e.target.value })}
              style={styles.input}
            />
            <textarea
              placeholder="Template Text"
              aria-label="Template text"
              disabled={savingTemplate}
              value={newTemplate.text}
              onChange={(e) => setNewTemplate({ ...newTemplate, text: e.target.value })}
              style={{ ...styles.textarea, minHeight: '100px' }}
            />
            <button
              type="button"
              onClick={saveTemplate}
              disabled={savingTemplate || dictation.active}
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
                disabled={editingDisabled || dictation.active}
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
            aria-label="Medical code"
            disabled={editingDisabled}
            value={medicalCodeInput}
            onChange={(e) => { if (!noteBusy()) setMedicalCodeInput(e.target.value); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addMedicalCode();
              }
            }}
            placeholder="Add a code and press Enter"
            style={styles.input}
          />
          <button type="button" disabled={editingDisabled} onClick={addMedicalCode} style={styles.addCodeBtn}>
            Add Code
          </button>
        </div>
        <div style={styles.codesList}>
          {medicalCodes.map((code) => {
            const colors = getCodeColor(code);
            return (
              <span key={code} style={{ ...styles.codePill, backgroundColor: colors.bg, color: colors.text }}>
                {code}
                <button type="button" aria-label={`Remove medical code ${code}`} disabled={editingDisabled} onClick={() => removeMedicalCode(code)} style={{ ...styles.codeRemoveBtn, color: colors.text }}>
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
            Note date: {formatLocalDate(savedNote.note_date)} • Last saved: {savedNote.updated_at ? new Date(savedNote.updated_at).toLocaleString() : 'Not available'}
          </small>
        </div>
      )}

      {error && <div role="alert" style={styles.error}>{error}</div>}
      {success && <div role="status" style={styles.success}>{success}</div>}

      <button onClick={handleSave} disabled={editingDisabled || dictation.active || conflict || Boolean(aiDraft) || noteTooLong} style={styles.saveBtn}>
        {loading ? 'Saving...' : 'Save Note'}
      </button>
    </div>
  );
}

const styles = {
  reviewColumns: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
    gap: '12px',
  } as React.CSSProperties,
  card: {
    backgroundColor: 'white',
    padding: '16px',
    borderRadius: '12px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    width: '100%',
    boxSizing: 'border-box',
    maxWidth: '100%',
    overflow: 'hidden',
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
    flexWrap: 'wrap',
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
  formatBtn: {
    marginTop: '8px',
    padding: '8px 16px',
    backgroundColor: '#6f42c1',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    alignSelf: 'flex-start',
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
    flexWrap: 'wrap',
    gap: '8px',
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
