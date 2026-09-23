import React, { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AppPage } from '../src/pages/AppPage';
import { apiClient } from '../src/utils/apiClient';

const { logout } = vi.hoisted(() => ({ logout: vi.fn() }));
vi.mock('../src/hooks/useAuth', () => ({ useAuth: () => ({ logout, user: { email: 'synthetic@example.invalid' } }) }));
vi.mock('../src/utils/apiClient', () => ({ apiClient: {
  searchPatient: vi.fn(), getTodayNote: vi.fn(), getTemplates: vi.fn(), saveNote: vi.fn(), formatNote: vi.fn(),
} }));
// Keep the real Header/NoteEditor, isolate unrelated clinical panels and their requests.
vi.mock('../src/components/PatientForm', () => ({ default: ({ patientId, initialData, onCreated, onCancel }: any) => (
  <section aria-label="Synthetic patient form">
    <span data-testid="current-patient">{patientId}</span>
    <button onClick={onCancel}>Cancel patient editing</button>
    <button onClick={() => onCreated({ ...initialData, first_name: 'Synthetic updated' })}>Update same patient</button>
    <button onClick={() => onCreated({ ...initialData, patient_id: 'SYN-B' })}>Synthetic identity change</button>
  </section>
) }));
vi.mock('../src/components/PatientHistory', () => ({ default: () => null }));
vi.mock('../src/components/VitalsCard', () => ({ default: () => null }));
vi.mock('../src/components/AppointmentsCard', () => ({ default: () => null }));
vi.mock('../src/components/VisitsCard', () => ({ default: () => null }));
vi.mock('../src/components/TemplatesAnalyticsPanel', () => ({ default: () => null }));
vi.mock('../src/components/ScheduledVisitsPanel', () => ({ default: () => null }));
vi.mock('../src/components/DoctorDashboard', () => ({ default: () => <h2>Synthetic dashboard</h2> }));
vi.mock('../src/components/DoctorProfile', () => ({ default: () => <h2>Synthetic profile</h2> }));
vi.mock('../src/pages/PatientsListPage', () => ({ PatientsListPage: ({ onEditPatient }: any) => (
  <button onClick={() => onEditPatient({ id: 2, patient_id: 'SYN-B', first_name: 'Synthetic', last_name: 'B' })}>Select synthetic patient B</button>
) }));

