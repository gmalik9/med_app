import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { runInNewContext } from 'node:vm';
import workletSource from '../src/worklets/dictationCapture.worklet.js?raw';
import { useVoskDictation } from '../src/hooks/useVoskDictation';
import NoteDictation from '../src/components/NoteDictation';
import type { LocalRecognition, LocalRecognizer } from '../src/services/localVosk';

const mocks = vi.hoisted(() => ({ create: vi.fn(), session: 1 }));
vi.mock('../src/services/localVosk', () => ({ createLocalRecognizer: mocks.create }));
vi.mock('../src/utils/apiClient', () => ({ apiClient: { getSessionGeneration: () => mocks.session } }));
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
let contexts: FakeContext[];
let tracks: Array<{ stop: ReturnType<typeof vi.fn>; onended: (() => void) | null }>;
let worklets: FakeWorklet[];
let statuses: string[];
let media: ReturnType<typeof vi.fn>;
let result: (event: LocalRecognition) => void;
let failure: (error: Error) => void;
let recognizer: LocalRecognizer;
let onText: ReturnType<typeof vi.fn<(text: string) => void>>;
let useWorklet: boolean;
let autoDrain: boolean;
let moduleReady: Promise<void>;
class FakeWorklet {
  connect = vi.fn();
  disconnect = vi.fn();
  port = {
    onmessage: null as null | ((event: any) => void), close: vi.fn(),
    postMessage: vi.fn((message: { type: string }) => {
      if (autoDrain && message.type === 'stop') queueMicrotask(() => this.port.onmessage?.({ data: { type: 'stopped' } }));
    }),
  };
  constructor() { worklets.push(this); }
}
class FakeContext {
  sampleRate = 48_000;
  state = 'running';
  destination = {};
  audioWorklet = useWorklet ? { addModule: vi.fn((_url: string) => moduleReady) } : undefined;
  resume = vi.fn(async () => {});
  close = vi.fn(async () => { this.state = 'closed'; });
  source = node();
  gain = { ...node(), gain: { value: 1 } };
  createMediaStreamSource = vi.fn(() => this.source);
  createGain = vi.fn(() => this.gain);
  createBuffer = vi.fn((_channels: number, length: number, sampleRate: number) => ({ length, sampleRate, copyToChannel: vi.fn() }));
  createScriptProcessor = vi.fn(() => { throw new Error('ScriptProcessor must never be used'); });
  constructor() { contexts.push(this); }
}
const stream = () => {
  const track = { stop: vi.fn(), onended: null as (() => void) | null };
  tracks.push(track);
  return { getTracks: () => [track] } as unknown as MediaStream;
};
function Harness({ identity = 'synthetic-A', generation = 1, enabled = true }: { identity?: string; generation?: number; enabled?: boolean }) {
  const dictation = useVoskDictation({ contextKey: identity, enabled, canStart: () => enabled, getGeneration: () => generation, onText });
  React.useLayoutEffect(() => { statuses.push(dictation.status); }, [dictation.status]);
  return <><NoteDictation dictation={dictation} disabled={!enabled} /><button onClick={dictation.cancel}>Cancel context</button></>;
}
const start = () => fireEvent.click(screen.getByRole('button', { name: 'Start dictation' }));
const stop = async () => { await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Stop dictation' })); }); };
const status = () => screen.getByRole('status', { name: 'Dictation status' });
async function listening() { start(); await waitFor(() => expect(status()).toHaveTextContent('Listening')); }
function audio(length = 4096) {
  const samples = new Float32Array(length).fill(0.125);
  act(() => worklets[worklets.length - 1].port.onmessage?.({ data: { type: 'audio', samples } }));
  return samples;
}
beforeEach(() => {
  mocks.create.mockReset(); mocks.session = 1;
  contexts = []; tracks = []; worklets = []; statuses = []; useWorklet = true; autoDrain = true; moduleReady = Promise.resolve();
  onText = vi.fn();
  recognizer = { acceptAudio: vi.fn(), flush: vi.fn(async () => {}), dispose: vi.fn() };
  mocks.create.mockImplementation(async (_rate, onResult, onError) => { result = onResult; failure = onError; return recognizer; });
  media = vi.fn(async () => stream());
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('AudioContext', FakeContext);
  vi.stubGlobal('AudioWorkletNode', FakeWorklet);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: media } });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('local dictation capture lifecycle (synthetic mocks, no real microphone)', () => {
  it('does not prepare a model or request a microphone until the named click', () => {
    render(<Harness />);
    expect(status()).toHaveTextContent('Stopped');
    expect(contexts).toHaveLength(0); expect(media).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
    expect(screen.getByText(/General speech model, not clinically validated/)).toBeVisible();
    expect(screen.getByText(/approximately 36 MB/)).toBeVisible();
  });
  it('uses actual device rate, mono worklet capture and a muted output without ScriptProcessor', async () => {
    render(<Harness />); await listening();
    expect(mocks.create).toHaveBeenCalledWith(48_000, expect.any(Function), expect.any(Function), expect.any(AbortSignal));
    expect(media).toHaveBeenCalledWith({ audio: { channelCount: 1 }, video: false });
    expect(contexts[0].createScriptProcessor).not.toHaveBeenCalled();
    expect(contexts[0].gain.gain.value).toBe(0);
    expect(contexts[0].source.connect).toHaveBeenCalledWith(worklets[0]);
    expect(worklets[0].connect).toHaveBeenCalledWith(contexts[0].gain);
    expect(contexts[0].gain.connect).toHaveBeenCalledWith(contexts[0].destination);
    const samples = audio();
    const buffer = contexts[0].createBuffer.mock.results[0].value;
    expect(contexts[0].createBuffer).toHaveBeenCalledWith(1, 4096, 48_000);
    expect(buffer.copyToChannel).toHaveBeenCalledWith(samples, 0);
    expect(recognizer.acceptAudio).toHaveBeenCalledWith(buffer);
    expect(screen.queryByText(/deprecated ScriptProcessor/)).not.toBeInTheDocument();
  });
  it.each(['node', 'context', 'module'])('rejects missing AudioWorklet %s before microphone/model acquisition and allows an explicit supported retry', async kind => {
    if (kind === 'node') vi.stubGlobal('AudioWorkletNode', undefined);
    if (kind === 'context') useWorklet = false;
    if (kind === 'module') vi.stubGlobal('AudioContext', class extends FakeContext {
      constructor() { super(); Object.assign(this.audioWorklet!, { addModule: undefined }); }
    });
    render(<Harness />); start();
    expect(screen.getByRole('alert')).toHaveTextContent('requires AudioWorklet');
    expect(screen.getByRole('alert')).toHaveTextContent('You can keep typing; your existing note is kept');
    expect(status()).toHaveTextContent('Stopped'); expect(statuses).not.toContain('Listening');
    expect(media).not.toHaveBeenCalled(); expect(tracks).toHaveLength(0); expect(mocks.create).not.toHaveBeenCalled();
    expect(recognizer.acceptAudio).not.toHaveBeenCalled(); expect(worklets).toHaveLength(0);
    expect(recognizer.flush).not.toHaveBeenCalled(); expect(recognizer.dispose).not.toHaveBeenCalled();
    expect(contexts).toHaveLength(kind === 'node' ? 0 : 1);
    for (const context of contexts) {
      expect(context.resume).not.toHaveBeenCalled(); expect(context.close).toHaveBeenCalledTimes(1);
      expect(context.state).toBe('closed'); expect(context.createScriptProcessor).not.toHaveBeenCalled();
    }
    expect(screen.getByRole('button', { name: 'Start dictation' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Stop dictation' })).toBeDisabled();
    useWorklet = true; vi.stubGlobal('AudioContext', FakeContext); vi.stubGlobal('AudioWorkletNode', FakeWorklet);
    await listening(); expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(media).toHaveBeenCalledTimes(1); expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it('keeps duplicate interims separate; appends one final event once without deleting legitimate repetitions', async () => {
    render(<Harness />); await listening();
    act(() => { result({ text: 'synthetic repeat repeat', final: false }); result({ text: 'synthetic repeat repeat', final: false }); });
    expect(screen.getByLabelText('Dictation preview')).toHaveTextContent('synthetic repeat repeat');
    expect(onText).not.toHaveBeenCalled();
    act(() => result({ text: '  synthetic repeat repeat  ', final: true }));
    expect(onText.mock.calls).toEqual([['synthetic repeat repeat']]);
    expect(screen.queryByLabelText('Dictation preview')).not.toBeInTheDocument();
    act(() => { result({ text: 'synthetic repeat repeat', final: true }); result({ text: '  ', final: true }); });
    expect(onText.mock.calls).toEqual([['synthetic repeat repeat'], ['synthetic repeat repeat']]);
  });
  it('stops hardware immediately, awaits the last final segment, disposes once, and rejects late audio/results', async () => {
    const flushed = deferred<void>();
    vi.mocked(recognizer.flush).mockReturnValue(flushed.promise);
    render(<Harness />); await listening();
    const oldAudio = worklets[0].port.onmessage!;
    await stop();
    expect(status()).toHaveTextContent('Processing'); expect(tracks[0].stop).toHaveBeenCalledTimes(1);
    expect(contexts[0].close).toHaveBeenCalledTimes(1); expect(worklets[0].disconnect).toHaveBeenCalledTimes(1);
    expect(recognizer.dispose).not.toHaveBeenCalled();
    act(() => result({ text: 'synthetic final segment', final: true }));
    await act(async () => flushed.resolve());
    expect(status()).toHaveTextContent('Stopped'); expect(onText).toHaveBeenCalledExactlyOnceWith('synthetic final segment');
    expect(recognizer.dispose).toHaveBeenCalledTimes(1);
    act(() => { result({ text: 'late result', final: true }); oldAudio({ data: { type: 'audio', samples: new Float32Array(4096) } }); });
    expect(onText).toHaveBeenCalledTimes(1); expect(recognizer.acceptAudio).not.toHaveBeenCalled();
  });
  it.each(['stop', 'unmount', 'identity'])('closes pending permission resources on %s, and stops a late-granted stream', async kind => {
    const permission = deferred<MediaStream>(); media.mockReturnValueOnce(permission.promise);
    const view = render(<Harness />); start();
    expect(status()).toHaveTextContent('Loading model');
    if (kind === 'stop') await stop();
    else if (kind === 'unmount') view.unmount();
    else view.rerender(<Harness identity="synthetic-B" />);
    expect(contexts[0].close).toHaveBeenCalledTimes(1);
    const lateStream = stream();
    await act(async () => permission.resolve(lateStream));
    expect(tracks[0].stop).toHaveBeenCalledTimes(1); expect(mocks.create).not.toHaveBeenCalled();
  });
  it('aborts preparation with an acquired microphone, disposes a late adapter, and permits a safe retry', async () => {
    const model = deferred<LocalRecognizer>(); mocks.create.mockReturnValueOnce(model.promise);
    render(<Harness />); start(); await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    const signal = mocks.create.mock.calls[0][3] as AbortSignal;
    await stop(); expect(signal.aborted).toBe(true); expect(tracks[0].stop).toHaveBeenCalledTimes(1); expect(contexts[0].close).toHaveBeenCalledTimes(1);
    const late = { ...recognizer, dispose: vi.fn() };
    await act(async () => model.resolve(late));
    expect(late.dispose).toHaveBeenCalledTimes(1); expect(status()).toHaveTextContent('Stopped');
    await listening(); expect(mocks.create).toHaveBeenCalledTimes(2);
  });
  it('releases an acquired microphone on model initialization failure and retries without reusing failed resources', async () => {
    mocks.create.mockRejectedValueOnce(new Error('synthetic preparation failure'));
    render(<Harness />); start(); await screen.findByRole('alert');
    expect(tracks[0].stop).toHaveBeenCalledTimes(1); expect(contexts[0].close).toHaveBeenCalledTimes(1);
    expect(mocks.create.mock.calls[0][3].aborted).toBe(true);
    await listening(); expect(tracks[1].stop).not.toHaveBeenCalled(); expect(contexts).toHaveLength(2);
  });
  it('stops only the late old permission stream, not a newer listening session', async () => {
    const permission = deferred<MediaStream>(); media.mockReturnValueOnce(permission.promise);
    render(<Harness />); start(); await stop(); await listening();
    const oldStream = stream(); await act(async () => permission.resolve(oldStream));
    expect(status()).toHaveTextContent('Listening'); expect(tracks[0].stop).not.toHaveBeenCalled();
    expect(tracks[1].stop).toHaveBeenCalledTimes(1); expect(contexts[1].close).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it('does not auto-start under React StrictMode effect replay and cleans up once after a user start', async () => {
    const view = render(<React.StrictMode><Harness /></React.StrictMode>);
    expect(media).not.toHaveBeenCalled(); await listening(); view.unmount();
    expect(tracks[0].stop).toHaveBeenCalledTimes(1); expect(contexts[0].close).toHaveBeenCalledTimes(1);
    expect(recognizer.dispose).toHaveBeenCalledTimes(1);
  });
  it.each(['patient', 'generation', 'session', 'expiry', 'pagehide', 'unmount'])('rejects late results and releases all active resources after %s invalidation', async kind => {
    const view = render(<Harness />); await listening();
    const late = result;
    if (kind === 'patient') view.rerender(<Harness identity="synthetic-B" />);
    if (kind === 'generation') view.rerender(<Harness generation={2} />);
    if (kind === 'session') mocks.session++;
    if (kind === 'expiry') act(() => window.dispatchEvent(new Event('session-expired')));
    if (kind === 'pagehide') act(() => window.dispatchEvent(new Event('pagehide')));
    if (kind === 'unmount') view.unmount();
    act(() => late({ text: 'stale synthetic text', final: true }));
    expect(onText).not.toHaveBeenCalled(); expect(recognizer.flush).not.toHaveBeenCalled();
    expect(tracks[0].stop).toHaveBeenCalledTimes(1); expect(contexts[0].close).toHaveBeenCalledTimes(1);
    expect(recognizer.dispose).toHaveBeenCalledTimes(1); expect(worklets[0].port.onmessage).toBeNull();
  });
  it('watches session changes even when no results or audio callbacks arrive', async () => {
    render(<Harness />); await listening(); vi.useFakeTimers();
    // Restart so the single lifecycle interval is on the fake clock.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel context' }));
    await act(async () => start());
    mocks.session++;
    act(() => vi.advanceTimersByTime(250));
    expect(status()).toHaveTextContent('Stopped'); expect(tracks[1].stop).toHaveBeenCalledTimes(1);
  });
  it('does not let old errors or finalization unlock or alter a newer run', async () => {
    const flushed = deferred<void>(); vi.mocked(recognizer.flush).mockReturnValueOnce(flushed.promise);
    const view = render(<Harness />); await listening();
    const oldResult = result; const oldError = failure; await stop();
    view.rerender(<Harness identity="synthetic-B" />); await listening();
    await act(async () => { oldResult({ text: 'stale', final: true }); oldError(new Error('stale')); flushed.resolve(); });
    expect(status()).toHaveTextContent('Listening'); expect(screen.queryByRole('alert')).not.toBeInTheDocument(); expect(onText).not.toHaveBeenCalled();
  });
  it.each(['insecure', 'unsupported', 'denied', 'missing'])('shows an actionable %s microphone error without a fallback service', async kind => {
    if (kind === 'insecure') vi.stubGlobal('isSecureContext', false);
    if (kind === 'unsupported') vi.stubGlobal('navigator', {});
    if (kind === 'denied' || kind === 'missing') media.mockRejectedValueOnce(new DOMException('synthetic', kind === 'denied' ? 'NotAllowedError' : 'NotFoundError'));
    render(<Harness />); start();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(kind === 'insecure' ? 'HTTPS or localhost' : kind === 'unsupported' ? 'does not support' : kind === 'denied' ? 'permission was denied' : 'No microphone');
    expect(status()).toHaveTextContent('Stopped'); expect(mocks.create).not.toHaveBeenCalled();
    if (contexts.length) expect(contexts[0].close).toHaveBeenCalledTimes(1);
  });
  it.each(['adapter', 'capture', 'device', 'flush'])('releases microphone, graph and recognizer on %s errors while retaining no transcript', async kind => {
    render(<Harness />); await listening();
    act(() => result({ text: 'synthetic preview', final: false }));
    if (kind === 'adapter') act(() => failure(new Error('do not surface transcript')));
    if (kind === 'capture') { vi.mocked(recognizer.acceptAudio).mockImplementationOnce(() => { throw new Error('synthetic'); }); audio(); }
    if (kind === 'device') act(() => tracks[0].onended?.());
    if (kind === 'flush') { vi.mocked(recognizer.flush).mockRejectedValueOnce(new Error('synthetic')); await stop(); }
    await screen.findByRole('alert');
    expect(status()).toHaveTextContent('Stopped'); expect(screen.queryByLabelText('Dictation preview')).not.toBeInTheDocument();
    expect(tracks[0].stop).toHaveBeenCalledTimes(1); expect(contexts[0].close).toHaveBeenCalledTimes(1); expect(recognizer.dispose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('do not surface transcript')).not.toBeInTheDocument();
  });
  it('bounds hung preparation, finalization, input duration and result size', async () => {
    vi.useFakeTimers(); const model = deferred<LocalRecognizer>(); mocks.create.mockReturnValueOnce(model.promise);
    render(<Harness />); await act(async () => start());
    act(() => vi.advanceTimersByTime(120_000));
    expect(screen.getByRole('alert')).toHaveTextContent('preparation timed out'); expect(tracks[0].stop).toHaveBeenCalledTimes(1);
    await act(async () => model.resolve(recognizer));
    await act(async () => start());
    const flushed = deferred<void>(); vi.mocked(recognizer.flush).mockReturnValueOnce(flushed.promise);
    await stop(); act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByRole('alert')).toHaveTextContent('processing timed out');
    await act(async () => flushed.resolve());
    await act(async () => start());
    act(() => result({ text: 'x'.repeat(16_001), final: false }));
    expect(screen.getByRole('alert')).toHaveTextContent('safety limit');
    await act(async () => start());
    const last = worklets[worklets.length - 1];
    act(() => {
      // Exceed five minutes using valid-sized worklet messages, not an impossible oversized block.
      for (let frames = 0; frames <= 48_000 * 300; frames += 4096) {
        last.port.onmessage?.({ data: { type: 'audio', samples: new Float32Array(4096) } });
      }
    });
    expect(screen.getByRole('alert')).toHaveTextContent('five-minute');
  });
  it('requires same-origin AudioWorklet and drains its final block before flushing Vosk', async () => {
    autoDrain = false;
    render(<Harness />); await listening();
    expect(contexts[0].createScriptProcessor).not.toHaveBeenCalled();
    const url = contexts[0].audioWorklet!.addModule.mock.calls[0][0];
    expect(url).not.toMatch(/^(?:https?:|blob:|data:)/);
    expect(screen.queryByText(/deprecated ScriptProcessor/)).not.toBeInTheDocument();
    const receive = worklets[0].port.onmessage!;
    act(() => receive({ data: { type: 'audio', samples: new Float32Array(4096) } }));
    expect(recognizer.acceptAudio).toHaveBeenCalledTimes(1);
    expect(worklets[0].port.postMessage).toHaveBeenCalledWith({ type: 'ack' });
    await stop(); expect(recognizer.flush).not.toHaveBeenCalled(); expect(tracks[0].stop).toHaveBeenCalledTimes(1);
    expect(contexts[0].close).not.toHaveBeenCalled(); expect(worklets[0].port.close).not.toHaveBeenCalled();
    expect(worklets[0].port.postMessage).toHaveBeenCalledWith({ type: 'stop' });
    await act(async () => {
      receive({ data: { type: 'audio', samples: new Float32Array(128) } });
      receive({ data: { type: 'stopped' } });
    });
    expect(recognizer.acceptAudio).toHaveBeenCalledTimes(2); expect(recognizer.flush).toHaveBeenCalledTimes(1);
    expect(worklets[0].port.close).toHaveBeenCalledTimes(1); expect(worklets[0].disconnect).toHaveBeenCalledTimes(1);
    expect(status()).toHaveTextContent('Stopped');
  });
  it('cancels during worklet loading and releases resources if module loading fails (no silent fallback)', async () => {
    useWorklet = true; const pending = deferred<void>(); moduleReady = pending.promise;
    render(<Harness />); start(); await waitFor(() => expect(contexts[0].audioWorklet!.addModule).toHaveBeenCalled());
    await stop(); await act(async () => pending.resolve());
    expect(worklets).toHaveLength(0); expect(contexts[0].source.disconnect).toHaveBeenCalled(); expect(tracks[0].stop).toHaveBeenCalledTimes(1);
    moduleReady = Promise.reject(new Error('synthetic module failure'));
    start(); await screen.findByRole('alert');
    expect(contexts[1].createScriptProcessor).not.toHaveBeenCalled(); expect(contexts[1].close).toHaveBeenCalledTimes(1);
    expect(tracks[1].stop).toHaveBeenCalledTimes(1); expect(recognizer.dispose).toHaveBeenCalledTimes(2);
    expect(mocks.create.mock.calls[1][3].aborted).toBe(true); expect(statuses).not.toContain('Listening');
    expect(worklets).toHaveLength(0); expect(status()).toHaveTextContent('Stopped');
    expect(screen.getByRole('button', { name: 'Start dictation' })).toBeEnabled();
  });
  it('fails closed on worklet overflow and permits navigation during a hung drain', async () => {
    autoDrain = false; const view = render(<Harness />); await listening();
    act(() => worklets[0].port.onmessage?.({ data: { type: 'overflow' } }));
    expect(screen.getByRole('alert')).toHaveTextContent('could not keep up');
    await listening(); await stop();
    view.rerender(<Harness identity="synthetic-B" />);
    await act(async () => {});
    expect(status()).toHaveTextContent('Stopped'); expect(recognizer.flush).not.toHaveBeenCalled();
    expect(worklets[1].port.close).toHaveBeenCalledTimes(1);
  });
});

describe('capture worklet algorithm (synthetic PCM only)', () => {
  function processor() {
    let Constructor: any;
    const posted: any[] = [];
    class Base { port = { postMessage: (message: unknown) => posted.push(message), onmessage: null }; }
    runInNewContext(workletSource, { AudioWorkletProcessor: Base, registerProcessor: (_name: string, ctor: any) => { Constructor = ctor; } });
    return { capture: new Constructor(), posted };
  }
  it('emits exact mono samples, zeros output, bounds pending blocks and flushes the partial block before the stop barrier', () => {
    const { capture, posted } = processor();
    const input = new Float32Array(128).fill(0.125); const output = new Float32Array(128).fill(1);
    for (let i = 0; i < 32; i++) expect(capture.process([[input]], [[output]])).toBe(true);
    expect(posted).toHaveLength(1); expect(Array.from(posted[0].samples)).toEqual(Array(4096).fill(0.125)); expect(output.every(value => value === 0)).toBe(true);
    capture.port.onmessage({ data: { type: 'ack' } });
    capture.process([[input]], [[output]]);
    capture.port.onmessage({ data: { type: 'stop' } });
    expect(posted.map(message => message.type)).toEqual(['audio', 'audio', 'stopped']); expect(posted[1].samples.length).toBe(128);
    expect(capture.process([[input]], [[output]])).toBe(false);
  });
  it('signals overflow rather than enqueueing unlimited audio', () => {
    const { capture, posted } = processor();
    const input = new Float32Array(4096);
    expect(capture.process([[input]], [[]])).toBe(true);
    expect(capture.process([[input]], [[]])).toBe(false);
    expect(posted.map(message => message.type)).toEqual(['audio', 'overflow']);
  });
});
