import { Router, Request, Response } from 'express';
import { query } from '../db';
import { authenticate } from '../middleware/auth';

const router = Router();

// Create appointment
router.post('/create', authenticate, async (req: Request, res: Response) => {
  try {
    const { patientId, appointmentDate, appointmentType, reason } = req.body;

    if (!patientId || !appointmentDate) {
      return res.status(400).json({ error: 'Patient ID and appointment date required' });
    }

    // Verify patient exists
    const patientResult = await query('SELECT id FROM patients WHERE id = $1', [patientId]);
    if (patientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const result = await query(
      `INSERT INTO appointments (patient_id, doctor_id, appointment_date, appointment_type, reason, status)
       VALUES ($1, $2, $3, $4, $5, 'scheduled')
       RETURNING *`,
      [patientId, req.user?.userId, appointmentDate, appointmentType, reason]
    );

    // Log audit
    await query(
      `INSERT INTO audit_log (user_id, patient_id, action, ip_address)
       VALUES ($1, $2, 'CREATE_APPOINTMENT', $3)`,
      [req.user?.userId, patientId, req.ip]
    );

    res.status(201).json({ appointment: result.rows[0] });
  } catch (err) {
    console.error('Create appointment error:', err);
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
    console.error('Get appointments error:', err);
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

    const result = await query(
      `UPDATE appointments SET status = $2, updated_at = NOW() 
       WHERE id = $1 RETURNING *`,
      [appointmentId, status]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    res.json({ appointment: result.rows[0] });
  } catch (err) {
    console.error('Update appointment error:', err);
    res.status(500).json({ error: 'Failed to update appointment' });
  }
});

// Get appointment history for patient
router.get('/patient/:patientId/history', authenticate, async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;

    const result = await query(
      `SELECT a.*, u.first_name, u.last_name FROM appointments a
       JOIN users u ON a.doctor_id = u.id
       WHERE a.patient_id = $1 
       ORDER BY a.appointment_date DESC LIMIT 30`,
      [patientId]
    );

    res.json({ appointments: result.rows });
  } catch (err) {
    console.error('Get appointment history error:', err);
    res.status(500).json({ error: 'Failed to fetch appointment history' });
  }
});

export default router;
