import { Router, Request, Response } from 'express';
import { query } from '../db';
import { authenticate } from '../middleware/auth';

const router = Router();

// Record vital signs
router.post('/patient/:patientId', authenticate, async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;
    const { temperature, heartRate, bloodPressureSystolic, bloodPressureDiastolic, respiratoryRate, oxygenSaturation, weight, height, notes } = req.body;

    // Verify patient exists
    const patientResult = await query('SELECT patient_id FROM patients WHERE patient_id = $1', [patientId]);
    if (patientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const result = await query(
      `INSERT INTO vital_signs (patient_id, recorded_by, recorded_date, temperature, heart_rate, 
       blood_pressure_systolic, blood_pressure_diastolic, respiratory_rate, oxygen_saturation, weight, height, notes)
       VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [patientId, req.user?.userId, temperature, heartRate, bloodPressureSystolic, bloodPressureDiastolic, 
       respiratoryRate, oxygenSaturation, weight, height, notes]
    );

    // Log audit
    await query(
      `INSERT INTO audit_log (user_id, patient_id, action, ip_address)
       VALUES ($1, $2, 'RECORD_VITALS', $3)`,
      [req.user?.userId, patientId, req.ip]
    );

    res.status(201).json({ vitalSigns: result.rows[0] });
  } catch (err) {
    console.error('Record vitals error:', err);
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
    console.error('Get vitals error:', err);
    res.status(500).json({ error: 'Failed to fetch vital signs' });
  }
});

// Get vital signs history
router.get('/patient/:patientId/history', authenticate, async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;
    const { limit = 50 } = req.query;

    const result = await query(
      `SELECT * FROM vital_signs WHERE patient_id = $1 
       ORDER BY recorded_date DESC LIMIT $2`,
      [patientId, parseInt(limit as string)]
    );

    res.json({ vitalSigns: result.rows });
  } catch (err) {
    console.error('Get vitals history error:', err);
    res.status(500).json({ error: 'Failed to fetch vital signs history' });
  }
});

export default router;
