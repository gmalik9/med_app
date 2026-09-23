import React, { useState, useEffect, useRef, useCallback } from 'react';
import { apiClient } from '../utils/apiClient';
import { validateHistoryPage } from '../utils/pagination';

// Shared read-only paging mechanics live here to keep this batch within its
// owned files. Write submission/idempotency hooks are deliberately independent.
export function useHistoryPage<T extends { id?: number } = any>(
  scope: string, field: string, fetchPage: (cursor?: string) => Promise<{ data: any }>,
) {
  const generation = apiClient.getSessionGeneration();
  const key = JSON.stringify([scope, generation]);
  const empty = () => ({ key, rows: [] as T[], loading: true, error: '', nextCursor: undefined as string | undefined, retryCursor: undefined as string | undefined, hasMore: false, loaded: false });
  const [state, setState] = useState(empty);
  const live = useRef({ key, epoch: 0, mounted: true, busy: false });
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  if (live.current.key !== key) {
    live.current.key = key;
    live.current.epoch++;
    live.current.busy = false;
  }
  const load = useCallback(async (cursor?: string) => {
    if (!live.current.mounted || live.current.key !== key || (cursor && live.current.busy)) return;
    const epoch = ++live.current.epoch;
    live.current.busy = true;
    // Commit replacement/continuation only after the whole response validates.
    // Same-scope refresh failures must not erase previously displayed records.
    setState(old => old.key === key ? { ...old, loading: true, error: '' }
      : { key, rows: [], loading: true, error: '', nextCursor: undefined, retryCursor: undefined, hasMore: false, loaded: false });
    const current = () => live.current.mounted && live.current.key === key && live.current.epoch === epoch
      && apiClient.getSessionGeneration() === generation;
    try {
      const { data } = await fetchRef.current(cursor);
      if (!current()) return;
      const page = validateHistoryPage<T>(data, field, cursor);
      setState(old => {
        const rows: T[] = cursor ? [...old.rows] : [];
        const ids = new Set(rows.map(row => row.id));
        for (const row of page.rows) {
          if (!ids.has(row.id)) { rows.push(row); ids.add(row.id); }
        }
        return { key, rows, loading: false, error: '', nextCursor: page.nextCursor ?? undefined, retryCursor: undefined, hasMore: page.hasMore, loaded: true };
      });
    } catch {
      if (current()) setState(old => ({ ...old, loading: false, retryCursor: cursor, error: 'Unable to load records. Please retry.' }));
    } finally {
      if (current()) live.current.busy = false;
    }
  }, [key, generation, field]);
  useEffect(() => {
    live.current.mounted = true;
    void load();
    const refresh = () => { void load(); };
    window.addEventListener('clinical-data-updated', refresh);
    return () => {
      live.current.mounted = false;
      live.current.epoch++;
      live.current.busy = false;
      window.removeEventListener('clinical-data-updated', refresh);
    };
  }, [load]);
  const visible = state.key === key ? state : empty();
  return {
    ...visible,
    reload: () => load(),
    refreshAll: () => {
      if (live.current.mounted && live.current.key === key && apiClient.getSessionGeneration() === generation) {
        window.dispatchEvent(new Event('clinical-data-updated'));
      }
    },
    loadMore: () => load(visible.error ? visible.retryCursor : visible.nextCursor),
    setRows: (update: (rows: T[]) => T[]) => {
      if (live.current.mounted && live.current.key === key && apiClient.getSessionGeneration() === generation) setState(old => ({ ...old, rows: update(old.rows) }));
    },
  };
}

export function HistoryPaging({ page }: { page: Pick<ReturnType<typeof useHistoryPage>, 'loading' | 'error' | 'loaded' | 'hasMore' | 'reload' | 'loadMore'> }) {
  return <div aria-label="History pagination">
    {page.error && <div role="alert">{page.error}</div>}
    {page.loading && <p role="status">Loading records...</p>}
    {page.error ? <button type="button" disabled={page.loading} onClick={page.loadMore}>Retry loading records</button>
      : page.hasMore && <button type="button" disabled={page.loading} onClick={page.loadMore}>Load more</button>}
    {page.loaded && !page.hasMore && !page.loading && !page.error && <p aria-live="polite">No more records.</p>}
    <button type="button" disabled={page.loading} onClick={page.reload}>Refresh records</button>
    <small style={{ display: 'block', marginTop: 8 }}>Live records, not a snapshot. Refresh to see new or changed records.</small>
  </div>;
}

interface PatientHistoryProps {
  patientId: string | number;
}

export default function PatientHistory({ patientId }: PatientHistoryProps) {
  const page = useHistoryPage(`notes:${patientId}`, 'notes', cursor => apiClient.getNoteHistory(patientId, 30, cursor));
  const { rows: notes, loading } = page;

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
    
    // Handle ISO string format: extract just the date part (YYYY-MM-DD)
    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateString);
    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString();
    }

    const parsed = new Date(dateString);
    return Number.isNaN(parsed.getTime()) ? dateString : parsed.toLocaleDateString();
  };

  return (
    <div style={styles.card}>
      <h2 style={styles.title}>Clinical Notes History</h2>

      {loading && notes.length === 0 ? (
        <p>Loading...</p>
      ) : notes.length === 0 && !page.error ? (
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
      <HistoryPaging page={page} />
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
