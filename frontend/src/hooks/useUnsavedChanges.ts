import { useEffect, useLayoutEffect, useRef } from 'react';

// Never put draft content or patient identity in storage, URLs, or dialog text.
export function confirmDiscardChanges(dirty: boolean): boolean {
  return !dirty || window.confirm(
    'Discard unsaved note changes and pending reviews? Cancel to keep editing. A save already in progress may still complete on the server.',
  );
}

export function useUnsavedChanges(dirty: boolean, onDirtyChange?: (dirty: boolean) => void) {
  const dirtyRef = useRef(dirty);
  useLayoutEffect(() => {
    dirtyRef.current = dirty;
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useLayoutEffect(() => () => { onDirtyChange?.(false); }, [onDirtyChange]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);

  return () => confirmDiscardChanges(dirtyRef.current);
}