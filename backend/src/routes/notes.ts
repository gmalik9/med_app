import { Router, Request, Response } from 'express';
import { query } from '../db';
import { authenticate } from '../middleware/auth';
import { safeDiagnostic } from '../middleware/safeAudit';
import { setResolvedAuditReference } from '../middleware/safeAuditMetadata';
import { auditedWrite } from '../services/auditedWrite';
import { pagination, PaginationError } from '../utils/pagination';

const router = Router();

const normalizeDateInput = (value?: string) => {
  if (!value) {
    // Get local date (not UTC)
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`; // YYYY-MM-DD format in LOCAL time
  }

  return value; // Calendar date already validated at the API boundary.
};

// Get today's note for patient (or any specific date)
router.get('/patient/:patientId', authenticate, async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;
    const { date } = req.query;

    const noteDate = normalizeDateInput(date as string | undefined);

    const result = await query(
      `SELECT cn.id, cn.patient_id, cn.doctor_id, cn.note_date, cn.note_text, cn.medical_codes, cn.revision, cn.created_at, cn.updated_at
       FROM clinical_notes cn
       JOIN patients p ON cn.patient_id = p.patient_id
       WHERE p.patient_id = $1 AND cn.note_date = $2 AND cn.doctor_id = $3`,
      [patientId, noteDate, req.user?.userId]
    );

    if (result.rows.length === 0) {
      return res.json({ exists: false, note: null });
    }

    setResolvedAuditReference(req, result.rows[0].patient_id, result.rows[0].id);
    res.json({ exists: true, note: result.rows[0] });
  } catch (err) {
    safeDiagnostic(req, 'note_read_failed');
    res.status(500).json({ error: 'Failed to fetch note' });
  }
});

// Create or update note for today
router.post('/patient/:patientId', authenticate, async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;
    const { noteText, date, medicalCodes = [], expectedRevision = 0 } = req.body;

    if (!noteText) {
      return res.status(400).json({ error: 'Note text required' });
    }

    const noteDate = normalizeDateInput(date);
    const sanitizedCodes = Array.isArray(medicalCodes)
      ? Array.from(new Set(medicalCodes.map((code) => String(code).trim().toUpperCase()).filter(Boolean)))
      : [];

    // Check if patient exists
    const patientResult = await query('SELECT patient_id FROM patients WHERE patient_id = $1', [patientId]);
    if (patientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const result = await auditedWrite(req, 'SAVE_NOTE',
      `INSERT INTO clinical_notes (patient_id, doctor_id, note_date, note_text, medical_codes)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (patient_id, doctor_id, note_date) DO UPDATE
       SET note_text = EXCLUDED.note_text, medical_codes = EXCLUDED.medical_codes,
           updated_at = NOW(), revision = clinical_notes.revision + 1
       WHERE clinical_notes.revision = $6
       RETURNING id, patient_id, doctor_id, note_date, note_text, medical_codes, revision, created_at, updated_at`,
      [patientId, req.user?.userId, noteDate, noteText, JSON.stringify(sanitizedCodes), expectedRevision]
    );
    if (!result.rows.length) return res.status(409).json({ error: 'Note changed in another session. Reload and reconcile before saving.' });

    setResolvedAuditReference(req, result.rows[0].patient_id, result.rows[0].id);
    res.json({ note: result.rows[0] });
  } catch (err) {
    safeDiagnostic(req, 'note_write_failed');
    res.status(500).json({ error: 'Failed to save note' });
  }
});

// Get all notes for a patient
router.get('/patient/:patientId/history', authenticate, async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;
    const paging = pagination(req.query, { endpoint: 'notes.history', patient: String(patientId) }, 30);

    const result = await query(
      `SELECT cn.id, cn.patient_id, cn.doctor_id, cn.note_date, cn.note_text, cn.created_at, cn.updated_at,
              cn.medical_codes, to_char(cn.note_date, 'YYYY-MM-DD"T"HH24:MI:SS.US') AS _cursor_timestamp,
              u.first_name, u.last_name, u.email
       FROM clinical_notes cn
       JOIN users u ON cn.doctor_id = u.id
       WHERE cn.patient_id = $1
         AND ($3::timestamp IS NULL OR (cn.note_date, cn.id) < ($3::timestamp, $4::integer))
       ORDER BY cn.note_date DESC, cn.id DESC
       LIMIT $2`,
      [patientId, paging.limit + 1, paging.cursor?.t ?? null, paging.cursor?.id ?? null]
    );

    const { rows, ...metadata } = paging.page(result.rows);
    res.json({ notes: rows, ...metadata });
  } catch (err) {
    if (err instanceof PaginationError) return res.status(400).json({ error: err.message });
    safeDiagnostic(req, 'note_history_failed');
    res.status(500).json({ error: 'Failed to fetch note history' });
  }
});

export default router;
