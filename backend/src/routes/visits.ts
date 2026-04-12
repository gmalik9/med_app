import { Router, Request, Response } from 'express';
import { query } from '../db';
import { authenticate } from '../middleware/auth';

const router = Router();

// Create visit record
router.post('/create', authenticate, async (req: Request, res: Response) => {
  try {
    const { patientId, visitType, chiefComplaint, diagnosis, treatmentProvided, followupInstructions, nextVisitDate } = req.body;

    if (!patientId) {
      return res.status(400).json({ error: 'Patient ID required' });
    }

    // Verify patient exists
    const patientResult = await query('SELECT id FROM patients WHERE id = $1', [patientId]);
    if (patientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const result = await query(
      `INSERT INTO visit_history (patient_id, doctor_id, visit_date, visit_type, chief_complaint, 
       diagnosis, treatment_provided, followup_instructions, next_visit_date)
       VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [patientId, req.user?.userId, visitType, chiefComplaint, diagnosis, treatmentProvided, followupInstructions, nextVisitDate]
    );

    // Log audit
    await query(
      `INSERT INTO audit_log (user_id, patient_id, action, ip_address)
       VALUES ($1, $2, 'CREATE_VISIT', $3)`,
      [req.user?.userId, patientId, req.ip]
    );

    res.status(201).json({ visit: result.rows[0] });
  } catch (err) {
    console.error('Create visit error:', err);
    res.status(500).json({ error: 'Failed to create visit record' });
  }
});

// Get visit history for patient
router.get('/patient/:patientId', authenticate, async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;
    const { limit = 30 } = req.query;

    const result = await query(
      `SELECT vh.*, u.first_name, u.last_name FROM visit_history vh
       JOIN users u ON vh.doctor_id = u.id
       WHERE vh.patient_id = $1 
       ORDER BY vh.visit_date DESC LIMIT $2`,
      [patientId, parseInt(limit as string)]
    );

    res.json({ visits: result.rows });
  } catch (err) {
    console.error('Get visit history error:', err);
    res.status(500).json({ error: 'Failed to fetch visit history' });
  }
});

// Get today's visits for doctor
router.get('/doctor/today', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT vh.*, p.first_name, p.last_name, p.patient_id FROM visit_history vh
       JOIN patients p ON vh.patient_id = p.id
       WHERE vh.doctor_id = $1 AND DATE(vh.visit_date) = DATE(NOW())
       ORDER BY vh.visit_date DESC`,
      [req.user?.userId]
    );

    res.json({ visits: result.rows });
  } catch (err) {
    console.error('Get today visits error:', err);
    res.status(500).json({ error: 'Failed to fetch today\'s visits' });
  }
});

export default router;