const patientA = { id: 1, patient_id: 'SYN-A', first_name: 'Synthetic', last_name: 'A' };
const serverNote = (text = 'SYNTHETIC original', revision = 1) => ({
  note_text: text, revision, medical_codes: [], note_date: '2026-09-20', updated_at: '2026-09-20T10:00:00Z',
});
const note = () => screen.getByLabelText('Clinical note');
const edit = () => fireEvent.change(note(), { target: { value: 'SYNTHETIC unsaved draft' } });
async function openPatient(strict = false) {
  const view = render(strict ? <StrictMode><AppPage /></StrictMode> : <AppPage />);
  fireEvent.change(screen.getByPlaceholderText(/Enter Patient ID/), { target: { value: 'SYN-A' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search', exact: true }));
  await waitFor(() => expect(note()).toHaveValue('SYNTHETIC original'));
  return view;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  vi.mocked(apiClient.searchPatient).mockResolvedValue({ data: { exists: true, patient: patientA } } as any);
  vi.mocked(apiClient.getTodayNote).mockResolvedValue({ data: { exists: true, note: serverNote() } } as any);
  vi.mocked(apiClient.getTemplates).mockResolvedValue({ data: { templates: [] } } as any);
  vi.mocked(apiClient.saveNote).mockResolvedValue({ data: { note: serverNote('SYNTHETIC unsaved draft', 2) } } as any);
  vi.mocked(apiClient.formatNote).mockResolvedValue({ data: { text: 'SYNTHETIC proposed note' } } as any);
});
afterEach(() => vi.restoreAllMocks());

describe('AppPage note draft boundary', () => {
  it.each(['Dashboard', 'View All Patients', 'Profile', 'Back to Search', 'Cancel patient editing', 'title'])('cancels %s without changing patient/date/draft', async destination => {
    await openPatient(); edit();
    const date = (screen.getByLabelText('Note date') as HTMLInputElement).value;
    if (destination === 'title') fireEvent.click(screen.getByRole('heading', { name: /Medical Notes/ }));
    else fireEvent.click(screen.getByRole('button', { name: new RegExp(destination) }));
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('current-patient')).toHaveTextContent('SYN-A');
    expect(note()).toHaveValue('SYNTHETIC unsaved draft');
    expect(screen.getByLabelText('Note date')).toHaveValue(date);
    expect(apiClient.getTodayNote).toHaveBeenCalledTimes(1);
    expect(logout).not.toHaveBeenCalled();
  });

  it.each(['Dashboard', 'View All Patients', 'Profile', 'Back to Search', 'Cancel patient editing'])('allows explicitly confirmed %s', async destination => {
    await openPatient(); edit();
    vi.mocked(window.confirm).mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(destination) }));
    expect(screen.queryByLabelText('Clinical note')).not.toBeInTheDocument();
    if (destination === 'Dashboard') expect(screen.getByRole('heading', { name: 'Synthetic dashboard' })).toBeVisible();
    else if (destination === 'Profile') expect(screen.getByRole('heading', { name: 'Synthetic profile' })).toBeVisible();
    else if (destination === 'View All Patients') expect(screen.getByRole('button', { name: 'Select synthetic patient B' })).toBeVisible();
    else expect(screen.getByRole('heading', { name: 'Search Patient' })).toBeVisible();
  });

  it('warns before manual logout, and only invokes logout after confirmation', async () => {
    await openPatient(); edit();
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    expect(logout).not.toHaveBeenCalled(); expect(note()).toHaveValue('SYNTHETIC unsaved draft');
    expect(screen.getByTestId('current-patient')).toHaveTextContent('SYN-A');
    vi.mocked(window.confirm).mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('does not warn on manual logout after a successful save', async () => {
    await openPatient(); edit(); fireEvent.click(screen.getByRole('button', { name: 'Save Note' }));
    await screen.findByText('Note saved successfully!');
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    expect(window.confirm).not.toHaveBeenCalled(); expect(logout).toHaveBeenCalledTimes(1);
  });

  it('starts the next patient with only that patient’s loaded data after a confirmed list transition', async () => {
    await openPatient(); edit();
    vi.mocked(window.confirm).mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'View All Patients' }));
    vi.mocked(apiClient.getTodayNote).mockResolvedValueOnce({ data: { exists: true, note: serverNote('SYNTHETIC patient B', 5) } } as any);
    fireEvent.click(screen.getByRole('button', { name: 'Select synthetic patient B' }));
    await waitFor(() => expect(note()).toHaveValue('SYNTHETIC patient B'));
    expect(screen.getByTestId('current-patient')).toHaveTextContent('SYN-B');
    expect(apiClient.getTodayNote).toHaveBeenLastCalledWith('SYN-B', expect.any(String));
    expect(window.confirm).toHaveBeenCalledTimes(1);
  });

  it('guards identity-changing callbacks but not same-patient metadata updates', async () => {
    await openPatient(); edit();
    fireEvent.click(screen.getByRole('button', { name: 'Update same patient' }));
    expect(window.confirm).not.toHaveBeenCalled(); expect(note()).toHaveValue('SYNTHETIC unsaved draft');
    fireEvent.click(screen.getByRole('button', { name: 'Synthetic identity change' }));
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('current-patient')).toHaveTextContent('SYN-A');
    expect(note()).toHaveValue('SYNTHETIC unsaved draft');
  });

  it('guards an AI review even when the original note is clean', async () => {
    await openPatient(); fireEvent.click(screen.getByRole('button', { name: /Format with AI/ }));
    await screen.findByLabelText('AI proposed note');
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('AI proposed note')).toHaveValue('SYNTHETIC proposed note');
    expect(note()).toHaveValue('SYNTHETIC original');
  });

  it('preserves the registered guard across StrictMode effect replay', async () => {
    await openPatient(true); edit();
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
    expect(window.confirm).toHaveBeenCalledTimes(1); expect(note()).toHaveValue('SYNTHETIC unsaved draft');
  });

  it('ignores a late patient search after navigation', async () => {
    let complete!: (value: any) => void;
    vi.mocked(apiClient.searchPatient).mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    render(<AppPage />);
    fireEvent.change(screen.getByPlaceholderText(/Enter Patient ID/), { target: { value: 'SYN-A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
    await act(async () => complete({ data: { exists: true, patient: patientA } }));
    expect(screen.getByRole('heading', { name: 'Synthetic dashboard' })).toBeVisible();
    expect(screen.queryByLabelText('Clinical note')).not.toBeInTheDocument();
  });

  it('keeps form identity aligned with the resolved patient if search input changes while pending', async () => {
    let complete!: (value: any) => void;
    vi.mocked(apiClient.searchPatient).mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    render(<AppPage />);
    const input = screen.getByPlaceholderText(/Enter Patient ID/);
    fireEvent.change(input, { target: { value: 'SYN-A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search', exact: true }));
    fireEvent.change(input, { target: { value: 'SYN-B' } });
    await act(async () => complete({ data: { exists: true, patient: patientA } }));
    await waitFor(() => expect(note()).toHaveValue('SYNTHETIC original'));
    expect(screen.getByTestId('current-patient')).toHaveTextContent('SYN-A');
    expect(apiClient.getTodayNote).toHaveBeenLastCalledWith('SYN-A', expect.any(String));
  });

  it('displays the forced-logoff draft-loss limitation without overriding the auth policy', async () => {
    await openPatient();
    expect(screen.getByText(/Session expiry or automatic logout can discard unsaved work/)).toBeVisible();
  });
});