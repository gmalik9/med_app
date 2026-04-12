import { Router, Request, Response } from 'express';
import { query } from '../db';
import { authenticate } from '../middleware/auth';

const router = Router();

// Get today's note for patient (or any specific date)
router.get('/patient/:patientId', authenticate, async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;
    const { date } = req.query;

    const noteDate = date ? new Date(date as string).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

    const result = await query(
      `SELECT cn.id, cn.patient_id, cn.doctor_id, cn.note_date, cn.note_text, cn.created_at, cn.updated_at
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
    const { noteText, date } = req.body;

    if (!noteText) {
      return res.status(400).json({ error: 'Note text required' });
    }

    const noteDate = date ? new Date(date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

    // Check if patient exists
    const patientResult = await query('SELECT id FROM patients WHERE id = $1', [patientId]);
    if (patientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // Try to update existing note
    const existing = await query(
      `SELECT id FROM clinical_notes 
       WHERE patient_id = $1 AND note_date = $2 AND doctor_id = $3`,
      [patientId, noteDate, req.user?.userId]
    );

    let result;
    if (existing.rows.length > 0) {
      result = await query(
        `UPDATE clinical_notes 
         SET note_text = $2, updated_at = NOW()
         WHERE patient_id = $1 AND note_date = $3 AND doctor_id = $4
         RETURNING id, patient_id, doctor_id, note_date, note_text, created_at, updated_at`,
        [patientId, noteText, noteDate, req.user?.userId]
      );
    } else {
      result = await query(
        `INSERT INTO clinical_notes (patient_id, doctor_id, note_date, note_text)
         VALUES ($1, $2, $3, $4)
         RETURNING id, patient_id, doctor_id, note_date, note_text, created_at, updated_at`,
        [patientId, req.user?.userId, noteDate, noteText]
      );
    }

    // Log audit trail
    await query(
      `INSERT INTO audit_log (user_id, patient_id, action, ip_address)
       VALUES ($1, $2, 'SAVE_NOTE', $3)`,
      [req.user?.userId, patientId, req.ip]
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
