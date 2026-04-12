import { Router, Request, Response } from 'express';
import { query } from '../db';
import { authenticate } from '../middleware/auth';

const router = Router();

// Search/get patient by ID
router.get('/search', authenticate, async (req: Request, res: Response) => {
  try {
    const { patientId } = req.query;

    if (!patientId) {
      return res.status(400).json({ error: 'Patient ID required' });
    }

    const result = await query(
      `SELECT id, patient_id, first_name, last_name, dob, phone, email, allergies, medical_conditions, medications
       FROM patients WHERE patient_id = $1`,
      [patientId]
    );

    if (result.rows.length === 0) {
      return res.json({ exists: false, patient: null });
    }

    const patient = result.rows[0];
    res.json({ exists: true, patient });
  } catch (err) {
    console.error('Patient search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Create new patient
router.post('/create', authenticate, async (req: Request, res: Response) => {
  try {
    const { patientId, firstName, lastName, dob, phone, email } = req.body;

    if (!patientId) {
      return res.status(400).json({ error: 'Patient ID required' });
    }

    // Check if patient already exists
    const existing = await query('SELECT id FROM patients WHERE patient_id = $1', [patientId]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Patient already exists' });
    }

    const result = await query(
      `INSERT INTO patients (patient_id, first_name, last_name, dob, phone, email, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, patient_id, first_name, last_name, dob, phone, email`,
      [patientId, firstName || '', lastName || '', dob || null, phone || '', email || '', req.user?.userId]
    );

    const patient = result.rows[0];

    // Log audit trail
    await query(
      `INSERT INTO audit_log (user_id, patient_id, action, ip_address)
       VALUES ($1, $2, 'CREATE_PATIENT', $3)`,
      [req.user?.userId, patient.id, req.ip]
    );

    res.status(201).json({ patient });
  } catch (err) {
    console.error('Create patient error:', err);
    res.status(500).json({ error: 'Failed to create patient' });
  }
});

// Update patient
router.put('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, dob, phone, email, allergies, medicalConditions, medications } = req.body;

    const result = await query(
      `UPDATE patients 
       SET first_name = COALESCE($2, first_name),
           last_name = COALESCE($3, last_name),
           dob = COALESCE($4, dob),
           phone = COALESCE($5, phone),
           email = COALESCE($6, email),
           allergies = COALESCE($7, allergies),
           medical_conditions = COALESCE($8, medical_conditions),
           medications = COALESCE($9, medications),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, patient_id, first_name, last_name, dob, phone, email, allergies, medical_conditions, medications`,
      [id, firstName, lastName, dob, phone, email, allergies, medicalConditions, medications]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // Log audit trail
    await query(
      `INSERT INTO audit_log (user_id, patient_id, action, ip_address)
       VALUES ($1, $2, 'UPDATE_PATIENT', $3)`,
      [req.user?.userId, id, req.ip]
    );

    res.json({ patient: result.rows[0] });
  } catch (err) {
    console.error('Update patient error:', err);
    res.status(500).json({ error: 'Failed to update patient' });
  }
});

// Get patient by ID
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT id, patient_id, first_name, last_name, dob, phone, email, allergies, medical_conditions, medications, created_at, updated_at
       FROM patients WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    res.json({ patient: result.rows[0] });
  } catch (err) {
    console.error('Get patient error:', err);
    res.status(500).json({ error: 'Failed to fetch patient' });
  }
});

export default router;
