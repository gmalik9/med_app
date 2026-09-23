import { Router, Request, Response } from 'express';
import { query } from '../db';
import { authenticate } from '../middleware/auth';
import { safeDiagnostic } from '../middleware/safeAudit';
import { idempotentWrite, IdempotencyError } from '../services/idempotency';
import { pagination, PaginationError } from '../utils/pagination';

const router = Router();

// Create visit record
router.post('/create', authenticate, async (req: Request, res: Response) => {
  try {
    const { patientId, visitType, chiefComplaint, diagnosis, treatmentProvided, followupInstructions, nextVisitDate } = req.body;

    if (!patientId) {
      return res.status(400).json({ error: 'Patient ID required' });
    }

    const { result, replayed } = await idempotentWrite(req, 'CREATE_VISIT', patientId,
      `INSERT INTO visit_history (patient_id, doctor_id, visit_date, visit_type, chief_complaint, 
       diagnosis, treatment_provided, followup_instructions, next_visit_date)
       VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [patientId, req.user?.userId, visitType, chiefComplaint, diagnosis, treatmentProvided, followupInstructions, nextVisitDate]
    );

    res.setHeader('Idempotency-Replayed', String(replayed));
    res.status(201).json({ visit: result.rows[0] });
  } catch (err) {
    if (err instanceof IdempotencyError) return res.status(err.status).json({ error: err.message });
    safeDiagnostic(req, 'visit_write_failed');
    res.status(500).json({ error: 'Failed to create visit record' });
  }
});

// Get visit history for patient
router.get('/patient/:patientId', authenticate, async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;
    const filter = req.query.filter ?? 'all';
    if (filter !== 'all' && filter !== 'upcoming') throw new PaginationError();
    const paging = pagination(req.query, { endpoint: 'visits.history', patient: String(patientId), filters: { filter } }, 30);

    const result = await query(
      `SELECT vh.*, u.first_name, u.last_name,
              to_char(vh.visit_date, 'YYYY-MM-DD"T"HH24:MI:SS.US') AS _cursor_timestamp FROM visit_history vh
       JOIN users u ON vh.doctor_id = u.id
       WHERE vh.patient_id = $1
         AND ($5::text = 'all' OR vh.visit_date > LOCALTIMESTAMP)
         AND ($3::timestamp IS NULL OR (vh.visit_date, vh.id) < ($3::timestamp, $4::integer))
       ORDER BY vh.visit_date DESC, vh.id DESC LIMIT $2`,
      [patientId, paging.limit + 1, paging.cursor?.t ?? null, paging.cursor?.id ?? null, filter]
    );

    const { rows, ...metadata } = paging.page(result.rows);
    res.json({ visits: rows, ...metadata });
  } catch (err) {
    if (err instanceof PaginationError) return res.status(400).json({ error: err.message });
    safeDiagnostic(req, 'visit_history_failed');
    res.status(500).json({ error: 'Failed to fetch visit history' });
  }
});

// Get today's visits for doctor
router.get('/doctor/today', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT vh.*, p.first_name, p.last_name, p.patient_id FROM visit_history vh
       JOIN patients p ON vh.patient_id = p.patient_id
      WHERE vh.doctor_id = $1 AND vh.visit_date >= CURRENT_DATE AND vh.visit_date < CURRENT_DATE + INTERVAL '1 day'
      ORDER BY vh.visit_date DESC LIMIT 100`,
      [req.user?.userId]
    );

    res.json({ visits: result.rows });
  } catch (err) {
    safeDiagnostic(req, 'visits_today_failed');
    res.status(500).json({ error: 'Failed to fetch today\'s visits' });
  }
});

export default router;
