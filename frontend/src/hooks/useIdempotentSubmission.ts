import { useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '../utils/apiClient';

type Intent = { key: string; digest: string; scope: string; generation: number };
const unknownMessage = 'A previous submission may have saved. Its matching retry cannot be identified. Check history before starting a new submission.';

// No persistent draft, payload, patient identifier or digest. Only an opaque key
// survives remount/reload, deliberately blocking blind resubmission without the
// in-memory identity + fingerprint. sessionStorage is tab scoped, not cross-tab.
export function useIdempotentSubmission(operation: string, scope: string, payload: unknown) {
  const storageKey = `clinical-write:${operation}`;
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(() => Boolean(sessionStorage.getItem(storageKey)));
  const [notice, setNotice] = useState(() => sessionStorage.getItem(storageKey) ? unknownMessage : '');
  const intent = useRef<Intent | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const serialized = JSON.stringify(payload);
  const digest = useMemo(() => crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized))
    .then(buffer => Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('')), [serialized]);
  const current = useRef({ scope, generation: apiClient.getSessionGeneration(), digest });
  current.current = { scope, generation: apiClient.getSessionGeneration(), digest };

  async function submit(send: (key: string) => Promise<unknown>): Promise<boolean> {
    if (inFlight.current) return false;
    inFlight.current = true;
    setPending(true);
    const snapshot = current.current;
    try {
      const fingerprint = await snapshot.digest;
      const latestBeforeSend = current.current;
      const latestFingerprint = await latestBeforeSend.digest;
      // Recheck AFTER the final await: a login/patient switch during hashing
      // must never dispatch the old form under the newly current credentials.
      if (!mounted.current || snapshot.generation !== apiClient.getSessionGeneration() ||
        snapshot.scope !== current.current.scope || latestBeforeSend.digest !== current.current.digest || fingerprint !== latestFingerprint) return false;
      const stored = sessionStorage.getItem(storageKey);
      if (stored && (!intent.current || stored !== intent.current.key)) {
        setUncertain(true); setNotice(unknownMessage);
        return false;
      }
      if (intent.current && (intent.current.digest !== fingerprint || intent.current.scope !== snapshot.scope ||
        intent.current.generation !== snapshot.generation)) {
        setNotice('The previous outcome is uncertain. Restore the original fields and patient to retry, or check history before starting a new submission.');
        return false;
      }
      const attempt = intent.current ?? { key: crypto.randomUUID(), digest: fingerprint, scope: snapshot.scope, generation: snapshot.generation };
      // Storage failure prevents sending: a lost key must not silently become a
      // new intent after reload. Synchronous claim also protects sibling mounts.
      sessionStorage.setItem(storageKey, attempt.key);
      intent.current = attempt;
      try {
        await send(attempt.key);
      } catch (error) {
        if (mounted.current) {
          setUncertain(true);
          setNotice('Save outcome not confirmed. Retry the same submission with unchanged fields; do not create a new one until history has been checked.');
        }
        if (!mounted.current || snapshot.scope !== current.current.scope || snapshot.generation !== apiClient.getSessionGeneration()) return false;
        throw error;
      }
      if (sessionStorage.getItem(storageKey) === attempt.key) sessionStorage.removeItem(storageKey);
      intent.current = null;
      if (mounted.current) { setUncertain(false); setNotice(''); }
      // Never clear newly edited fields or run stale patient/session callbacks.
      const latest = current.current;
      const latestDigest = await latest.digest;
      const unchanged = mounted.current && snapshot.scope === current.current.scope &&
        snapshot.generation === apiClient.getSessionGeneration() && fingerprint === latestDigest && latest.digest === current.current.digest;
      if (!unchanged && mounted.current) setNotice('The submitted version was saved. Current edits were not submitted and have been kept.');
      return unchanged;
    } finally {
      inFlight.current = false;
      if (mounted.current) setPending(false);
    }
  }

  function acknowledgeReconciled() {
    if (inFlight.current) return;
    if (!window.confirm('Check the relevant history first: the previous submission may already exist. Start a genuinely new submission?')) return;
    sessionStorage.removeItem(storageKey);
    intent.current = null;
    setUncertain(false); setNotice('');
  }
  return { submit, pending, uncertain, notice, acknowledgeReconciled };
}