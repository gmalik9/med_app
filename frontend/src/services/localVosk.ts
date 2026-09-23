export interface LocalRecognition { text: string; final: boolean }
export interface LocalRecognizer {
  acceptAudio(buffer: AudioBuffer): void;
  flush(): Promise<void>;
  dispose(): void;
}

export const MODEL_NAME = 'vosk-model-small-en-in-0.4';
export const MODEL_URL = '/models/vosk-model-small-en-in-0.4-browser-v2.tar.gz';
export const WORKER_URL = '/vosk/vosk-browser-0.0.8.worker.js';
const STARTUP_TIMEOUT_MS = 120_000;
const FLUSH_TIMEOUT_MS = 15_000;
const abortError = () => new DOMException('Local dictation canceled.', 'AbortError');
const runtimeError = () => new Error('Local dictation failed. Please restart dictation.');

/** One owned worker/model per session. No audio or text is persisted or uploaded. */
export async function createLocalRecognizer(
  sampleRate: number,
  onResult: (event: LocalRecognition) => void,
  onError: (error: Error) => void,
  signal?: AbortSignal,
): Promise<LocalRecognizer> {
  if (signal?.aborted) throw abortError();
  if (!Number.isInteger(sampleRate) || sampleRate < 8_000 || sampleRate > 192_000) {
    throw new Error('Unsupported microphone sample rate.');
  }
  // Avoid Model/createModel: 0.0.8's terminate merely posts a message, so a
  // canceled download cannot be synchronously stopped through that API.
  let worker: Worker;
  try { worker = new Worker(WORKER_URL, { name: 'local-vosk' }); }
  catch { throw runtimeError(); }

  return new Promise<LocalRecognizer>((resolve, reject) => {
    let active = true;
    let ready = false;
    let pendingChunks = 0;
    let flushPromise: Promise<void> | undefined;
    let resolveFlush: (() => void) | undefined;
    let rejectFlush: ((error: Error) => void) | undefined;
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    const startupTimer = setTimeout(() => fail(new Error('Local dictation startup timed out.')), STARTUP_TIMEOUT_MS);

    function dispose(error: Error = abortError()) {
      if (!active) return;
      active = false;
      clearTimeout(startupTimer);
      clearTimeout(flushTimer);
      signal?.removeEventListener('abort', cancel);
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleWorkerError);
      worker.removeEventListener('messageerror', handleWorkerError);
      worker.terminate();
      if (!ready) reject(error);
      rejectFlush?.(error);
      resolveFlush = undefined;
      rejectFlush = undefined;
    }
    function cancel() { dispose(); }
    function fail(error: Error = runtimeError()) {
      if (!active) return;
      dispose(error);
      // Never expose worker error payloads or callback exceptions in logs.
      try { onError(error); } catch { /* Consumer errors must not leak content. */ }
    }
    function handleWorkerError(event: Event) { event.preventDefault(); fail(); }
    function handleMessage(event: MessageEvent) {
      if (!active) return;
      const message = event.data;
      if (message?.event === 'error') { fail(); return; }
      if (message?.event === 'ready' && !ready) {
        ready = true;
        clearTimeout(startupTimer);
        resolve(recognizer);
        return;
      }
      if (!ready || (message?.event !== 'result' && message?.event !== 'partialresult')) return;
      const final = message.event === 'result';
      const text = final ? message.result?.text : message.result?.partial;
      if (typeof text !== 'string') { fail(); return; }
      const flushed = message.flushId === 1 && final && flushPromise !== undefined;
      if (!flushed) pendingChunks = Math.max(0, pendingChunks - 1);
      try { onResult({ text, final }); } catch { fail(); return; }
      // The final callback has run before Stop resolves, including empty finals.
      if (flushed && active) {
        clearTimeout(flushTimer);
        resolveFlush?.();
        resolveFlush = undefined;
        rejectFlush = undefined;
      }
    }
    const recognizer: LocalRecognizer = {
      acceptAudio(buffer) {
        if (!active || flushPromise) return;
        try {
          if (buffer.sampleRate !== sampleRate || buffer.numberOfChannels < 1
              || buffer.length < 1 || buffer.length > sampleRate * 2 || pendingChunks >= 128) {
            fail(); return;
          }
          // Match 0.0.8 acceptWaveformFloat without transferring the caller's
          // AudioBuffer storage. Audio is mono and stays in worker RAM only.
          const channel = buffer.getChannelData(0);
          const samples = new Float32Array(channel.length);
          for (let i = 0; i < channel.length; i++) {
            if (!Number.isFinite(channel[i])) { fail(); return; }
            samples[i] = Math.max(-1, Math.min(1, channel[i])) * 0x8000;
          }
          pendingChunks++;
          worker.postMessage({ action: 'audioChunk', data: samples }, [samples.buffer]);
        } catch { fail(); }
      },
      flush() {
        if (!active) return Promise.reject(abortError());
        if (flushPromise) return flushPromise;
        flushPromise = new Promise<void>((done, failed) => { resolveFlush = done; rejectFlush = failed; });
        flushTimer = setTimeout(() => fail(new Error('Local dictation finalization timed out.')), FLUSH_TIMEOUT_MS);
        try { worker.postMessage({ action: 'retrieveFinalResult', flushId: 1 }); }
        catch { fail(); }
        return flushPromise;
      },
      dispose: cancel,
    };
    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleWorkerError);
    worker.addEventListener('messageerror', handleWorkerError);
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) { cancel(); return; }
    try { worker.postMessage({ action: 'init', sampleRate }); }
    catch { fail(); }
  });
}
