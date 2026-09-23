import React, { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AppPage } from '../src/pages/AppPage';
import { apiClient } from '../src/utils/apiClient';

const { logout } = vi.hoisted(() => ({ logout: vi.fn() }));
vi.mock('../src/hooks/useAuth', () => ({ useAuth: () => ({ logout, user: { email: 'synthetic@example.invalid' } }) }));
vi.mock('../src/utils/apiClient', () => ({ apiClient: {
  searchPatient: vi.fn(), updatePatient: vi.fn(), updatePatientStatus: vi.fn(), createPatient: vi.fn(),
  scanPatientSticker: vi.fn(), getTodayNote: vi.fn(), getTemplates: vi.fn(), saveNote: vi.fn(), formatNote: vi.fn(),
} }));
// PatientForm, Header, and NoteEditor are REAL. Only unrelated panels are isolated.
vi.mock('../src/components/PatientHistory', () => ({ default: () => null }));
vi.mock('../src/components/VitalsCard', () => ({ default: () => null }));
vi.mock('../src/components/AppointmentsCard', () => ({ default: () => null }));
vi.mock('../src/components/VisitsCard', () => ({ default: () => null }));
vi.mock('../src/components/TemplatesAnalyticsPanel', () => ({ default: () => null }));
vi.mock('../src/components/ScheduledVisitsPanel', () => ({ default: () => null }));
vi.mock('../src/components/DoctorDashboard', () => ({ default: () => <h2>Synthetic dashboard</h2> }));
vi.mock('../src/components/DoctorProfile', () => ({ default: () => <h2>Synthetic profile</h2> }));
vi.mock('../src/pages/PatientsListPage', () => ({ PatientsListPage: ({ onEditPatient }: any) => (
  <>
    <button onClick={() => onEditPatient(patientA)}>Select synthetic A</button>
    <button onClick={() => onEditPatient(patientB)}>Select synthetic B</button>
  </>
) }));

