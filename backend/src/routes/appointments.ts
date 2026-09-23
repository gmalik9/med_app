import { Router, Request, Response } from 'express';
import { query } from '../db';
import { authenticate } from '../middleware/auth';
import { safeDiagnostic } from '../middleware/safeAudit';
import { auditedWrite } from '../services/auditedWrite';
import { idempotentWrite, IdempotencyError } from '../services/idempotency';
import { pagination, PaginationError } from '../utils/pagination';

const router = Router();

// Create appointment
router.post('/create', authenticate, async (req: Request, res: Response) => {
  try {
    const { patientId, appointmentDate, appointmentType, reason } = req.body;

    if (!patientId || !appointmentDate) {
      return res.status(400).json({ error: 'Patient ID and appointment date required' });
    }

    const { result, replayed } = await idempotentWrite(req, 'CREATE_APPOINTMENT', patientId,
      `INSERT INTO appointments (patient_id, doctor_id, appointment_date, appointment_type, reason, status)
       VALUES ($1, $2, $3, $4, $5, 'scheduled')
       RETURNING *`,
      [patientId, req.user?.userId, appointmentDate, appointmentType, reason]
    );

    res.setHeader('Idempotency-Replayed', String(replayed));
    res.status(201).json({ appointment: result.rows[0] });
  } catch (err) {
    if (err instanceof IdempotencyError) return res.status(err.status).json({ error: err.message });
    safeDiagnostic(req, 'appointment_write_failed');
    res.status(500).json({ error: 'Failed to create appointment' });
  }
});

// Get upcoming appointments for doctor
router.get('/upcoming', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT a.*, p.first_name, p.last_name, p.patient_id 
       FROM appointments a
       JOIN patients p ON a.patient_id = p.patient_id
       WHERE a.doctor_id = $1 AND a.appointment_date >= NOW() AND a.status = 'scheduled'
       ORDER BY a.appointment_date ASC
       LIMIT 20`,
      [req.user?.userId]
    );

    res.json({ appointments: result.rows });
  } catch (err) {
    safeDiagnostic(req, 'appointments_read_failed');
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

// Update appointment status
router.put('/:appointmentId/status', authenticate, async (req: Request, res: Response) => {
  try {
    const { appointmentId } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status required' });
    }

    const result = await auditedWrite(req, 'UPDATE_APPOINTMENT',
      `UPDATE appointments SET status = $2, updated_at = NOW()
       WHERE id = $1 AND doctor_id = $3 RETURNING *`,
      [appointmentId, status, req.user?.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    res.json({ appointment: result.rows[0] });
  } catch (err) {
    safeDiagnostic(req, 'appointment_status_failed');
    res.status(500).json({ error: 'Failed to update appointment' });
  }
});

// Get appointment history for patient
router.get('/patient/:patientId/history', authenticate, async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;
    const paging = pagination(req.query, { endpoint: 'appointments.history', patient: String(patientId) }, 30);

    const result = await query(
      `SELECT a.*, u.first_name, u.last_name,
              to_char(a.appointment_date, 'YYYY-MM-DD"T"HH24:MI:SS.US') AS _cursor_timestamp FROM appointments a
       JOIN users u ON a.doctor_id = u.id
       WHERE a.patient_id = $1
         AND ($3::timestamp IS NULL OR (a.appointment_date, a.id) < ($3::timestamp, $4::integer))
       ORDER BY a.appointment_date DESC, a.id DESC LIMIT $2`,
      [patientId, paging.limit + 1, paging.cursor?.t ?? null, paging.cursor?.id ?? null]
    );

    const { rows, ...metadata } = paging.page(result.rows);
    res.json({ appointments: rows, ...metadata });
  } catch (err) {
    if (err instanceof PaginationError) return res.status(400).json({ error: err.message });
    safeDiagnostic(req, 'appointment_history_failed');
    res.status(500).json({ error: 'Failed to fetch appointment history' });
  }
});

export default router;
