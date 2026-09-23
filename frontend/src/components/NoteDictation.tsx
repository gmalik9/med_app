import React from 'react';
import type { useVoskDictation } from '../hooks/useVoskDictation';

interface Props {
  dictation: ReturnType<typeof useVoskDictation>;
  disabled: boolean;
}
export default function NoteDictation({ dictation, disabled }: Props) {
  return (
    <section aria-label="Local note dictation" style={{ border: '1px solid #c8dce9', borderRadius: 8, padding: 12, marginBottom: 16, background: '#f4f9fc' }}>
      <strong>Local dictation · English (India)</strong>
      <p style={{ fontSize: 12 }}>Vosk small model · approximately 36 MB download from this app on first start; additional browser memory required. Audio stays in this browser. No cloud speech service or audio recording.</p>
      <p style={{ fontSize: 12 }}>General speech model, not clinically validated. Review all text, especially medications, doses, and dates. Nothing is saved automatically.</p>
      <button type="button" disabled={disabled || dictation.active} onClick={() => { void dictation.start(); }}>Start dictation</button>{' '}
      <button type="button" disabled={!dictation.active || dictation.status === 'Processing'} onClick={() => { void dictation.stop(); }}>Stop dictation</button>
      <p role="status" aria-label="Dictation status" aria-live="polite">{dictation.status}</p>
      {dictation.status === 'Loading model' && <p>Allow microphone access if prompted. Preparing the local model; not yet listening. Stop cancels preparation.</p>}
      {dictation.status === 'Processing' && <p>Finishing the last segment before Save is available. Confirmed navigation discards unfinished dictation.</p>}
      {dictation.partial && <div aria-label="Dictation preview"><strong>Interim preview — not yet added to note</strong><p>{dictation.partial}</p></div>}
      {dictation.error && <p role="alert">{dictation.error}</p>}
    </section>
  );
}
