import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import NoteEditor from '../src/components/NoteEditor';
import { apiClient } from '../src/utils/apiClient';
import type { LocalRecognition, LocalRecognizer } from '../src/services/localVosk';

const mocks = vi.hoisted(() => ({ create: vi.fn(), session: 1 }));
vi.mock('../src/services/localVosk', () => ({ createLocalRecognizer: mocks.create }));
vi.mock('../src/utils/apiClient', () => ({ apiClient: {
  getTodayNote: vi.fn(), getTemplates: vi.fn(), saveNote: vi.fn(), formatNote: vi.fn(), createTemplate: vi.fn(),
  getSessionGeneration: () => mocks.session,
} }));
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const version = (text = 'SYNTHETIC original', revision = 7) => ({ note_text: text, revision, medical_codes: ['SYN-BASE'] });
const loaded = (text = 'SYNTHETIC original', revision = 7) => ({ data: { exists: true, note: version(text, revision) } });
let contexts: FakeContext[];
let tracks: Array<{ stop: ReturnType<typeof vi.fn>; onended: (() => void) | null }>;
let media: ReturnType<typeof vi.fn>;
let result: (event: LocalRecognition) => void;
let recognizer: LocalRecognizer;
let useWorklet: boolean;
class FakeWorklet {
  connect = vi.fn();
  disconnect = vi.fn();
  port = {
    onmessage: null as null | ((event: any) => void), close: vi.fn(),
    postMessage: vi.fn((message: { type: string }) => {
      if (message.type === 'stop') queueMicrotask(() => this.port.onmessage?.({ data: { type: 'stopped' } }));
    }),
  };
}
class FakeContext {
  sampleRate = 44_100;
  state = 'running';
  destination = {};
  audioWorklet = useWorklet ? { addModule: vi.fn(async () => {}) } : undefined;
  resume = vi.fn(async () => {});
  close = vi.fn(async () => { this.state = 'closed'; });
  createMediaStreamSource = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  createGain = () => ({ connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 } });
  createScriptProcessor = vi.fn(() => { throw new Error('ScriptProcessor must never be used'); });
  constructor() { contexts.push(this); }
}
const note = () => screen.getByLabelText('Clinical note');
const date = () => screen.getByLabelText('Note date');
const startButton = () => screen.getByRole('button', { name: 'Start dictation' });
const start = () => fireEvent.click(startButton());
const stop = async () => { await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Stop dictation' })); }); };
const save = () => screen.getByRole('button', { name: 'Save Note' });
const format = () => screen.getByRole('button', { name: /Format with AI/ });
const edit = (value: string) => fireEvent.change(note(), { target: { value } });
const status = () => screen.getByRole('status', { name: 'Dictation status' });
const unload = () => {
  const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented;
};
async function mount(onDirtyChange?: (dirty: boolean) => void) {
  const view = render(<NoteEditor patientId="SYN-A" onDirtyChange={onDirtyChange} />);
  await waitFor(() => expect(note()).toHaveValue('SYNTHETIC original'));
  return view;
}
async function listening() { start(); await waitFor(() => expect(status()).toHaveTextContent('Listening')); }
beforeEach(() => {
  vi.resetAllMocks(); mocks.session = 1;
  contexts = []; tracks = []; useWorklet = true;
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  vi.mocked(apiClient.getTodayNote).mockResolvedValue(loaded() as any);
  vi.mocked(apiClient.getTemplates).mockResolvedValue({ data: { templates: [{ id: 1, template_name: 'Synthetic template', template_text: 'SYNTHETIC template', template_category: 'Synthetic' }] } } as any);
  vi.mocked(apiClient.formatNote).mockResolvedValue({ data: { text: 'SYNTHETIC AI proposal' } } as any);
  vi.mocked(apiClient.saveNote).mockImplementation(async (_id, text, _date, _codes, revision) => ({ data: { note: version(text, (revision ?? 0) + 1) } }) as any);
  recognizer = { acceptAudio: vi.fn(), flush: vi.fn(async () => {}), dispose: vi.fn() };
  mocks.create.mockImplementation(async (_rate, onResult) => { result = onResult; return recognizer; });
  media = vi.fn(async () => {
    const track = { stop: vi.fn(), onended: null as (() => void) | null }; tracks.push(track);
    return { getTracks: () => [track] };
  });
  vi.stubGlobal('isSecureContext', true); vi.stubGlobal('AudioContext', FakeContext);
  vi.stubGlobal('AudioWorkletNode', FakeWorklet);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: media } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('note dictation integration and prior draft safeguards', () => {
  it.each(['context', 'node'])('keeps typing and reviewed Save available when the AudioWorklet %s is unsupported, without acquiring audio or loading a model', async kind => {
    if (kind === 'context') useWorklet = false;
    else vi.stubGlobal('AudioWorkletNode', undefined);
    await mount(); edit('SYNTHETIC manual dose 12.5 mg'); start();
    expect(screen.getByRole('alert')).toHaveTextContent('requires AudioWorklet');
    expect(screen.getByRole('alert')).toHaveTextContent('You can keep typing');
    expect(status()).toHaveTextContent('Stopped'); expect(startButton()).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Stop dictation' })).toBeDisabled();
    expect(note()).toBeEnabled(); expect(note()).toHaveValue('SYNTHETIC manual dose 12.5 mg');
    expect(unload()).toBe(true); expect(save()).toBeEnabled();
    start(); // Repeated attempts still fail closed, never start Listening or acquire resources.
    expect(media).not.toHaveBeenCalled(); expect(tracks).toHaveLength(0); expect(mocks.create).not.toHaveBeenCalled();
    expect(contexts).toHaveLength(kind === 'context' ? 2 : 0);
    for (const context of contexts) {
      expect(context.state).toBe('closed'); expect(context.close).toHaveBeenCalledTimes(1);
      expect(context.createScriptProcessor).not.toHaveBeenCalled();
    }
    edit('SYNTHETIC manually reviewed dose 12.5 mg at 18:30'); fireEvent.click(save());
    await screen.findByText('Note saved successfully!');
    expect(apiClient.saveNote).toHaveBeenCalledExactlyOnceWith('SYN-A', 'SYNTHETIC manually reviewed dose 12.5 mg at 18:30', expect.any(String), ['SYN-BASE'], 7);
  });
  it.each(['manual', 'dictated'])('retains the entire over-limit %s draft including dose/numbers, blocks Save, and recovers only after explicit editing', async kind => {
    await mount();
    const base = 'SYNTHETIC ' + 'x'.repeat(49_980);
    const segment = 'synthetic dose 12.5 mg at 18:30';
    const full = `${base} ${segment}`;
    edit(base);
    if (kind === 'dictated') {
      await listening(); act(() => result({ text: segment, final: true })); await stop();
    } else edit(full);
    expect(note()).toHaveValue(full); expect(note()).toBeEnabled(); expect(note()).not.toHaveAttribute('maxlength');
    expect(screen.getByText(`${full.length.toLocaleString('en-US')} / 50,000 characters`)).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('All text is kept');
    expect(screen.getByRole('alert')).toHaveTextContent('Review and shorten it before saving');
    expect(save()).toBeDisabled(); fireEvent.click(save()); expect(apiClient.saveNote).not.toHaveBeenCalled();
    expect(note()).toHaveValue(full); expect(unload()).toBe(true);
    const reviewed = 'SYNTHETIC reviewed dose 12.5 mg at 18:30'; edit(reviewed);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument(); expect(save()).toBeEnabled(); fireEvent.click(save());
    await screen.findByText('Note saved successfully!');
    expect(apiClient.saveNote).toHaveBeenCalledExactlyOnceWith('SYN-A', reviewed, expect.any(String), ['SYN-BASE'], 7);
  });
  it('allows the exact 50,000-character boundary without altering the final dose', async () => {
    await mount(); const tail = ' synthetic dose 12.5 mg';
    const text = 'x'.repeat(50_000 - tail.length) + tail;
    edit(text.substring(1)); expect(save()).toBeEnabled();
    edit(text); expect(save()).toBeEnabled(); expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('50,000 / 50,000 characters')).toBeVisible();
    fireEvent.click(save()); await screen.findByText('Note saved successfully!');
    expect(apiClient.saveNote).toHaveBeenCalledExactlyOnceWith('SYN-A', text, expect.any(String), ['SYN-BASE'], 7);
    expect(note()).toHaveValue(text);
  });
  it('requires verified existing/absent note loading before the first microphone click', async () => {
    const pending = deferred<any>(); vi.mocked(apiClient.getTodayNote).mockReturnValueOnce(pending.promise);
    render(<NoteEditor patientId="SYN-A" />);
    expect(startButton()).toBeDisabled(); start(); expect(media).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
    await act(async () => pending.resolve({ data: { exists: false, note: null } }));
    expect(startButton()).toBeEnabled(); await listening();
    expect(mocks.create.mock.calls[0][0]).toBe(44_100); expect(note()).toHaveValue('');
  });
  it.each(['failed', 'unverified'])('does not start when note load is %s', async kind => {
    if (kind === 'failed') vi.mocked(apiClient.getTodayNote).mockRejectedValueOnce(new Error('synthetic'));
    else vi.mocked(apiClient.getTodayNote).mockResolvedValueOnce({ data: { exists: true, note: { note_text: 'unverified' } } } as any);
    render(<NoteEditor patientId="SYN-A" />); await screen.findByRole('alert');
    expect(startButton()).toBeDisabled(); start(); expect(media).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
  it('makes model preparation and interim-only capture dirty before stop, without changing the saved draft', async () => {
    const model = deferred<LocalRecognizer>(); mocks.create.mockReturnValueOnce(model.promise);
    const dirty = vi.fn(); await mount(dirty);
    expect(unload()).toBe(false); expect(dirty).toHaveBeenLastCalledWith(false);
    start(); expect(unload()).toBe(true); expect(dirty).toHaveBeenLastCalledWith(true);
    expect(note()).toHaveValue('SYNTHETIC original'); expect(save()).toBeDisabled();
    await stop(); expect(dirty).toHaveBeenLastCalledWith(false);
    await act(async () => model.resolve(recognizer));
    await listening(); act(() => result({ text: 'SYNTHETIC preview', final: false }));
    expect(unload()).toBe(true); expect(note()).toHaveValue('SYNTHETIC original');
    await stop(); await waitFor(() => expect(status()).toHaveTextContent('Stopped'));
    expect(unload()).toBe(false); expect(screen.queryByLabelText('Dictation preview')).not.toBeInTheDocument();
    expect(apiClient.saveNote).not.toHaveBeenCalled();
  });
  it('appends final segments only, preserving exact repeated words and manual edits without stale full-draft replacement', async () => {
    await mount(); await listening();
    act(() => { result({ text: 'synthetic repeat repeat', final: false }); result({ text: 'synthetic repeat repeat', final: false }); });
    expect(note()).toHaveValue('SYNTHETIC original'); expect(note()).toBeEnabled();
    edit('SYNTHETIC manually edited\n');
    act(() => result({ text: '  synthetic repeat repeat  ', final: true }));
    expect(note()).toHaveValue('SYNTHETIC manually edited\nsynthetic repeat repeat');
    edit('SYNTHETIC newer manual text');
    act(() => { result({ text: 'same same', final: true }); result({ text: 'same same', final: true }); });
    expect(note()).toHaveValue('SYNTHETIC newer manual text same same same same');
    expect(apiClient.saveNote).not.toHaveBeenCalled(); expect(apiClient.formatNote).not.toHaveBeenCalled();
  });
  it('keeps save, AI and templates locked through final flush; preserves typing during processing and the saved revision', async () => {
    const flushed = deferred<void>(); vi.mocked(recognizer.flush).mockReturnValueOnce(flushed.promise);
    await mount(); await listening();
    const actions = [save(), format(), screen.getByRole('button', { name: 'Synthetic template' }), screen.getByRole('button', { name: '+ Create Template' })];
    for (const button of actions) expect(button).toBeDisabled();
    await stop(); expect(status()).toHaveTextContent('Processing'); expect(save()).toBeDisabled(); expect(note()).toBeEnabled();
    expect(date()).toBeEnabled(); // Confirmed navigation must remain possible during a hung flush.
    edit('SYNTHETIC typed during processing');
    act(() => result({ text: 'synthetic last segment', final: true }));
    for (const button of actions) { expect(button).toBeDisabled(); fireEvent.click(button); }
    expect(apiClient.saveNote).not.toHaveBeenCalled(); expect(apiClient.formatNote).not.toHaveBeenCalled();
    await act(async () => flushed.resolve());
    expect(save()).toBeEnabled(); expect(note()).toHaveValue('SYNTHETIC typed during processing synthetic last segment');
    fireEvent.click(save()); await screen.findByText('Note saved successfully!');
    expect(apiClient.saveNote).toHaveBeenCalledExactlyOnceWith('SYN-A', 'SYNTHETIC typed during processing synthetic last segment', expect.any(String), ['SYN-BASE'], 7);
  });
  it.each(['start first', 'save first', 'format first'])('uses synchronous locks for same-render competing clicks: %s', async order => {
    const pending = deferred<any>(); vi.mocked(apiClient.saveNote).mockReturnValueOnce(pending.promise); vi.mocked(apiClient.formatNote).mockReturnValueOnce(pending.promise);
    await mount();
    const startControl = startButton(); const saveControl = save(); const formatControl = format();
    act(() => {
      if (order === 'start first') { startControl.click(); saveControl.click(); formatControl.click(); startControl.click(); }
      else { (order === 'save first' ? saveControl : formatControl).click(); startControl.click(); }
    });
    if (order === 'start first') {
      await waitFor(() => expect(status()).toHaveTextContent('Listening'));
      expect(media).toHaveBeenCalledTimes(1); expect(apiClient.saveNote).not.toHaveBeenCalled(); expect(apiClient.formatNote).not.toHaveBeenCalled();
    } else {
      expect(media).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
      await act(async () => pending.reject(new Error('synthetic completion')));
    }
  });
  it.each(['Loading model', 'Listening', 'Processing'])('canceling date navigation while %s retains dictation, date, and draft', async phase => {
    const permission = deferred<MediaStream>(); const flushed = deferred<void>();
    if (phase === 'Loading model') media.mockReturnValueOnce(permission.promise);
    if (phase === 'Processing') vi.mocked(recognizer.flush).mockReturnValueOnce(flushed.promise);
    await mount(); const oldDate = (date() as HTMLInputElement).value;
    if (phase === 'Loading model') start(); else await listening();
    if (phase === 'Processing') await stop();
    fireEvent.change(date(), { target: { value: '2025-01-02' } });
    expect(window.confirm).toHaveBeenCalledTimes(1); expect(date()).toHaveValue(oldDate); expect(status()).toHaveTextContent(phase);
    expect(apiClient.getTodayNote).toHaveBeenCalledTimes(1); expect(note()).toHaveValue('SYNTHETIC original');
    if (phase === 'Processing') await act(async () => flushed.resolve());
  });
  it.each(['Listening', 'Processing'])('accepted date changes cancel %s without leaking a final segment into the new date', async phase => {
    const flushed = deferred<void>(); vi.mocked(recognizer.flush).mockReturnValueOnce(flushed.promise);
    await mount(); await listening(); const oldResult = result;
    act(() => result({ text: 'old synthetic interim', final: false }));
    if (phase === 'Processing') await stop();
    vi.mocked(window.confirm).mockReturnValue(true);
    vi.mocked(apiClient.getTodayNote).mockResolvedValueOnce(loaded('SYNTHETIC next date', 2) as any);
    fireEvent.change(date(), { target: { value: '2025-01-02' } });
    await waitFor(() => expect(note()).toHaveValue('SYNTHETIC next date'));
    await act(async () => { oldResult({ text: 'old synthetic final', final: true }); flushed.resolve(); });
    expect(note()).toHaveValue('SYNTHETIC next date'); expect(status()).toHaveTextContent('Stopped'); expect(unload()).toBe(false);
    expect(recognizer.flush).toHaveBeenCalledTimes(phase === 'Processing' ? 1 : 0);
    expect(tracks[0].stop).toHaveBeenCalledTimes(1); expect(contexts[0].close).toHaveBeenCalledTimes(1);
  });
  it('closes a late permission grant after accepted date navigation without ever loading the adapter', async () => {
    const permission = deferred<any>(); media.mockReturnValueOnce(permission.promise);
    await mount(); start(); vi.mocked(window.confirm).mockReturnValue(true);
    vi.mocked(apiClient.getTodayNote).mockResolvedValueOnce(loaded('SYNTHETIC new date') as any);
    fireEvent.change(date(), { target: { value: '2025-01-02' } });
    const stopTrack = vi.fn(); await act(async () => permission.resolve({ getTracks: () => [{ stop: stopTrack, onended: null }] }));
    expect(stopTrack).toHaveBeenCalledTimes(1); expect(mocks.create).not.toHaveBeenCalled();
    expect(note()).toHaveValue('SYNTHETIC new date');
  });
  it('rejects stale patient results after layout invalidation and keeps a newly edited patient draft', async () => {
    const view = await mount(); await listening(); const oldResult = result;
    vi.mocked(apiClient.getTodayNote).mockResolvedValueOnce(loaded('SYNTHETIC patient B', 2) as any);
    view.rerender(<NoteEditor patientId="SYN-B" />);
    await waitFor(() => expect(note()).toHaveValue('SYNTHETIC patient B'));
    edit('SYNTHETIC B edited'); act(() => oldResult({ text: 'WRONG PATIENT', final: true }));
    expect(note()).toHaveValue('SYNTHETIC B edited'); expect(recognizer.flush).not.toHaveBeenCalled(); expect(tracks[0].stop).toHaveBeenCalledTimes(1);
  });
  it('rejects asynchronous text after an account switch even before the host rerenders', async () => {
    await mount(); await listening(); const oldResult = result;
    await act(async () => { mocks.session++; await Promise.resolve(); oldResult({ text: 'WRONG ACCOUNT', final: true }); });
    expect(note()).toHaveValue('SYNTHETIC original'); expect(status()).toHaveTextContent('Stopped');
    expect(tracks[0].stop).toHaveBeenCalledTimes(1); expect(recognizer.flush).not.toHaveBeenCalled();
  });
  it('requires a newly verified load before dictation can restart after an account-generation change', async () => {
    const view = await mount(); await listening(); const late = result;
    const pending = deferred<any>(); vi.mocked(apiClient.getTodayNote).mockReturnValueOnce(pending.promise);
    mocks.session++;
    view.rerender(<NoteEditor patientId="SYN-A" />);
    expect(startButton()).toBeDisabled(); expect(note()).toHaveValue('');
    act(() => late({ text: 'WRONG ACCOUNT', final: true }));
    expect(note()).toHaveValue(''); expect(tracks[0].stop).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(loaded('SYNTHETIC new account verified', 3)));
    expect(startButton()).toBeEnabled(); expect(note()).toHaveValue('SYNTHETIC new account verified');
    expect(apiClient.saveNote).not.toHaveBeenCalled();
  });
  it('cleans up on automatic session expiry and unmount without saving or flushing', async () => {
    const view = await mount(); await listening(); const oldResult = result;
    act(() => window.dispatchEvent(new Event('session-expired')));
    view.unmount(); act(() => oldResult({ text: 'WRONG SESSION', final: true }));
    expect(tracks[0].stop).toHaveBeenCalledTimes(1); expect(recognizer.dispose).toHaveBeenCalledTimes(1);
    expect(apiClient.saveNote).not.toHaveBeenCalled(); expect(recognizer.flush).not.toHaveBeenCalled(); expect(unload()).toBe(false);
  });
  it('preserves a dictated draft on a real 409-shaped conflict and requires explicit reconciliation before restarting', async () => {
    vi.mocked(apiClient.saveNote).mockRejectedValueOnce({ response: { status: 409, data: { error: 'Synthetic conflict' } } });
    await mount(); await listening(); act(() => result({ text: 'dictated synthetic segment', final: true }));
    await stop(); await waitFor(() => expect(save()).toBeEnabled()); fireEvent.click(save());
    await screen.findByRole('region', { name: 'Note conflict reconciliation' });
    expect(note()).toHaveValue('SYNTHETIC original dictated synthetic segment'); expect(startButton()).toBeDisabled();
    vi.mocked(apiClient.getTodayNote).mockResolvedValueOnce(loaded('SYNTHETIC server', 9) as any);
    fireEvent.click(screen.getByRole('button', { name: 'Load server version for comparison' }));
    await screen.findByLabelText('Server note for comparison'); expect(startButton()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Use reviewed draft with server revision' }));
    expect(startButton()).toBeEnabled(); fireEvent.click(save()); await screen.findByText('Note saved successfully!');
    expect(apiClient.saveNote).toHaveBeenLastCalledWith('SYN-A', 'SYNTHETIC original dictated synthetic segment', expect.any(String), ['SYN-BASE'], 9);
  });
  it('prevents dictation during pending AI formatting and AI review, without weakening review actions', async () => {
    const pending = deferred<any>(); vi.mocked(apiClient.formatNote).mockReturnValueOnce(pending.promise);
    await mount(); fireEvent.click(format()); expect(startButton()).toBeDisabled();
    await act(async () => pending.resolve({ data: { text: 'SYNTHETIC AI proposal' } }));
    expect(startButton()).toBeDisabled(); expect(note()).toHaveValue('SYNTHETIC original');
    fireEvent.click(screen.getByRole('button', { name: 'Discard AI draft' })); expect(startButton()).toBeEnabled();
    expect(media).not.toHaveBeenCalled(); expect(apiClient.saveNote).not.toHaveBeenCalled();
  });
  it('writes no audio, previews, or transcript to persistence or network and never auto-saves', async () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem'); const indexed = vi.fn(); const fetch = vi.fn();
    vi.stubGlobal('indexedDB', { open: indexed }); vi.stubGlobal('fetch', fetch);
    await mount(); await listening(); act(() => { result({ text: 'SYNTHETIC preview', final: false }); result({ text: 'SYNTHETIC final', final: true }); });
    await stop(); await waitFor(() => expect(status()).toHaveTextContent('Stopped'));
    expect(storage).not.toHaveBeenCalled(); expect(indexed).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    expect(apiClient.saveNote).not.toHaveBeenCalled(); expect(apiClient.formatNote).not.toHaveBeenCalled(); expect(apiClient.createTemplate).not.toHaveBeenCalled();
    expect(note()).toHaveValue('SYNTHETIC original SYNTHETIC final'); expect(unload()).toBe(true);
  });
});
