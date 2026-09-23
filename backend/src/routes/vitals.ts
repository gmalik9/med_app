import { Router, Request, Response } from 'express';
import { query } from '../db';
import { authenticate } from '../middleware/auth';
import { safeDiagnostic } from '../middleware/safeAudit';
import { idempotentWrite, IdempotencyError } from '../services/idempotency';
import { pagination, PaginationError } from '../utils/pagination';

const router = Router();

// Record vital signs
router.post('/patient/:patientId', authenticate, async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;
    const { temperature, heartRate, bloodPressureSystolic, bloodPressureDiastolic, respiratoryRate, oxygenSaturation, weight, height, notes } = req.body;

    const { result, replayed } = await idempotentWrite(req, 'RECORD_VITALS', String(patientId),
      `INSERT INTO vital_signs (patient_id, recorded_by, recorded_date, temperature, heart_rate, 
       blood_pressure_systolic, blood_pressure_diastolic, respiratory_rate, oxygen_saturation, weight, height, notes)
       VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [patientId, req.user?.userId, temperature, heartRate, bloodPressureSystolic, bloodPressureDiastolic, 
       respiratoryRate, oxygenSaturation, weight, height, notes]
    );

    res.setHeader('Idempotency-Replayed', String(replayed));
    res.status(201).json({ vitalSigns: result.rows[0] });
  } catch (err) {
    if (err instanceof IdempotencyError) return res.status(err.status).json({ error: err.message });
    safeDiagnostic(req, 'vitals_write_failed');
    res.status(500).json({ error: 'Failed to record vital signs' });
  }
});

// Get latest vital signs
router.get('/patient/:patientId/latest', authenticate, async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;

    const result = await query(
      `SELECT * FROM vital_signs WHERE patient_id = $1 
       ORDER BY recorded_date DESC LIMIT 1`,
      [patientId]
    );

    if (result.rows.length === 0) {
      return res.json({ vitalSigns: null });
    }

    res.json({ vitalSigns: result.rows[0] });
  } catch (err) {
    safeDiagnostic(req, 'vitals_read_failed');
    res.status(500).json({ error: 'Failed to fetch vital signs' });
  }
});

// Get vital signs history
router.get('/patient/:patientId/history', authenticate, async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;
    const paging = pagination(req.query, { endpoint: 'vitals.history', patient: String(patientId) }, 50);

    const result = await query(
      `SELECT *, to_char(recorded_date, 'YYYY-MM-DD"T"HH24:MI:SS.US') AS _cursor_timestamp
       FROM vital_signs WHERE patient_id = $1
         AND ($3::timestamp IS NULL OR (recorded_date, id) < ($3::timestamp, $4::integer))
       ORDER BY recorded_date DESC, id DESC LIMIT $2`,
      [patientId, paging.limit + 1, paging.cursor?.t ?? null, paging.cursor?.id ?? null]
    );

    const { rows, ...metadata } = paging.page(result.rows);
    res.json({ vitalSigns: rows, ...metadata });
  } catch (err) {
    if (err instanceof PaginationError) return res.status(400).json({ error: err.message });
    safeDiagnostic(req, 'vitals_history_failed');
    res.status(500).json({ error: 'Failed to fetch vital signs history' });
  }
});

export default router;
