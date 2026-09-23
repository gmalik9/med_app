import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocalRecognizer, MODEL_NAME, MODEL_URL, WORKER_URL } from '../src/services/localVosk';

class FakeWorker extends EventTarget {
  static instances: FakeWorker[] = [];
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor(readonly url: string) { super(); FakeWorker.instances.push(this); }
  send(data: unknown) { this.dispatchEvent(new MessageEvent('message', { data })); }
}
const audio = (rate = 16_000, samples = new Float32Array([0, 0.5, -0.5])): AudioBuffer => ({
  sampleRate: rate, numberOfChannels: 1, length: samples.length, getChannelData: () => samples,
  duration: samples.length / rate, copyFromChannel: vi.fn(), copyToChannel: vi.fn(),
});
function start(signal?: AbortSignal) {
  const result = vi.fn();
  const error = vi.fn();
  const promise = createLocalRecognizer(16_000, result, error, signal);
  const worker = FakeWorker.instances.at(-1)!;
  return { result, error, promise, worker };
}
beforeEach(() => { vi.useFakeTimers(); FakeWorker.instances = []; vi.stubGlobal('Worker', FakeWorker); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('local Vosk adapter', () => {
  it('uses only the selected Indian-English model and same-origin worker', async () => {
    expect(MODEL_NAME).toBe('vosk-model-small-en-in-0.4');
    expect(MODEL_URL).toBe('/models/vosk-model-small-en-in-0.4-browser-v2.tar.gz');
    const s = start();
    expect(s.worker.url).toBe(WORKER_URL);
    expect(s.worker.postMessage).toHaveBeenCalledWith({ action: 'init', sampleRate: 16_000 });
    s.worker.send({ event: 'ready' });
    (await s.promise).dispose();
    expect(s.worker.terminate).toHaveBeenCalledOnce();
  });

  it('distinguishes partial and final events and transfers a scaled copy', async () => {
    const s = start(); s.worker.send({ event: 'ready' }); const recognizer = await s.promise;
    const buffer = audio(); recognizer.acceptAudio(buffer);
    const [message, transfer] = s.worker.postMessage.mock.calls.at(-1)!;
    expect(Array.from(message.data)).toEqual([0, 16_384, -16_384]);
    expect(transfer).toEqual([message.data.buffer]);
    expect(buffer.getChannelData(0)[1]).toBe(0.5);
    s.worker.send({ event: 'partialresult', result: { partial: 'synthetic partial' } });
    s.worker.send({ event: 'result', result: { text: 'synthetic final' } });
    expect(s.result.mock.calls).toEqual([[{ text: 'synthetic partial', final: false }], [{ text: 'synthetic final', final: true }]]);
    recognizer.dispose();
  });

  it('flush waits for its tagged final AFTER queued chunks and runs the final callback first', async () => {
    const s = start(); s.worker.send({ event: 'ready' }); const r = await s.promise;
    r.acceptAudio(audio()); r.acceptAudio(audio());
    const flushed = vi.fn(); const promise = r.flush().then(flushed);
    expect(r.flush()).toBe(r.flush());
    r.acceptAudio(audio());
    expect(s.worker.postMessage.mock.calls.map(call => call[0].action)).toEqual(['init', 'audioChunk', 'audioChunk', 'retrieveFinalResult']);
    s.worker.send({ event: 'result', result: { text: 'queued segment' } });
    s.worker.send({ event: 'partialresult', result: { partial: 'last chunk' } });
    await Promise.resolve(); expect(flushed).not.toHaveBeenCalled();
    s.worker.send({ event: 'result', flushId: 1, result: { text: 'last chunk' } });
    expect(s.result).toHaveBeenLastCalledWith({ text: 'last chunk', final: true });
    await promise; expect(flushed).toHaveBeenCalledOnce(); r.dispose();
  });

  it('acknowledges an empty final without guessing a sleep interval', async () => {
    const s = start(); s.worker.send({ event: 'ready' }); const r = await s.promise;
    const flushed = r.flush(); s.worker.send({ event: 'result', flushId: 1, result: { text: '' } });
    await expect(flushed).resolves.toBeUndefined(); r.dispose();
  });

  it('does not allocate a worker for an already canceled session', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(createLocalRecognizer(16_000, vi.fn(), vi.fn(), controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it('terminates during model download and suppresses stale events', async () => {
    const controller = new AbortController(); const s = start(controller.signal);
    const rejected = expect(s.promise).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort(); await rejected;
    s.worker.send({ event: 'ready' }); s.worker.send({ event: 'result', result: { text: 'stale' } });
    expect(s.worker.terminate).toHaveBeenCalledOnce(); expect(s.result).not.toHaveBeenCalled(); expect(s.error).not.toHaveBeenCalled();
  });

  it('bounds startup and cleans up the owned worker', async () => {
    const s = start(); const rejected = expect(s.promise).rejects.toThrow('startup timed out');
    await vi.advanceTimersByTimeAsync(120_000); await rejected;
    expect(s.worker.terminate).toHaveBeenCalledOnce(); expect(s.error).toHaveBeenCalledOnce();
  });

  it('bounds flush and terminates rather than returning incomplete success', async () => {
    const s = start(); s.worker.send({ event: 'ready' }); const r = await s.promise;
    const rejected = expect(r.flush()).rejects.toThrow('finalization timed out');
    await vi.advanceTimersByTimeAsync(15_000); await rejected;
    expect(s.worker.terminate).toHaveBeenCalledOnce(); expect(s.error).toHaveBeenCalledOnce();
  });

  it('rejects a pending flush on dispose and ignores events from the old generation', async () => {
    const s = start(); s.worker.send({ event: 'ready' }); const r = await s.promise;
    const rejected = expect(r.flush()).rejects.toMatchObject({ name: 'AbortError' });
    r.dispose(); r.dispose(); await rejected;
    const next = start(); next.worker.send({ event: 'ready' });
    s.worker.send({ event: 'result', flushId: 1, result: { text: 'old generation' } });
    expect(s.result).not.toHaveBeenCalled(); expect(next.result).not.toHaveBeenCalled();
    expect(s.worker.terminate).toHaveBeenCalledOnce(); (await next.promise).dispose();
  });

  it('sanitizes worker failure payloads without logging them', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = start(); const rejected = expect(s.promise).rejects.toThrow('Local dictation failed');
    s.worker.send({ event: 'error', error: 'synthetic private payload' }); await rejected;
    expect(String(s.error.mock.calls[0][0])).not.toContain('private'); expect(log).not.toHaveBeenCalled();
  });

  it.each(['error', 'messageerror'])('handles worker %s without leaking its event', async (type) => {
    const s = start(); const rejected = expect(s.promise).rejects.toThrow('Local dictation failed');
    s.worker.dispatchEvent(new Event(type, { cancelable: true })); await rejected;
    expect(s.worker.terminate).toHaveBeenCalledOnce();
  });

  it.each([0, NaN, 7_999, 192_001, 16_000.1])('rejects unsupported sample rate %s before worker creation', async rate => {
    await expect(createLocalRecognizer(rate, vi.fn(), vi.fn())).rejects.toThrow('sample rate');
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it('fails closed on rate changes, nonfinite samples, or an unbounded queue', async () => {
    for (const invalid of [audio(48_000), audio(16_000, new Float32Array([NaN]))]) {
      const s = start(); s.worker.send({ event: 'ready' }); const r = await s.promise;
      r.acceptAudio(invalid); expect(s.error).toHaveBeenCalledOnce(); expect(s.worker.terminate).toHaveBeenCalledOnce();
    }
    const s = start(); s.worker.send({ event: 'ready' }); const r = await s.promise;
    for (let i = 0; i < 129; i++) r.acceptAudio(audio());
    expect(s.error).toHaveBeenCalledOnce(); expect(s.worker.terminate).toHaveBeenCalledOnce();
  });

  it('cancellation during the final callback wins over flush success', async () => {
    const controller = new AbortController(); const s = start(controller.signal);
    s.worker.send({ event: 'ready' }); const r = await s.promise;
    const rejected = expect(r.flush()).rejects.toMatchObject({ name: 'AbortError' });
    s.result.mockImplementation(() => controller.abort());
    s.worker.send({ event: 'result', flushId: 1, result: { text: 'synthetic final' } }); await rejected;
    expect(s.error).not.toHaveBeenCalled();
  });
});
