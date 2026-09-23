import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { apiClient } from '../utils/apiClient';
import type { LocalRecognizer, LocalRecognition } from '../services/localVosk';

export type DictationStatus = 'Stopped' | 'Loading model' | 'Listening' | 'Processing';
interface Options {
  contextKey: string;
  enabled: boolean;
  canStart: () => boolean;
  getGeneration: () => number;
  onText: (text: string) => void;
}
interface Run {
  key: string;
  generation: number;
  session: number | undefined;
  phase: DictationStatus;
  abort: AbortController;
  stream?: MediaStream;
  context?: AudioContext;
  source?: MediaStreamAudioSourceNode;
  processor?: AudioWorkletNode;
  gain?: GainNode;
  recognizer?: LocalRecognizer;
  deadline?: ReturnType<typeof setTimeout>;
  sessionWatch?: ReturnType<typeof setInterval>;
  drain?: () => void;
  events: number;
  characters: number;
  frames: number;
}

// Optional only for older isolated UI test doubles; the real client always exposes this.
export const dictationSessionGeneration = () => apiClient.getSessionGeneration?.();
const unsupportedWorklet = 'Local dictation requires AudioWorklet, which is unavailable in this browser. Use a current AudioWorklet-capable browser over HTTPS or localhost, then try Start dictation again. You can keep typing; your existing note is kept.';
const stopTracks = (stream?: MediaStream) => stream?.getTracks().forEach(track => {
  track.onended = null;
  track.stop();
});
function releaseAudio(run: Run) {
  stopTracks(run.stream);
  run.stream = undefined;
  if (run.processor) {
    run.processor.port.onmessage = null;
    run.processor.port.close();
    run.processor.disconnect();
  }
  run.source?.disconnect();
  run.gain?.disconnect();
  run.processor = undefined;
  run.source = undefined;
  run.gain = undefined;
  const context = run.context;
  run.context = undefined;
  if (context && context.state !== 'closed') void context.close().catch(() => { /* Already closed. */ });
  run.drain?.();
  run.drain = undefined;
}
function dispose(run: Run) {
  clearTimeout(run.deadline);
  clearInterval(run.sessionWatch);
  releaseAudio(run);
  run.abort.abort();
  run.recognizer?.dispose();
  run.recognizer = undefined;
}
function captureError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'Microphone permission was denied. Allow microphone access in browser settings, then try Start dictation again.';
  }
  if (error instanceof DOMException && error.name === 'NotFoundError') return 'No microphone was found. Connect one, then try again.';
  // Do not surface arbitrary worker/exception content that might contain a transcript.
  return 'Local dictation could not continue. Check microphone access and local model availability, then try Start dictation again. Your existing note is kept.';
}