const patientA = { id: 1, patient_id: 'SYN-A', first_name: 'Synthetic A', last_name: 'Only', is_active: true };
const patientB = { id: 2, patient_id: 'SYN-B', first_name: 'Synthetic B', last_name: 'Only', is_active: true };
const updatedA = { ...patientA, first_name: 'Synthetic saved A' };
const staleError = { response: { data: { error: 'SYNTHETIC stale failure' } } };
const note = () => screen.getByLabelText('Clinical note');
const draft = () => fireEvent.change(note(), { target: { value: 'SYNTHETIC protected draft' } });
function deferred<T = any>() {
  let resolve!: (value: T) => void;
  let reject!: (error: any) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function finish(request: ReturnType<typeof deferred>, outcome: string, value: any) {
  await act(async () => { if (outcome === 'resolve') request.resolve(value); else request.reject(staleError); });
}
function search(identifier = 'SYN-A') {
  fireEvent.change(screen.getByPlaceholderText(/Enter Patient ID/), { target: { value: identifier } });
  fireEvent.click(screen.getByRole('button', { name: 'Search', exact: true }));
}
async function readyNote(identifier = 'SYN-A') {
  await waitFor(() => expect(note()).toHaveValue(`SYNTHETIC loaded ${identifier}`));
}
async function openPatient(strict = false) {
  const view = render(strict ? <StrictMode><AppPage /></StrictMode> : <AppPage />);
  search(); await readyNote(); return view;
}
async function selectPatient(identifier: 'A' | 'B' = 'B') {
  fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'View All Patients' }));
  fireEvent.click(screen.getByRole('button', { name: `Select synthetic ${identifier}` }));
  await readyNote(`SYN-${identifier}`);
}
function startWrite(kind: string) {
  const request = deferred();
  if (kind === 'update') {
    vi.mocked(apiClient.updatePatient).mockReturnValueOnce(request.promise);
    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Synthetic submitted A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
    expect(apiClient.updatePatient).toHaveBeenCalledWith(1, expect.objectContaining({ firstName: 'Synthetic submitted A' }));
  } else {
    vi.mocked(apiClient.updatePatientStatus).mockReturnValueOnce(request.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate Patient' }));
    expect(apiClient.updatePatientStatus).toHaveBeenCalledWith(1, false);
  }
  return request;
}
const resultA = { data: { patient: updatedA } };

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  vi.mocked(apiClient.searchPatient).mockResolvedValue({ data: { exists: true, patient: patientA } } as any);
  vi.mocked(apiClient.getTodayNote).mockImplementation(async id => ({ data: { exists: true, note: {
    note_text: `SYNTHETIC loaded ${id}`, revision: 1, medical_codes: [],
  } } } as any));
  vi.mocked(apiClient.getTemplates).mockResolvedValue({ data: { templates: [] } } as any);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('real PatientForm async completion boundaries', () => {
  it.each([
    ['update', 'resolve', 'B'], ['update', 'reject', 'B'], ['status', 'resolve', 'B'], ['status', 'reject', 'B'],
    ['update', 'resolve', 'A'], ['update', 'reject', 'A'], ['status', 'resolve', 'A'], ['status', 'reject', 'A'],
  ] as const)('ignores stale %s %s after navigating to %s (including same-identity revisit)', async (kind, outcome, destination) => {
    await openPatient(); const request = startWrite(kind);
    await selectPatient(destination); draft();
    const date = (screen.getByLabelText('Note date') as HTMLInputElement).value;
    await finish(request, outcome, resultA);
    expect(screen.getByLabelText('Patient ID')).toHaveValue(`SYN-${destination}`);
    expect(screen.getByLabelText('First Name')).toHaveValue(`Synthetic ${destination}`);
    expect(screen.getByRole('button', { name: 'Deactivate Patient' })).toBeEnabled();
    expect(note()).toHaveValue('SYNTHETIC protected draft');
    expect(screen.getByLabelText('Note date')).toHaveValue(date);
    expect(window.confirm).not.toHaveBeenCalled();
    expect(screen.queryByText('SYNTHETIC stale failure')).not.toBeInTheDocument();
    // A stale parent error must not be cached and shown on a subsequent search page.
    vi.mocked(window.confirm).mockReturnValue(true);
    fireEvent.click(screen.getByRole('heading', { name: /Medical Notes/ }));
    expect(screen.queryByText('SYNTHETIC stale failure')).not.toBeInTheDocument();
  });

  it.each(['update', 'status'])('does not reverse explicitly accepted dirty navigation on late %s', async kind => {
    await openPatient(); const request = startWrite(kind); draft();
    vi.mocked(window.confirm).mockReturnValue(true);
    await selectPatient(); draft();
    expect(window.confirm).toHaveBeenCalledTimes(1);
    await finish(request, 'resolve', resultA);
    expect(screen.getByLabelText('Patient ID')).toHaveValue('SYN-B');
    expect(screen.getByRole('button', { name: 'Deactivate Patient' })).toBeEnabled();
    expect(note()).toHaveValue('SYNTHETIC protected draft');
    expect(window.confirm).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['update', 'Dashboard'], ['update', 'Cancel'], ['update', 'Logout'], ['update', 'View All Patients'],
    ['status', 'Dashboard'], ['status', 'Cancel'], ['status', 'Logout'], ['status', 'View All Patients'],
  ])('keeps rightful %s live after rejected %s navigation', async (kind, destination) => {
    await openPatient(); const request = startWrite(kind); draft();
    fireEvent.click(screen.getByRole('button', { name: destination, exact: true }));
    expect(window.confirm).toHaveBeenCalledTimes(1); expect(logout).not.toHaveBeenCalled();
    await finish(request, 'resolve', resultA);
    expect(screen.getByLabelText('Patient ID')).toHaveValue('SYN-A');
    if (kind === 'update') expect(screen.getByLabelText('First Name')).toHaveValue('Synthetic saved A');
    else expect(screen.getByRole('button', { name: 'Activate Patient' })).toBeEnabled();
    expect(note()).toHaveValue('SYNTHETIC protected draft');
    expect(apiClient.getTodayNote).toHaveBeenCalledTimes(1);
    expect(window.confirm).toHaveBeenCalledTimes(1);
  });

  it.each(['update', 'status'])('still displays a rightful %s failure after rejected navigation', async kind => {
    await openPatient(); const request = startWrite(kind); draft();
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
    await finish(request, 'reject', resultA);
    expect(screen.getByText('SYNTHETIC stale failure')).toBeVisible();
    expect(note()).toHaveValue('SYNTHETIC protected draft');
    expect(screen.getByRole('button', { name: 'Deactivate Patient' })).toBeEnabled();
  });

  it.each([false, true])('applies same-patient demographic saves without resetting notes (StrictMode=%s)', async strict => {
    await openPatient(strict); const request = startWrite('update'); draft();
    const loads = vi.mocked(apiClient.getTodayNote).mock.calls.length;
    await finish(request, 'resolve', resultA);
    expect(screen.getByLabelText('First Name')).toHaveValue('Synthetic saved A');
    expect(note()).toHaveValue('SYNTHETIC protected draft');
    expect(apiClient.getTodayNote).toHaveBeenCalledTimes(loads);
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it.each(['resolve', 'reject'])('ignores create %s after opening patient B and typing a note', async outcome => {
    vi.mocked(apiClient.searchPatient).mockResolvedValueOnce({ data: { exists: false } } as any);
    const request = deferred(); vi.mocked(apiClient.createPatient).mockReturnValueOnce(request.promise);
    render(<AppPage />); search();
    await screen.findByRole('heading', { name: 'Create Patient' });
    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Synthetic A' } });
    fireEvent.change(screen.getByLabelText('Last Name'), { target: { value: 'Only' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
    expect(apiClient.createPatient).toHaveBeenCalledTimes(1);
    await selectPatient(); draft();
    await finish(request, outcome, resultA);
    expect(screen.getByLabelText('Patient ID')).toHaveValue('SYN-B');
    expect(note()).toHaveValue('SYNTHETIC protected draft');
    expect(screen.queryByText('SYNTHETIC stale failure')).not.toBeInTheDocument();
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it.each(['resolve', 'reject'])('isolates create %s from a reopened create form with the same identifier', async outcome => {
    vi.mocked(apiClient.searchPatient).mockResolvedValue({ data: { exists: false } } as any);
    const request = deferred(); vi.mocked(apiClient.createPatient).mockReturnValueOnce(request.promise);
    render(<AppPage />); search(); await screen.findByRole('heading', { name: 'Create Patient' });
    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Synthetic A' } });
    fireEvent.change(screen.getByLabelText('Last Name'), { target: { value: 'Only' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
    search(); await screen.findByRole('heading', { name: 'Create Patient' });
    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Synthetic new entry' } });
    await finish(request, outcome, resultA);
    expect(screen.getByRole('heading', { name: 'Create Patient' })).toBeVisible();
    expect(screen.getByLabelText('First Name')).toHaveValue('Synthetic new entry');
    expect(screen.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
    expect(screen.queryByText('SYNTHETIC stale failure')).not.toBeInTheDocument();
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('opens a successful current create without persisting patient/draft content', async () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    const indexed = vi.fn(); vi.stubGlobal('indexedDB', { open: indexed });
    const download = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    const request = deferred(); vi.mocked(apiClient.createPatient).mockReturnValueOnce(request.promise);
    vi.mocked(apiClient.searchPatient).mockResolvedValueOnce({ data: { exists: false } } as any);
    render(<AppPage />); search(); await screen.findByRole('heading', { name: 'Create Patient' });
    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Synthetic A' } });
    fireEvent.change(screen.getByLabelText('Last Name'), { target: { value: 'Only' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
    await finish(request, 'resolve', resultA); await readyNote(); draft();
    expect(screen.getByLabelText('First Name')).toHaveValue('Synthetic saved A');
    expect(storage).not.toHaveBeenCalled(); expect(indexed).not.toHaveBeenCalled(); expect(download).not.toHaveBeenCalled();
  });
});

describe('search completion scope', () => {
  it.each(['resolve', 'reject'])('does not reverse navigation or unlock a newer search on stale %s', async outcome => {
    const oldRequest = deferred(); const newRequest = deferred();
    vi.mocked(apiClient.searchPatient).mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise);
    render(<AppPage />); search();
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
    fireEvent.click(screen.getByRole('button', { name: /Back to Search/ }));
    search('SYN-B');
    await finish(oldRequest, outcome, { data: { exists: true, patient: patientA } });
    expect(screen.getByRole('button', { name: 'Searching...' })).toBeDisabled();
    expect(screen.queryByText('SYNTHETIC stale failure')).not.toBeInTheDocument();
    await finish(newRequest, 'resolve', { data: { exists: true, patient: patientB } }); await readyNote('SYN-B');
    expect(screen.getByLabelText('Patient ID')).toHaveValue('SYN-B');
  });

  it.each(['resolve', 'reject'])('preserves patient B draft on stale search %s', async outcome => {
    const request = deferred(); vi.mocked(apiClient.searchPatient).mockReturnValueOnce(request.promise);
    render(<AppPage />); search(); await selectPatient(); draft();
    await finish(request, outcome, { data: { exists: true, patient: patientA } });
    expect(screen.getByLabelText('Patient ID')).toHaveValue('SYN-B');
    expect(note()).toHaveValue('SYNTHETIC protected draft');
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('does not invalidate a rightful search for an already-selected page', async () => {
    const request = deferred(); vi.mocked(apiClient.searchPatient).mockReturnValueOnce(request.promise);
    render(<AppPage />); search();
    fireEvent.click(screen.getByRole('heading', { name: /Medical Notes/ }));
    await finish(request, 'resolve', { data: { exists: true, patient: patientA } }); await readyNote();
    expect(screen.getByLabelText('Patient ID')).toHaveValue('SYN-A');
  });
});

function cameraHarness() {
  const stop = vi.fn(); const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  vi.stubGlobal('navigator', Object.create(navigator, { mediaDevices: { value: { getUserMedia } } }));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(), getImageData: () => ({ data: new Uint8ClampedArray(4) }), putImageData: vi.fn(),
  } as any);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,U1lOVEhFVElD');
  const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['SYNTHETIC'])));
  return { stop, stream, getUserMedia, toBlob };
}
async function capture() {
  fireEvent.click(screen.getByRole('button', { name: /Scan Sticker/ }));
  fireEvent.click(await screen.findByRole('button', { name: /Capture/ }));
  await act(async () => {});
}
const scanResult = { data: { exists: true, patient: patientA, text: 'SYNTHETIC OCR', parsed: {
  patientId: 'SYN-A', mrn: 'SYN-A', rawName: 'Synthetic A Only', firstName: 'Synthetic A', lastName: 'Only',
  gender: 'Female', dob: '2000-01-02', confidenceWarnings: [],
} } };

const unmatchedScan = { data: { ...scanResult.data, exists: false, patient: null } };
function expectCleanCreate(identifier: string) {
  expect(screen.getByRole('heading', { name: 'Create Patient' })).toBeVisible();
  expect(screen.getByLabelText('Patient ID')).toHaveValue(identifier);
  for (const label of ['First Name', 'Last Name', 'Date of Birth', 'Phone', 'Email', 'Allergies', 'Medications', 'Medical Conditions']) {
    expect(screen.getByLabelText(label)).toHaveValue('');
  }
  expect(screen.getByRole('combobox')).toHaveValue('');
}
async function saveSyntheticB() {
  vi.mocked(apiClient.createPatient).mockResolvedValueOnce({ data: { patient: patientB } } as any);
  fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Synthetic B' } });
  fireEvent.change(screen.getByLabelText('Last Name'), { target: { value: 'B only' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
  expect(apiClient.createPatient).toHaveBeenCalledExactlyOnceWith('SYN-B', 'Synthetic B', 'B only', expect.objectContaining({
    firstName: 'Synthetic B', lastName: 'B only', gender: '', dob: null,
  }));
  await readyNote('SYN-B');
  expect(screen.getByLabelText('Patient ID')).toHaveValue('SYN-B');
  expect(apiClient.updatePatient).not.toHaveBeenCalled();
}

describe('reviewed scan identity and navigation binding', () => {
  it.each([['matched', scanResult], ['unmatched', unmatchedScan]] as const)(
    'never borrows completed %s scan A fields for a manual missing-B search/create', async (_kind, response) => {
      cameraHarness(); vi.mocked(apiClient.scanPatientSticker).mockResolvedValueOnce(response as any);
      vi.mocked(apiClient.searchPatient).mockResolvedValueOnce({ data: { exists: false } } as any);
      render(<AppPage />); await capture(); await screen.findByText('Sticker OCR Result');
      search('SYN-B');
      await screen.findByRole('heading', { name: 'Create Patient' });
      expectCleanCreate('SYN-B');
      expect(apiClient.searchPatient).toHaveBeenCalledExactlyOnceWith('SYN-B');
      await saveSyntheticB();
      expect(window.confirm).not.toHaveBeenCalled();
    },
  );

  it.each([['matched', scanResult], ['unmatched', unmatchedScan]] as const)(
    'does not implicitly reuse %s scan data even for a same-ID manual search', async (_kind, response) => {
      cameraHarness(); vi.mocked(apiClient.scanPatientSticker).mockResolvedValueOnce(response as any);
      vi.mocked(apiClient.searchPatient).mockResolvedValueOnce({ data: { exists: false } } as any);
      render(<AppPage />); await capture(); await screen.findByText('Sticker OCR Result');
      fireEvent.click(screen.getByRole('button', { name: 'Search', exact: true }));
      await screen.findByRole('heading', { name: 'Create Patient' });
      expectCleanCreate('SYN-A');
    },
  );

  it('unbinds a completed scan immediately on changed search ID, including an A revisit', async () => {
    cameraHarness(); vi.mocked(apiClient.scanPatientSticker).mockResolvedValueOnce(unmatchedScan as any);
    render(<AppPage />); await capture(); await screen.findByText('Sticker OCR Result');
    const input = screen.getByPlaceholderText(/Enter Patient ID/);
    fireEvent.change(input, { target: { value: 'SYN-B' } });
    expect(screen.queryByText('Sticker OCR Result')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create New Patient' })).not.toBeInTheDocument();
    expect(screen.queryByAltText('Captured')).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'SYN-A' } });
    expect(screen.queryByText('Sticker OCR Result')).not.toBeInTheDocument();
  });

  it.each(['resolve', 'reject'])('ignores delayed OCR %s after manual missing-B search and data entry', async outcome => {
    cameraHarness(); const request = deferred(); vi.mocked(apiClient.scanPatientSticker).mockReturnValueOnce(request.promise);
    vi.mocked(apiClient.searchPatient).mockResolvedValueOnce({ data: { exists: false } } as any);
    render(<AppPage />); await capture(); search('SYN-B');
    await screen.findByRole('heading', { name: 'Create Patient' }); expectCleanCreate('SYN-B');
    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'SYNTHETIC B in progress' } });
    await finish(request, outcome, scanResult);
    expect(screen.getByLabelText('Patient ID')).toHaveValue('SYN-B');
    expect(screen.getByLabelText('First Name')).toHaveValue('SYNTHETIC B in progress');
    expect(screen.getByLabelText('Last Name')).toHaveValue('');
    expect(screen.queryByText('SYNTHETIC stale failure')).not.toBeInTheDocument();
    await saveSyntheticB();
  });

  it.each(['camera', 'OCR'])('invalidates pending %s on a changed ID without requiring Search', async kind => {
    const camera = cameraHarness(); const request = deferred();
    if (kind === 'camera') camera.getUserMedia.mockReturnValueOnce(request.promise);
    else vi.mocked(apiClient.scanPatientSticker).mockReturnValueOnce(request.promise);
    render(<AppPage />);
    if (kind === 'camera') fireEvent.click(screen.getByRole('button', { name: /Scan Sticker/ }));
    else await capture();
    fireEvent.change(screen.getByPlaceholderText(/Enter Patient ID/), { target: { value: 'SYN-B' } });
    await finish(request, 'resolve', kind === 'camera' ? camera.stream : scanResult);
    expect(screen.getByPlaceholderText(/Enter Patient ID/)).toHaveValue('SYN-B');
    expect(screen.queryByText('Sticker OCR Result')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Capture/ })).not.toBeInTheDocument();
    expect(camera.stop).toHaveBeenCalledTimes(1);
  });

  it.each(['Dashboard', 'Cancel', 'Logout'])('preserves reviewed scan-create and the subsequent draft on rejected %s', async destination => {
    cameraHarness(); vi.mocked(apiClient.scanPatientSticker).mockResolvedValueOnce(unmatchedScan as any);
    vi.mocked(apiClient.createPatient).mockResolvedValueOnce({ data: { patient: patientA } } as any);
    render(<AppPage />); await capture();
    fireEvent.click(await screen.findByRole('button', { name: 'Create New Patient' }));
    expect(screen.getByLabelText('First Name')).toHaveValue('Synthetic A');
    expect(screen.getByLabelText('Last Name')).toHaveValue('Only');
    expect(screen.getByLabelText('Date of Birth')).toHaveValue('2000-01-02');
    expect(screen.getByRole('combobox')).toHaveValue('Female');
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
    expect(apiClient.createPatient).toHaveBeenCalledExactlyOnceWith('SYN-A', 'Synthetic A', 'Only', expect.objectContaining({
      gender: 'Female', dob: '2000-01-02',
    }));
    await readyNote(); const request = startWrite('update'); draft();
    const date = (screen.getByLabelText('Note date') as HTMLInputElement).value;
    fireEvent.click(screen.getByRole('button', { name: destination, exact: true }));
    await finish(request, 'resolve', resultA);
    expect(screen.getByLabelText('Patient ID')).toHaveValue('SYN-A');
    expect(screen.getByLabelText('First Name')).toHaveValue('Synthetic saved A');
    expect(note()).toHaveValue('SYNTHETIC protected draft');
    expect(screen.getByLabelText('Note date')).toHaveValue(date);
    expect(apiClient.getTodayNote).toHaveBeenCalledTimes(1);
    expect(window.confirm).toHaveBeenCalledTimes(1); expect(logout).not.toHaveBeenCalled();
  });

  it('requires an explicit clear-fields action before correcting the reviewed scan identity', async () => {
    cameraHarness(); vi.mocked(apiClient.scanPatientSticker).mockResolvedValueOnce(unmatchedScan as any);
    render(<AppPage />); await capture();
    fireEvent.click(await screen.findByRole('button', { name: 'Create New Patient' }));
    expect(screen.getByLabelText('Patient ID')).toBeDisabled();
    expect(screen.getByLabelText('First Name')).toHaveValue('Synthetic A');
    fireEvent.click(screen.getByRole('button', { name: 'Clear sticker fields to correct Patient ID' }));
    expectCleanCreate('SYN-A');
    expect(screen.getByLabelText('Patient ID')).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Patient ID'), { target: { value: 'SYN-B' } });
    expectCleanCreate('SYN-B'); await saveSyntheticB();
  });

  it('retains scan review on same-page navigation and reviewed form edits across a parent rerender', async () => {
    cameraHarness(); vi.mocked(apiClient.scanPatientSticker).mockResolvedValueOnce(unmatchedScan as any);
    render(<AppPage />); await capture(); await screen.findByText('Sticker OCR Result');
    fireEvent.click(screen.getByRole('heading', { name: /Medical Notes/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Create New Patient' }));
    expect(screen.getByLabelText('First Name')).toHaveValue('Synthetic A');
    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Synthetic reviewed A' } });
    vi.stubGlobal('innerWidth', 600); fireEvent(window, new Event('resize'));
    expect(screen.getByLabelText('First Name')).toHaveValue('Synthetic reviewed A');
    expect(screen.getByLabelText('Last Name')).toHaveValue('Only');
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it.each(['missing identifier', 'failed OCR'])('supports explicit clean manual creation after %s', async kind => {
    cameraHarness();
    if (kind === 'failed OCR') vi.mocked(apiClient.scanPatientSticker).mockRejectedValueOnce(staleError);
    else vi.mocked(apiClient.scanPatientSticker).mockResolvedValueOnce({ data: {
      ...unmatchedScan.data, parsed: { ...unmatchedScan.data.parsed, patientId: null, mrn: null },
    } } as any);
    render(<AppPage />); await capture();
    if (kind === 'failed OCR') fireEvent.click(await screen.findByRole('button', { name: 'Create Patient Manually' }));
    else {
      fireEvent.click(await screen.findByRole('button', { name: 'Create New Patient' }));
      expect(screen.getByLabelText('First Name')).toHaveValue('Synthetic A');
      fireEvent.click(screen.getByRole('button', { name: 'Clear sticker fields to correct Patient ID' }));
    }
    expectCleanCreate(''); expect(screen.getByLabelText('Patient ID')).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Patient ID'), { target: { value: 'SYN-B' } });
    await saveSyntheticB();
  });

  it.each(['resolve', 'reject'])('ignores pending scan-create A %s after explicit identity correction', async outcome => {
    cameraHarness(); vi.mocked(apiClient.scanPatientSticker).mockResolvedValueOnce(unmatchedScan as any);
    const request = deferred(); vi.mocked(apiClient.createPatient).mockReturnValueOnce(request.promise);
    render(<AppPage />); await capture();
    fireEvent.click(await screen.findByRole('button', { name: 'Create New Patient' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
    expect(apiClient.createPatient).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Clear sticker fields to correct Patient ID' }));
    fireEvent.change(screen.getByLabelText('Patient ID'), { target: { value: 'SYN-B' } });
    expectCleanCreate('SYN-B');
    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'SYNTHETIC current B' } });
    await finish(request, outcome, resultA);
    expect(screen.getByLabelText('Patient ID')).toHaveValue('SYN-B');
    expect(screen.getByLabelText('First Name')).toHaveValue('SYNTHETIC current B');
    expect(screen.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
    expect(screen.queryByText('SYNTHETIC stale failure')).not.toBeInTheDocument();
  });

  it('binds a matched scan to the resolved patient identifier rather than an OCR alias', async () => {
    cameraHarness(); vi.mocked(apiClient.scanPatientSticker).mockResolvedValueOnce({ data: {
      ...scanResult.data, parsed: { ...scanResult.data.parsed, patientId: 'SYN-OCR-ALIAS', mrn: 'SYN-OCR-ALIAS' },
    } } as any);
    render(<AppPage />); await capture(); await screen.findByText('Sticker OCR Result');
    expect(screen.getByPlaceholderText(/Enter Patient ID/)).toHaveValue('SYN-A');
    fireEvent.click(screen.getByRole('button', { name: 'Use MRN for Search' }));
    expect(screen.getByPlaceholderText(/Enter Patient ID/)).toHaveValue('SYN-A');
    fireEvent.click(screen.getByRole('button', { name: 'Edit Patient', exact: true })); await readyNote();
    expect(screen.getByLabelText('Patient ID')).toHaveValue('SYN-A');
    expect(screen.getByLabelText('First Name')).toHaveValue('Synthetic A');
  });
});

describe('camera and OCR completion scope', () => {
  it.each(['resolve', 'reject'])('ignores pending camera %s after selecting B', async outcome => {
    const camera = cameraHarness(); const request = deferred(); camera.getUserMedia.mockReturnValueOnce(request.promise);
    render(<AppPage />); fireEvent.click(screen.getByRole('button', { name: /Scan Sticker/ }));
    await selectPatient(); draft();
    await finish(request, outcome, camera.stream);
    expect(screen.getByLabelText('Patient ID')).toHaveValue('SYN-B'); expect(note()).toHaveValue('SYNTHETIC protected draft');
    expect(camera.stop).toHaveBeenCalledTimes(outcome === 'resolve' ? 1 : 0);
    vi.mocked(window.confirm).mockReturnValue(true);
    fireEvent.click(screen.getByRole('heading', { name: /Medical Notes/ }));
    expect(screen.queryByRole('button', { name: /Capture/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Could not access camera/)).not.toBeInTheDocument();
  });

  it('stops a camera permission result arriving after unmount', async () => {
    const camera = cameraHarness(); const request = deferred(); camera.getUserMedia.mockReturnValueOnce(request.promise);
    const view = render(<AppPage />); fireEvent.click(screen.getByRole('button', { name: /Scan Sticker/ }));
    view.unmount(); await finish(request, 'resolve', camera.stream);
    expect(camera.stop).toHaveBeenCalledTimes(1);
  });

  it.each(['navigation', 'cancel', 'unmount'])('releases an open camera and attachment timer on %s', async destination => {
    const camera = cameraHarness(); const view = render(<AppPage />);
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: /Scan Sticker/ })); await act(async () => {});
    const video = view.container.querySelector('video')!;
    if (destination === 'navigation') fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
    else if (destination === 'cancel') fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    else view.unmount();
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(camera.stop).toHaveBeenCalledTimes(1); expect(video.srcObject).toBeNull();
    expect(screen.queryByRole('button', { name: /Capture/ })).not.toBeInTheDocument();
  });

  it('ignores an old metadata callback after camera cancellation', async () => {
    cameraHarness(); const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const view = render(<AppPage />); vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: /Scan Sticker/ })); await act(async () => {});
    await act(async () => { vi.advanceTimersByTime(100); });
    const video = view.container.querySelector('video')!; const metadata = video.onloadedmetadata!;
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    act(() => { metadata.call(video, new Event('loadedmetadata')); });
    expect(play).not.toHaveBeenCalled(); expect(video.srcObject).toBeNull();
  });

  it('does not upload a delayed encoded photo after leaving the capture', async () => {
    const camera = cameraHarness(); let encoded!: BlobCallback;
    camera.toBlob.mockImplementation(callback => { encoded = callback; });
    render(<AppPage />); await capture(); await selectPatient(); draft();
    await act(async () => encoded(new Blob(['SYNTHETIC'])));
    expect(apiClient.scanPatientSticker).not.toHaveBeenCalled();
    expect(note()).toHaveValue('SYNTHETIC protected draft'); expect(camera.stop).toHaveBeenCalledTimes(1);
  });

  it.each(['resolve', 'reject'])('ignores OCR %s after opening B and entering a draft', async outcome => {
    cameraHarness(); const request = deferred(); vi.mocked(apiClient.scanPatientSticker).mockReturnValueOnce(request.promise);
    render(<AppPage />); await capture(); expect(apiClient.scanPatientSticker).toHaveBeenCalledTimes(1);
    await selectPatient(); draft(); await finish(request, outcome, scanResult);
    expect(screen.getByLabelText('Patient ID')).toHaveValue('SYN-B'); expect(note()).toHaveValue('SYNTHETIC protected draft');
    expect(window.confirm).not.toHaveBeenCalled();
    vi.mocked(window.confirm).mockReturnValue(true);
    fireEvent.click(screen.getByRole('heading', { name: /Medical Notes/ }));
    expect(screen.queryByText('Sticker OCR Result')).not.toBeInTheDocument();
    expect(screen.queryByText('SYNTHETIC stale failure')).not.toBeInTheDocument();
    expect(screen.queryByAltText('Captured')).not.toBeInTheDocument();
  });

  it.each(['resolve', 'reject'])('does not overwrite or unlock a newer OCR attempt on old %s', async outcome => {
    cameraHarness(); const oldRequest = deferred(); const newRequest = deferred();
    vi.mocked(apiClient.scanPatientSticker).mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise);
    render(<AppPage />); await capture();
    fireEvent.click(screen.getByRole('button', { name: 'Scanning...' }));
    fireEvent.click(await screen.findByRole('button', { name: /Capture/ })); await act(async () => {});
    await finish(oldRequest, outcome, scanResult);
    expect(screen.getByRole('button', { name: 'Scanning...' })).toBeVisible();
    expect(screen.queryByText('Sticker OCR Result')).not.toBeInTheDocument();
    expect(screen.queryByText('SYNTHETIC stale failure')).not.toBeInTheDocument();
    await finish(newRequest, 'resolve', scanResult);
    expect(screen.getByRole('button', { name: /Scan Sticker/ })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Patient', exact: true })); await readyNote();
    expect(screen.getByLabelText('Patient ID')).toHaveValue('SYN-A');
  });
});
