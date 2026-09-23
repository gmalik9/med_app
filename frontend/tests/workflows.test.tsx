import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { apiClient } from '../src/utils/apiClient';
import NoteEditor from '../src/components/NoteEditor';
import VitalsCard from '../src/components/VitalsCard';
import { resolveApiUrl } from '../src/utils/apiUrl';

vi.mock('../src/utils/apiClient', () => ({ apiClient: {
  getTodayNote: vi.fn(), getTemplates: vi.fn(), saveNote: vi.fn(),
  getLatestVitals: vi.fn(), getVitalsHistory: vi.fn(), recordVitals: vi.fn(),
  getSessionGeneration: vi.fn(),
} }));

beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  // These workflows keep one authenticated identity across renders and awaits.
  vi.mocked(apiClient.getSessionGeneration).mockReturnValue(1);
  vi.mocked(apiClient.getTemplates).mockResolvedValue({ data: { templates: [] } } as any);
});

describe('frontend clinical regressions', () => {
  it('ignores an old patient response arriving after a new patient response', async () => {
    let completeOld!: (value: any) => void;
    vi.mocked(apiClient.getTodayNote).mockImplementationOnce(() => new Promise(resolve => { completeOld = resolve; }));
    vi.mocked(apiClient.getTodayNote).mockResolvedValueOnce({ data: { exists: true, note: { note_text: 'CURRENT PATIENT', revision: 1 } } } as any);
    const { rerender } = render(<NoteEditor patientId="OLD" />);
    rerender(<NoteEditor patientId="CURRENT" />);
    await waitFor(() => expect(screen.getByLabelText('Clinical note')).toHaveValue('CURRENT PATIENT'));
    await act(async () => { completeOld({ data: { exists: true, note: { note_text: 'WRONG PATIENT' } } }); });
    expect(screen.getByLabelText('Clinical note')).toHaveValue('CURRENT PATIENT');
  });
  it('blocks editing/saving if existing notes cannot be loaded', async () => {
    vi.mocked(apiClient.getTodayNote).mockRejectedValue(new Error('synthetic network failure'));
    render(<NoteEditor patientId="SYN" />);
    expect(await screen.findByText('Failed to load note. Reload before editing.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save Note' })).toBeDisabled();
    expect(screen.getByLabelText('Clinical note')).toBeDisabled();
  });
  it('sends the loaded revision and preserves draft on a conflict', async () => {
    vi.mocked(apiClient.getTodayNote).mockResolvedValue({ data: { exists: true, note: { note_text: 'Original', revision: 7 } } } as any);
    vi.mocked(apiClient.saveNote).mockRejectedValue({ response: { data: { error: 'Conflict: reload and reconcile' } } });
    render(<NoteEditor patientId="SYN" />);
    await waitFor(() => expect(screen.getByLabelText('Clinical note')).toHaveValue('Original'));
    fireEvent.change(screen.getByLabelText('Clinical note'), { target: { value: 'Local draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Note' }));
    expect(await screen.findByText('Conflict: reload and reconcile')).toBeVisible();
    expect(apiClient.saveNote).toHaveBeenCalledWith('SYN', 'Local draft', expect.any(String), [], 7);
    expect(screen.getByLabelText('Clinical note')).toHaveValue('Local draft');
  });
  it('renders vitals history from the actual API contract and sends numbers', async () => {
    vi.mocked(apiClient.getLatestVitals).mockResolvedValue({ data: { vitalSigns: null } } as any);
    vi.mocked(apiClient.getVitalsHistory).mockResolvedValue({ data: {
      vitalSigns: [{ id: 1, heart_rate: 72, recorded_date: '2026-09-20T10:00:00Z' }], hasMore: false, nextCursor: null,
    } } as any);
    vi.mocked(apiClient.recordVitals).mockResolvedValue({ data: {} } as any);
    render(<VitalsCard patientId="SYN" />);
    fireEvent.click(screen.getByRole('button', { name: /Show.*Vitals History/ }));
    expect(await screen.findByText(/72 bpm/)).toBeVisible();
    fireEvent.change(screen.getByPlaceholderText('Heart Rate'), { target: { value: '75' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record Vitals' }));
    await waitFor(() => expect(apiClient.recordVitals).toHaveBeenCalledWith(
      'SYN',
      expect.objectContaining({ heartRate: 75, temperature: null }),
      expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
    ));
    await waitFor(() => expect(screen.getByPlaceholderText('Heart Rate')).toHaveValue(''));
    expect(apiClient.recordVitals).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('clinical-write:vitals')).toBeNull();
  });
});

describe('API destination safety', () => {
  it('uses same-origin without an /api/api prefix or guessed hostname', () => expect(resolveApiUrl()).toBe(''));
  it('accepts explicit TLS origins and local development origins', () => {
    expect(resolveApiUrl('https://api.example.invalid')).toBe('https://api.example.invalid');
    expect(resolveApiUrl('http://127.0.0.1:5059')).toBe('http://127.0.0.1:5059');
  });
  it.each(['http://remote.example.invalid', 'https://user:password@example.invalid', 'https://api.example.invalid/api', 'javascript:alert(1)'])('rejects unsafe API destination %s', url => {
    expect(() => resolveApiUrl(url)).toThrow();
  });
});