export function useVoskDictation(options: Options) {
  const [status, setStatus] = useState<DictationStatus>('Stopped');
  const [partial, setPartial] = useState('');
  const [error, setError] = useState('');
  const current = useRef<Run | null>(null);
  const latest = useRef(options);
  useLayoutEffect(() => { latest.current = options; });

  const cancel = useCallback(() => {
    const run = current.current;
    current.current = null; // Invalidate before abort/dispose callbacks can fire.
    if (run) dispose(run);
    setPartial('');
    setStatus('Stopped');
  }, []);
  const valid = (run: Run) => current.current === run && !run.abort.signal.aborted
    && latest.current.contextKey === run.key && latest.current.getGeneration() === run.generation
    && dictationSessionGeneration() === run.session;
  const check = (run: Run) => {
    if (valid(run)) return true;
    if (current.current === run) cancel();
    return false;
  };
  const fail = (run: Run, message: string) => {
    if (!check(run)) return;
    cancel();
    setError(message);
  };

  useLayoutEffect(() => {
    setError('');
    const expired = () => cancel();
    window.addEventListener('session-expired', expired);
    window.addEventListener('pagehide', expired);
    return () => {
      window.removeEventListener('session-expired', expired);
      window.removeEventListener('pagehide', expired);
      cancel();
    };
  }, [options.contextKey, cancel]);

  const start = async () => {
    if (current.current || !latest.current.enabled || !latest.current.canStart()) return;
    setError(''); setPartial('');
    if (!window.isSecureContext) {
      setError('Microphone access requires HTTPS or localhost. Open a secure local deployment and try again.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === 'undefined') {
      setError('This browser does not support local microphone dictation. Use a current browser with Web Audio and microphone access.');
      return;
    }
    if (typeof AudioWorkletNode !== 'function') {
      setError(unsupportedWorklet);
      return;
    }
    const run: Run = {
      key: latest.current.contextKey, generation: latest.current.getGeneration(),
      session: dictationSessionGeneration(), phase: 'Loading model', abort: new AbortController(),
      events: 0, characters: 0, frames: 0,
    };
    current.current = run;
    setStatus('Loading model');
    // Bound preparation, worker callbacks, and the total audio sent in one session.
    run.deadline = setTimeout(() => fail(run, 'Local model preparation timed out. Try Start dictation again.'), 120_000);
    run.sessionWatch = setInterval(() => { check(run); }, 250);
    try {
      // Use the device's actual rate, not a requested/assumed 16 kHz rate.
      const context = new AudioContext();
      run.context = context;
      // Fail before microphone permission or the model download. ScriptProcessor
      // cannot safely drain its pending native block on Stop; never fall back.
      if (typeof context.audioWorklet?.addModule !== 'function') {
        fail(run, unsupportedWorklet);
        return;
      }
      // Resume inside the named user gesture, before permission/model awaits.
      const resumed = context.resume();
      void resumed.catch(() => { /* Awaited below; no unhandled permission-time rejection. */ });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 }, video: false });
      if (!check(run)) { stopTracks(stream); return; }
      run.stream = stream;
      stream.getTracks().forEach(track => { track.onended = () => fail(run, 'The microphone disconnected. Your note is kept; reconnect and start again.'); });
      await resumed;
      if (!check(run)) return;
      const { createLocalRecognizer } = await import('../services/localVosk');
      if (!check(run)) return;
      const onResult = (event: LocalRecognition) => {
        if (!check(run) || (run.phase !== 'Listening' && run.phase !== 'Processing')) return;
        if (++run.events > 20_000 || typeof event.text !== 'string' || event.text.length > 16_000) {
          fail(run, 'Dictation reached its safety limit. Review the note, then start a new dictation session.');
          return;
        }
        if (event.final) {
          setPartial('');
          const text = event.text.trim();
          if (!text) return;
          run.characters += text.length;
          if (run.characters > 100_000) {
            fail(run, 'Dictation reached its text limit. Review the note before continuing.');
            return;
          }
          // Each final event is one segment. Never deduplicate by text: repeated
          // words/segments may be intentional. Interims never reach the draft.
          latest.current.onText(text);
        } else if (run.phase === 'Listening') setPartial(event.text);
      };
      const recognizer = await createLocalRecognizer(context.sampleRate, onResult,
        () => fail(run, captureError(null)), run.abort.signal);
      if (!check(run)) { recognizer.dispose(); return; }
      run.recognizer = recognizer;
      const accept = (buffer: AudioBuffer) => {
        if (!check(run) || (run.phase !== 'Listening' && run.phase !== 'Processing')) return;
        run.frames += buffer.length;
        if (run.frames > context.sampleRate * 300) {
          fail(run, 'The five-minute dictation limit was reached. Review the note and start again; the unfinished preview was discarded.');
          return;
        }
        try { recognizer.acceptAudio(buffer); } catch { fail(run, captureError(null)); }
      };
      const source = context.createMediaStreamSource(stream);
      run.source = source;
      source.channelCount = 1;
      source.channelCountMode = 'explicit';
      const gain = context.createGain();
      run.gain = gain;
      gain.gain.value = 0; // Keep the processing graph alive without microphone feedback.
      // Vite emits a same-origin asset (never a data:/blob: worklet URL).
      const { default: workletUrl } = await import('../worklets/dictationCapture.worklet.js?url&no-inline');
      if (!check(run)) return;
      await context.audioWorklet.addModule(workletUrl);
      if (!check(run)) return;
      const processor = new AudioWorkletNode(context, 'local-dictation-capture', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1, channelCountMode: 'explicit',
      });
      run.processor = processor;
      processor.port.onmessage = ({ data }) => {
        if (!check(run)) return;
        if (data?.type === 'stopped') { run.drain?.(); run.drain = undefined; return; }
        if (data?.type === 'overflow') { fail(run, 'Audio processing could not keep up. Dictation stopped; review the note before retrying.'); return; }
        if (data?.type !== 'audio' || !(data.samples instanceof Float32Array) || data.samples.length > 4096) return;
        const buffer = context.createBuffer(1, data.samples.length, context.sampleRate);
        buffer.copyToChannel(data.samples, 0);
        accept(buffer);
        if (check(run)) processor.port.postMessage({ type: 'ack' });
      };
      if (!check(run)) return;
      run.phase = 'Listening';
      source.connect(run.processor!);
      run.processor!.connect(gain);
      gain.connect(context.destination);
      clearTimeout(run.deadline);
      run.deadline = setTimeout(() => fail(run, 'The five-minute dictation limit was reached. Review the note and start again; the unfinished preview was discarded.'), 300_000);
      setStatus('Listening');
    } catch (cause) {
      fail(run, captureError(cause));
    }
  };

  const stop = async () => {
    const run = current.current;
    if (!run || !check(run) || run.phase === 'Processing') return;
    if (run.phase !== 'Listening') { cancel(); return; }
    run.phase = 'Processing';
    setStatus('Processing');
    clearTimeout(run.deadline);
    run.deadline = setTimeout(() => fail(run, 'Final dictation processing timed out. The unfinished preview was discarded; review the note before retrying.'), 10_000);
    try {
      // Stop capture immediately; drain the worklet's bounded last block before
      // asking Vosk for its final segment. Cancellation resolves this wait too.
      stopTracks(run.stream); run.stream = undefined;
      run.source?.disconnect();
      if (run.processor) {
        const processor = run.processor;
        await new Promise<void>(resolve => { run.drain = resolve; processor.port.postMessage({ type: 'stop' }); });
      }
      releaseAudio(run);
      if (!check(run)) return;
      await run.recognizer!.flush();
      if (!check(run)) return;
      cancel(); // Late results after the flush barrier are never accepted.
    } catch (cause) { fail(run, captureError(cause)); }
  };

  return {
    status, partial, error, start, stop, cancel,
    active: status !== 'Stopped',
    isActive: () => current.current !== null,
  };
}
