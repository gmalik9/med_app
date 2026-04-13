import { Router, Request, Response } from 'express';
import { query } from '../db';
import { authenticate } from '../middleware/auth';

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

  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed; // Already in correct format
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    // Get local date (not UTC)
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Convert any date to YYYY-MM-DD format (local time)
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Get today's note for patient (or any specific date)
router.get('/patient/:patientId', authenticate, async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;
    const { date } = req.query;

    const noteDate = normalizeDateInput(date as string | undefined);

    const result = await query(
      `SELECT cn.id, cn.patient_id, cn.doctor_id, cn.note_date, cn.note_text, cn.medical_codes, cn.created_at, cn.updated_at
       FROM clinical_notes cn
       JOIN patients p ON cn.patient_id = p.id
       WHERE p.id = $1 AND cn.note_date = $2 AND cn.doctor_id = $3`,
      [patientId, noteDate, req.user?.userId]
    );

    if (result.rows.length === 0) {
      return res.json({ exists: false, note: null });
    }

    res.json({ exists: true, note: result.rows[0] });
  } catch (err) {
    console.error('Get note error:', err);
    res.status(500).json({ error: 'Failed to fetch note' });
  }
});

// Create or update note for today
router.post('/patient/:patientId', authenticate, async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;
    const { noteText, date, medicalCodes = [] } = req.body;

    if (!noteText) {
      return res.status(400).json({ error: 'Note text required' });
    }

    const noteDate = normalizeDateInput(date);
    const sanitizedCodes = Array.isArray(medicalCodes)
      ? Array.from(new Set(medicalCodes.map((code) => String(code).trim().toUpperCase()).filter(Boolean)))
      : [];

    // Check if patient exists and get their integer ID
    const patientResult = await query('SELECT id FROM patients WHERE patient_id = $1', [patientId]);
    if (patientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    const patientDbId = patientResult.rows[0].id;

    // Try to update existing note
    const existing = await query(
      `SELECT id FROM clinical_notes 
       WHERE patient_id = $1 AND note_date = $2 AND doctor_id = $3`,
      [patientDbId, noteDate, req.user?.userId]
    );

    let result;
    if (existing.rows.length > 0) {
      result = await query(
        `UPDATE clinical_notes 
         SET note_text = $2, medical_codes = $3::jsonb, updated_at = NOW()
         WHERE patient_id = $1 AND note_date = $4 AND doctor_id = $5
         RETURNING id, patient_id, doctor_id, note_date, note_text, medical_codes, created_at, updated_at`,
        [patientDbId, noteText, JSON.stringify(sanitizedCodes), noteDate, req.user?.userId]
      );
    } else {
      result = await query(
        `INSERT INTO clinical_notes (patient_id, doctor_id, note_date, note_text, medical_codes)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         RETURNING id, patient_id, doctor_id, note_date, note_text, medical_codes, created_at, updated_at`,
        [patientDbId, req.user?.userId, noteDate, noteText, JSON.stringify(sanitizedCodes)]
      );
    }

    // Log audit trail
    await query(
      `INSERT INTO audit_log (user_id, patient_id, action, ip_address)
       VALUES ($1, $2, 'SAVE_NOTE', $3)`,
      [req.user?.userId, patientDbId, req.ip]
    );

    res.json({ note: result.rows[0] });
  } catch (err) {
    console.error('Create/update note error:', err);
    res.status(500).json({ error: 'Failed to save note' });
  }
});

// Get all notes for a patient
router.get('/patient/:patientId/history', authenticate, async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;
    const { limit = 30 } = req.query;

    const result = await query(
      `SELECT cn.id, cn.patient_id, cn.doctor_id, cn.note_date, cn.note_text, cn.created_at, cn.updated_at,
              cn.medical_codes,
              u.first_name, u.last_name, u.email
       FROM clinical_notes cn
       JOIN users u ON cn.doctor_id = u.id
       WHERE cn.patient_id = $1
       ORDER BY cn.note_date DESC
       LIMIT $2`,
      [patientId, parseInt(limit as string)]
    );

    res.json({ notes: result.rows });
  } catch (err) {
    console.error('Get note history error:', err);
    res.status(500).json({ error: 'Failed to fetch note history' });
  }
});

export default router;
