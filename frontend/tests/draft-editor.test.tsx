import React from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import NoteEditor from '../src/components/NoteEditor';
import { apiClient } from '../src/utils/apiClient';

vi.mock('../src/utils/apiClient', () => ({ apiClient: {
  getTodayNote: vi.fn(), getTemplates: vi.fn(), saveNote: vi.fn(), formatNote: vi.fn(), createTemplate: vi.fn(),
} }));

const original = 'SYNTHETIC original note';
const local = 'SYNTHETIC local draft';
const proposal = 'SYNTHETIC AI proposal';
const server = 'SYNTHETIC server note';
const version = (text = original, revision = 7, codes = ['SYN-BASE']) => ({
  note_text: text, revision, medical_codes: codes, note_date: '2026-09-20', updated_at: '2026-09-20T10:00:00Z',
});
const loaded = (text = original, revision = 7, codes = ['SYN-BASE']) => ({ data: { exists: true, note: version(text, revision, codes) } });
const deferred = () => {
  let resolve!: (value: any) => void;
  let reject!: (reason: any) => void;
  const promise = new Promise<any>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const note = () => screen.getByLabelText('Clinical note');
const save = () => screen.getByRole('button', { name: 'Save Note', exact: true });
const format = () => screen.getByRole('button', { name: /Format with AI/ });
const edit = (text = local) => fireEvent.change(note(), { target: { value: text } });
const unload = () => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};
async function mount() {
  const view = render(<NoteEditor patientId="SYN-A" />);
  await waitFor(() => expect(note()).toHaveValue(original));
  return view;
}
async function causeConflict() {
  vi.mocked(apiClient.saveNote).mockRejectedValueOnce({ response: { status: 409, data: { error: 'Synthetic conflict' } } });
  await mount(); edit(); fireEvent.click(save());
  await screen.findByRole('region', { name: 'Note conflict reconciliation' });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  vi.mocked(apiClient.getTodayNote).mockResolvedValue(loaded() as any);
  vi.mocked(apiClient.getTemplates).mockResolvedValue({ data: { templates: [{
    id: 1, template_name: 'Synthetic template', template_category: 'Synthetic', template_text: 'SYNTHETIC template text', creator_id: 1,
  }] } } as any);
  vi.mocked(apiClient.formatNote).mockResolvedValue({ data: { text: proposal } } as any);
  vi.mocked(apiClient.saveNote).mockImplementation(async (_patient, text, _date, codes, revision) => (
    { data: { note: version(text, (revision ?? 0) + 1, codes) } } as any
  ));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('in-memory unsaved note protection', () => {
  it('preserves the new-note E2E selectors and submits revision zero only for an absent note', async () => {
    vi.mocked(apiClient.getTodayNote).mockResolvedValueOnce({ data: { exists: false, note: null } } as any);
    render(<NoteEditor patientId="SYN-NEW" />);
    await waitFor(() => expect(note()).toBeEnabled());
    edit(); fireEvent.click(save()); await screen.findByText('Note saved successfully!');
    expect(apiClient.saveNote).toHaveBeenCalledWith('SYN-NEW', local, expect.any(String), [], 0);
    expect(unload()).toBe(false);
  });

  it('does not interpret an existing note with a missing revision as a new note', async () => {
    vi.mocked(apiClient.getTodayNote).mockResolvedValueOnce({ data: { exists: true, note: { note_text: original } } } as any);
    render(<NoteEditor patientId="SYN-A" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load note');
    expect(note()).toBeDisabled(); expect(save()).toBeDisabled();
    expect(screen.getByLabelText('Medical code')).toBeDisabled();
    expect(apiClient.saveNote).not.toHaveBeenCalled();
  });

  it('cancels date changes without changing date, draft, codes, identity, or loaded revision', async () => {
    await mount();
    const date = (screen.getByLabelText('Note date') as HTMLInputElement).value;
    edit();
    fireEvent.change(screen.getByLabelText('Note date'), { target: { value: '2025-01-02' } });
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(note()).toHaveValue(local);
    expect(screen.getByLabelText('Note date')).toHaveValue(date);
    expect(apiClient.getTodayNote).toHaveBeenCalledTimes(1);
    fireEvent.click(save());
    await screen.findByText('Note saved successfully!');
    expect(apiClient.saveNote).toHaveBeenCalledWith('SYN-A', local, date, ['SYN-BASE'], 7);
  });

  it('switches date after confirmation and clears pending input and draft state', async () => {
    await mount(); edit();
    fireEvent.change(screen.getByLabelText('Medical code'), { target: { value: 'UNADDED' } });
    vi.mocked(window.confirm).mockReturnValue(true);
    vi.mocked(apiClient.getTodayNote).mockResolvedValueOnce({ data: { exists: false, note: null } } as any);
    fireEvent.change(screen.getByLabelText('Note date'), { target: { value: '2025-01-02' } });
    await waitFor(() => expect(note()).toBeEnabled());
    expect(note()).toHaveValue('');
    expect(screen.getByLabelText('Medical code')).toHaveValue('');
    expect(apiClient.getTodayNote).toHaveBeenLastCalledWith('SYN-A', '2025-01-02');
    expect(unload()).toBe(false);
  });

  it('does not warn for clean notes, reverted changes, or a successful save; removes its unload listener', async () => {
    const view = await mount();
    expect(unload()).toBe(false);
    edit(); expect(unload()).toBe(true);
    edit(original); expect(unload()).toBe(false);
    edit(); fireEvent.click(save());
    await screen.findByText('Note saved successfully!');
    expect(unload()).toBe(false);
    fireEvent.change(screen.getByLabelText('Note date'), { target: { value: '2025-01-02' } });
    await waitFor(() => expect(note()).toBeEnabled());
    expect(window.confirm).not.toHaveBeenCalled();
    edit(); view.unmount(); expect(unload()).toBe(false);
  });

  it.each(['pending code', 'added code', 'removed code', 'template'])('guards a %s even without text changes', async kind => {
    await mount();
    if (kind === 'removed code') fireEvent.click(screen.getByRole('button', { name: 'Remove medical code SYN-BASE' }));
    else if (kind === 'template') {
      fireEvent.click(screen.getByRole('button', { name: '+ Create Template' }));
      fireEvent.change(screen.getByLabelText('Template text'), { target: { value: 'SYNTHETIC template draft' } });
    } else {
      fireEvent.change(screen.getByLabelText('Medical code'), { target: { value: 'SYN-NEW' } });
      if (kind === 'added code') fireEvent.click(screen.getByRole('button', { name: 'Add Code' }));
    }
    expect(unload()).toBe(true);
    fireEvent.change(screen.getByLabelText('Note date'), { target: { value: '2025-01-02' } });
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(apiClient.getTodayNote).toHaveBeenCalledTimes(1);
  });

  it('requires confirmation before a template replaces a dirty note', async () => {
    await mount(); edit();
    fireEvent.click(screen.getByRole('button', { name: 'Synthetic template', exact: true }));
    expect(note()).toHaveValue(local);
    vi.mocked(window.confirm).mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Synthetic template', exact: true }));
    expect(note()).toHaveValue('SYNTHETIC template text');
    expect(apiClient.saveNote).not.toHaveBeenCalled();
  });

  it('does not silently omit a pending medical code from a save', async () => {
    await mount(); edit();
    fireEvent.change(screen.getByLabelText('Medical code'), { target: { value: 'SYN-NEW' } });
    fireEvent.click(save());
    expect(await screen.findByRole('alert')).toHaveTextContent('Add or clear the pending medical code');
    expect(apiClient.saveNote).not.toHaveBeenCalled();
    expect(note()).toHaveValue(local);
  });

  it('locks duplicate saves and medical-code editing until the save completes', async () => {
    const pending = deferred();
    vi.mocked(apiClient.saveNote).mockReturnValue(pending.promise);
    await mount(); edit();
    const button = save();
    act(() => { button.click(); button.click(); });
    expect(apiClient.saveNote).toHaveBeenCalledTimes(1);
    expect(note()).toBeDisabled();
    expect(screen.getByLabelText('Medical code')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove medical code SYN-BASE' })).toBeDisabled();
    expect(screen.getByLabelText('Note date')).toBeDisabled();
    await act(async () => pending.resolve({ data: { note: version(local, 8) } }));
    expect(note()).toBeEnabled(); expect(unload()).toBe(false);
  });

  it('preserves the draft and displays a client-provided save failure message', async () => {
    vi.mocked(apiClient.saveNote).mockRejectedValueOnce(new Error('Synthetic client: request timed out'));
    await mount(); edit(); fireEvent.click(save());
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic client: request timed out');
    expect(note()).toHaveValue(local); expect(unload()).toBe(true); expect(save()).toBeEnabled();
  });

  it.each(['save first', 'format first'])('does not start competing save/format requests in the same render: %s', async order => {
    const pending = deferred();
    vi.mocked(apiClient.saveNote).mockReturnValueOnce(pending.promise);
    vi.mocked(apiClient.formatNote).mockReturnValueOnce(pending.promise);
    await mount(); edit();
    const saveButton = save(); const formatButton = format();
    act(() => {
      if (order === 'save first') { saveButton.click(); formatButton.click(); }
      else { formatButton.click(); saveButton.click(); }
    });
    expect(apiClient.saveNote).toHaveBeenCalledTimes(order === 'save first' ? 1 : 0);
    expect(apiClient.formatNote).toHaveBeenCalledTimes(order === 'format first' ? 1 : 0);
    await act(async () => pending.reject(new Error('Synthetic request ended')));
    expect(note()).toHaveValue(local);
  });

  it('fails closed when a save response has no verifiable revision', async () => {
    vi.mocked(apiClient.saveNote).mockResolvedValueOnce({ data: { note: { note_text: 'UNVERIFIED' } } } as any);
    await mount(); edit(); fireEvent.click(save());
    expect(await screen.findByRole('alert')).toHaveTextContent('Save response could not be verified');
    expect(note()).toHaveValue(local); expect(save()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Load server version for comparison' })).toBeEnabled();
  });

  it('does not write drafts, codes, or AI proposals to browser persistence or downloads', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const open = vi.fn();
    vi.stubGlobal('indexedDB', { open });
    const download = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    await mount(); edit(); fireEvent.click(format());
    await screen.findByLabelText('AI proposed note');
    fireEvent.click(screen.getByRole('button', { name: 'Accept AI draft' }));
    fireEvent.click(save()); await screen.findByText('Note saved successfully!');
    expect(setItem).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled(); expect(download).not.toHaveBeenCalled();
  });
});

describe('explicit AI review (synthetic responses only)', () => {
  it('shows original and proposal separately, accepts only explicitly, and never autosaves', async () => {
    await mount(); edit(); fireEvent.click(format());
    expect(await screen.findByLabelText('AI proposed note')).toHaveValue(proposal);
    expect(screen.getByLabelText('Original note before AI formatting')).toHaveValue(local);
    expect(note()).toHaveValue(local); expect(save()).toBeDisabled();
    expect(apiClient.saveNote).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Accept AI draft' }));
    expect(note()).toHaveValue(proposal); expect(apiClient.saveNote).not.toHaveBeenCalled();
    fireEvent.click(save()); await screen.findByText('Note saved successfully!');
    expect(apiClient.saveNote).toHaveBeenCalledWith('SYN-A', proposal, expect.any(String), ['SYN-BASE'], 7);
  });

  it('discards the proposal without changing the original or its revision', async () => {
    await mount(); fireEvent.click(format());
    await screen.findByLabelText('AI proposed note'); expect(unload()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Discard AI draft' }));
    expect(note()).toHaveValue(original); expect(unload()).toBe(false);
    expect(apiClient.saveNote).not.toHaveBeenCalled();
  });

  it('will not accept a proposal over newer edits', async () => {
    await mount(); fireEvent.click(format()); await screen.findByLabelText('AI proposed note');
    edit('SYNTHETIC newer edit');
    expect(screen.getByRole('button', { name: 'Accept AI draft' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Discard AI draft' }));
    expect(note()).toHaveValue('SYNTHETIC newer edit');
  });

  it.each([
    {}, { text: '' }, { text: '   ' }, { text: 123 },
    { text: proposal, truncated: true }, { text: proposal, incomplete: true },
    { text: proposal, finish_reason: 'length' }, { text: proposal, finishReason: 'content_filter' },
    { text: proposal, error: 'Synthetic failure' },
  ])('rejects empty/malformed/incomplete formatting result %#', async data => {
    vi.mocked(apiClient.formatNote).mockResolvedValueOnce({ data } as any);
    await mount(); fireEvent.click(format());
    expect(await screen.findByRole('alert')).toHaveTextContent('empty, incomplete, or truncated');
    expect(note()).toHaveValue(original); expect(screen.queryByLabelText('AI proposed note')).not.toBeInTheDocument();
    expect(apiClient.saveNote).not.toHaveBeenCalled(); expect(format()).toBeEnabled();
  });

  it.each([
    { response: { status: 503, data: { error: 'AI formatting disabled' } } },
    { response: { status: 502, data: { error: 'Formatting provider returned an incomplete result' } } },
    new Error('Synthetic client: formatting timed out'),
  ])('retains the original on a client or disabled-backend error %#', async failure => {
    vi.mocked(apiClient.formatNote).mockRejectedValueOnce(failure);
    await mount(); fireEvent.click(format());
    expect(await screen.findByRole('alert')).toHaveTextContent('response' in failure ? failure.response.data.error : failure.message);
    expect(note()).toHaveValue(original); expect(format()).toBeEnabled();
  });

  it('blocks duplicate format submissions and keeps the original unchanged while pending', async () => {
    const pending = deferred(); vi.mocked(apiClient.formatNote).mockReturnValueOnce(pending.promise);
    await mount(); const button = format();
    act(() => { button.click(); button.click(); });
    expect(apiClient.formatNote).toHaveBeenCalledTimes(1); expect(note()).toHaveValue(original);
    expect(unload()).toBe(true); expect(save()).toBeDisabled();
    await act(async () => pending.resolve({ data: { text: proposal } }));
    expect(note()).toHaveValue(original);
  });

  it.each(['success', 'failure'])('ignores late AI %s after a confirmed date change without unlocking a newer request', async outcome => {
    const old = deferred(); const current = deferred();
    vi.mocked(apiClient.formatNote).mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    await mount(); fireEvent.click(format());
    vi.mocked(window.confirm).mockReturnValue(true);
    vi.mocked(apiClient.getTodayNote).mockResolvedValueOnce(loaded('SYNTHETIC new date', 2) as any);
    fireEvent.change(screen.getByLabelText('Note date'), { target: { value: '2025-01-02' } });
    await waitFor(() => expect(note()).toHaveValue('SYNTHETIC new date'));
    fireEvent.click(format());
    await act(async () => {
      if (outcome === 'success') old.resolve({ data: { text: 'WRONG DATE' } });
      else old.reject(new Error('WRONG DATE error'));
    });
    expect(screen.getByRole('button', { name: 'Formatting...' })).toBeDisabled();
    expect(screen.queryByLabelText('AI proposed note')).not.toBeInTheDocument();
    expect(screen.queryByText('WRONG DATE error')).not.toBeInTheDocument();
    await act(async () => current.resolve({ data: { text: proposal } }));
    expect(screen.getByLabelText('AI proposed note')).toHaveValue(proposal);
    expect(note()).toHaveValue('SYNTHETIC new date');
  });
});

describe('explicit conflict reconciliation', () => {
  it('does not duplicate server comparison requests before controls rerender', async () => {
    await causeConflict();
    const pending = deferred();
    vi.mocked(apiClient.getTodayNote).mockReturnValueOnce(pending.promise);
    const button = screen.getByRole('button', { name: 'Load server version for comparison' });
    act(() => { button.click(); button.click(); });
    expect(apiClient.getTodayNote).toHaveBeenCalledTimes(2);
    await act(async () => pending.resolve(loaded(server, 9)));
    expect(screen.getByLabelText('Server note for comparison')).toHaveValue(server);
    expect(note()).toHaveValue(local);
  });

  it('keeps local text/codes on 409, compares separately, then saves a manually merged draft with the chosen server revision', async () => {
    await causeConflict();
    expect(note()).toHaveValue(local); expect(save()).toBeDisabled();
    expect(apiClient.getTodayNote).toHaveBeenCalledTimes(1);
    vi.mocked(apiClient.getTodayNote).mockResolvedValueOnce(loaded(server, 9, ['SYN-SERVER']) as any);
    fireEvent.click(screen.getByRole('button', { name: 'Load server version for comparison' }));
    expect(await screen.findByLabelText('Server note for comparison')).toHaveValue(server);
    expect(note()).toHaveValue(local); expect(screen.getByRole('button', { name: 'Remove medical code SYN-BASE' })).toBeEnabled();
    expect(save()).toBeDisabled(); expect(apiClient.saveNote).toHaveBeenCalledTimes(1);
    edit('SYNTHETIC merged note');
    fireEvent.click(screen.getByRole('button', { name: 'Use reviewed draft with server revision' }));
    expect(apiClient.saveNote).toHaveBeenCalledTimes(1);
    fireEvent.click(save()); await screen.findByText('Note saved successfully!');
    expect(apiClient.saveNote).toHaveBeenLastCalledWith('SYN-A', 'SYNTHETIC merged note', expect.any(String), ['SYN-BASE'], 9);
  });

  it('requires an explicit confirmed choice to replace the local version with the server version', async () => {
    await causeConflict();
    vi.mocked(apiClient.getTodayNote).mockResolvedValueOnce(loaded(server, 9, ['SYN-SERVER']) as any);
    fireEvent.click(screen.getByRole('button', { name: 'Load server version for comparison' }));
    await screen.findByLabelText('Server note for comparison');
    fireEvent.click(screen.getByRole('button', { name: 'Use server version', exact: true }));
    expect(note()).toHaveValue(local); expect(save()).toBeDisabled();
    vi.mocked(window.confirm).mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Use server version', exact: true }));
    expect(note()).toHaveValue(server);
    expect(screen.getByRole('button', { name: 'Remove medical code SYN-SERVER' })).toBeEnabled();
    expect(unload()).toBe(false); expect(apiClient.saveNote).toHaveBeenCalledTimes(1);
  });

  it('keeps the draft on comparison failure and allows a safe retry', async () => {
    await causeConflict();
    vi.mocked(apiClient.getTodayNote).mockRejectedValueOnce(new Error('Synthetic comparison failure'));
    fireEvent.click(screen.getByRole('button', { name: 'Load server version for comparison' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic comparison failure');
    expect(note()).toHaveValue(local); expect(save()).toBeDisabled();
    vi.mocked(apiClient.getTodayNote).mockResolvedValueOnce(loaded(server, 8) as any);
    fireEvent.click(screen.getByRole('button', { name: 'Load server version for comparison' }));
    await screen.findByLabelText('Server note for comparison');
  });

  it('re-enters reconciliation if the server changes again after the user chooses a revision', async () => {
    await causeConflict();
    vi.mocked(apiClient.getTodayNote).mockResolvedValueOnce(loaded(server, 9) as any);
    fireEvent.click(screen.getByRole('button', { name: 'Load server version for comparison' }));
    await screen.findByLabelText('Server note for comparison');
    fireEvent.click(screen.getByRole('button', { name: 'Use reviewed draft with server revision' }));
    vi.mocked(apiClient.saveNote).mockRejectedValueOnce({ response: { status: 409, data: { error: 'Synthetic second conflict' } } });
    fireEvent.click(save());
    await screen.findByRole('region', { name: 'Note conflict reconciliation' });
    expect(note()).toHaveValue(local); expect(save()).toBeDisabled();
    expect(screen.queryByLabelText('Server note for comparison')).not.toBeInTheDocument();
  });

  it('ignores a comparison response after a confirmed date change', async () => {
    await causeConflict();
    const pending = deferred();
    vi.mocked(apiClient.getTodayNote).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(loaded('SYNTHETIC other date', 2) as any);
    fireEvent.click(screen.getByRole('button', { name: 'Load server version for comparison' }));
    vi.mocked(window.confirm).mockReturnValue(true);
    fireEvent.change(screen.getByLabelText('Note date'), { target: { value: '2025-01-02' } });
    await waitFor(() => expect(note()).toHaveValue('SYNTHETIC other date'));
    await act(async () => pending.resolve(loaded(server, 9)));
    expect(screen.queryByLabelText('Server note for comparison')).not.toBeInTheDocument();
    expect(note()).toHaveValue('SYNTHETIC other date'); expect(save()).toBeEnabled();
  });
});

describe('patient-generation isolation', () => {
  it.each(['save success', 'save failure', 'AI success', 'AI failure'])('ignores stale %s after a host-controlled patient switch', async kind => {
    const old = deferred(); const current = deferred();
    const isSave = kind.startsWith('save');
    if (isSave) vi.mocked(apiClient.saveNote).mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    else vi.mocked(apiClient.formatNote).mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const view = await mount(); edit(); fireEvent.click(isSave ? save() : format());
    vi.mocked(apiClient.getTodayNote).mockResolvedValueOnce(loaded('SYNTHETIC patient B', 2) as any);
    view.rerender(<NoteEditor patientId="SYN-B" />);
    await waitFor(() => expect(note()).toHaveValue('SYNTHETIC patient B'));
    fireEvent.click(isSave ? save() : format());
    await act(async () => {
      if (kind.endsWith('success')) old.resolve({ data: isSave ? { note: version('WRONG PATIENT', 8) } : { text: 'WRONG PATIENT' } });
      else old.reject(new Error('WRONG PATIENT error'));
    });
    expect(note()).toHaveValue('SYNTHETIC patient B');
    expect(screen.getByRole('button', { name: isSave ? 'Saving...' : 'Formatting...' })).toBeDisabled();
    expect(screen.queryByText('WRONG PATIENT error')).not.toBeInTheDocument();
    await act(async () => current.resolve({ data: isSave ? { note: version('SYNTHETIC patient B', 3) } : { text: proposal } }));
    expect(note()).toHaveValue('SYNTHETIC patient B');
  });
});