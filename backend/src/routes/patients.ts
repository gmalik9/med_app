import { Router, Request, Response } from 'express';
import multer from 'multer';
import { query } from '../db';
import { authenticate } from '../middleware/auth';
import { processStickerImage } from '../services/stickerOcr';
import { parseStickerText } from '../services/stickerParser';

const router = Router();
const upload = multer({ limits: { fileSize: 8 * 1024 * 1024 } });

// Get all patients
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT p.id, p.patient_id, p.first_name, p.last_name, p.gender, p.dob, p.phone, p.email, p.allergies, p.medical_conditions, p.medications, p.is_active, p.created_at, p.updated_at,
              COALESCE((
                SELECT jsonb_agg(code)
                FROM (
                  SELECT jsonb_array_elements_text(cn.medical_codes) AS code
                  FROM clinical_notes cn
                  WHERE cn.patient_id = p.patient_id
                ) codes
              ), '[]'::jsonb) AS cumulative_medical_codes
       FROM patients
       p
       ORDER BY created_at DESC`
    );

    res.json({ patients: result.rows });
  } catch (err) {
    console.error('Get patients error:', err);
    res.status(500).json({ error: 'Failed to fetch patients' });
  }
});

// Activate/deactivate patient
router.patch('/:id/active', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ error: 'is_active must be a boolean' });
    }

    const result = await query(
      `UPDATE patients
       SET is_active = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING id, patient_id, first_name, last_name, is_active`,
      [id, is_active]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // Log audit trail
    await query(
      `INSERT INTO audit_log (user_id, patient_id, action, details, ip_address)
       VALUES ($1, $2, 'UPDATE_PATIENT_STATUS', $3, $4)`,
      [req.user?.userId, result.rows[0].patient_id, `Patient ${is_active ? 'activated' : 'deactivated'}`, req.ip]
    );

    res.json({
      patient: result.rows[0],
      message: `Patient ${is_active ? 'activated' : 'deactivated'} successfully`
    });
  } catch (err) {
    console.error('Update patient status error:', err);
    res.status(500).json({ error: 'Failed to update patient status' });
  }
});

// Search/get patient by ID
router.get('/search', authenticate, async (req: Request, res: Response) => {
  try {
    const { patientId } = req.query;

    if (!patientId) {
      return res.status(400).json({ error: 'Patient ID required' });
    }

    const result = await query(
      `SELECT p.id, p.patient_id, p.first_name, p.last_name, p.gender, p.dob, p.phone, p.email, p.allergies, p.medical_conditions, p.medications, p.is_active, p.created_at, p.updated_at,
              COALESCE((
                SELECT jsonb_agg(code)
                FROM (
                  SELECT jsonb_array_elements_text(cn.medical_codes) AS code
                  FROM clinical_notes cn
                  WHERE cn.patient_id = p.patient_id
                ) codes
              ), '[]'::jsonb) AS cumulative_medical_codes
       FROM patients p WHERE patient_id = $1`,
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

router.post('/scan-sticker', authenticate, upload.single('image'), async (req: Request, res: Response) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ error: 'Image file is required' });
    }

    const { text } = await processStickerImage(req.file.buffer);
    const parsed = parseStickerText(text);

    let patient = null;
    if (parsed.patientId) {
      const result = await query(
        `SELECT p.id, p.patient_id, p.first_name, p.last_name, p.gender, p.dob, p.phone, p.email, p.allergies, p.medical_conditions, p.medications, p.is_active, p.created_at, p.updated_at,
                COALESCE((
                  SELECT jsonb_agg(code)
                  FROM (
                    SELECT jsonb_array_elements_text(cn.medical_codes) AS code
                    FROM clinical_notes cn
                    WHERE cn.patient_id = p.patient_id
                  ) codes
                ), '[]'::jsonb) AS cumulative_medical_codes
         FROM patients p WHERE patient_id = $1`,
        [parsed.patientId]
      );
      patient = result.rows[0] || null;
    }

    await query(
      `INSERT INTO audit_log (user_id, patient_id, action, details, ip_address)
       VALUES ($1, $2, 'SCAN_PATIENT_STICKER', $3, $4)`,
      [req.user?.userId, parsed.patientId, JSON.stringify(parsed), req.ip]
    );

    res.json({
      text,
      parsed,
      exists: Boolean(patient),
      patient,
    });
  } catch (err) {
    console.error('Sticker scan error:', err);
    res.status(500).json({ error: 'Failed to process sticker image' });
  }
});

// Create new patient
router.post('/create', authenticate, async (req: Request, res: Response) => {
  try {
    const { patientId, firstName, lastName, gender, dob, phone, email } = req.body;

    if (!patientId) {
      return res.status(400).json({ error: 'Patient ID required' });
    }

    // Check if patient already exists
    const existing = await query('SELECT id FROM patients WHERE patient_id = $1', [patientId]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Patient already exists' });
    }

    const result = await query(
      `INSERT INTO patients (patient_id, first_name, last_name, gender, dob, phone, email, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, patient_id, first_name, last_name, gender, dob, phone, email`,
      [patientId, firstName || '', lastName || '', gender || '', dob || null, phone || '', email || '', req.user?.userId]
    );

    const patient = result.rows[0];

    // Log audit trail
    await query(
      `INSERT INTO audit_log (user_id, patient_id, action, ip_address)
       VALUES ($1, $2, 'CREATE_PATIENT', $3)`,
      [req.user?.userId, patient.patient_id, req.ip]
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
    const { firstName, lastName, gender, dob, phone, email, allergies, medicalConditions, medications } = req.body;

    const result = await query(
      `UPDATE patients 
       SET first_name = COALESCE($2, first_name),
           last_name = COALESCE($3, last_name),
           gender = COALESCE($4, gender),
           dob = COALESCE($5, dob),
           phone = COALESCE($6, phone),
           email = COALESCE($7, email),
           allergies = COALESCE($8, allergies),
           medical_conditions = COALESCE($9, medical_conditions),
           medications = COALESCE($10, medications),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, patient_id, first_name, last_name, gender, dob, phone, email, allergies, medical_conditions, medications, is_active, created_at, updated_at`,
      [id, firstName, lastName, gender, dob, phone, email, allergies, medicalConditions, medications]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // Log audit trail
    await query(
      `INSERT INTO audit_log (user_id, patient_id, action, ip_address)
       VALUES ($1, $2, 'UPDATE_PATIENT', $3)`,
      [req.user?.userId, result.rows[0].patient_id, req.ip]
    );

    const patientResult = await query(
      `SELECT p.id, p.patient_id, p.first_name, p.last_name, p.gender, p.dob, p.phone, p.email, p.allergies, p.medical_conditions, p.medications, p.is_active, p.created_at, p.updated_at,
              COALESCE((
                SELECT jsonb_agg(code)
                FROM (
                  SELECT jsonb_array_elements_text(cn.medical_codes) AS code
                  FROM clinical_notes cn
                  WHERE cn.patient_id = p.patient_id
                ) codes
              ), '[]'::jsonb) AS cumulative_medical_codes
       FROM patients p WHERE p.id = $1`,
      [id]
    );

    res.json({ patient: patientResult.rows[0] });
  } catch (err) {
    console.error('Update patient error:', err);
    res.status(500).json({ error: 'Failed to update patient' });
  }
});

// Get patient by ID
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const patientId = String(req.params.id);

    // Check if id is numeric (integer) or alphanumeric (patient_id string like "P001")
    const isNumeric = /^\d+$/.test(patientId);
    
    let result;
    if (isNumeric) {
      result = await query(
        `SELECT p.id, p.patient_id, p.first_name, p.last_name, p.gender, p.dob, p.phone, p.email, p.allergies, p.medical_conditions, p.medications, p.is_active, p.created_at, p.updated_at,
                COALESCE((
                  SELECT jsonb_agg(code)
                  FROM (
                    SELECT jsonb_array_elements_text(cn.medical_codes) AS code
                    FROM clinical_notes cn
                    WHERE cn.patient_id = p.patient_id
                  ) codes
                ), '[]'::jsonb) AS cumulative_medical_codes
         FROM patients p WHERE p.id = $1`,
        [parseInt(patientId)]
      );
    } else {
      result = await query(
        `SELECT p.id, p.patient_id, p.first_name, p.last_name, p.gender, p.dob, p.phone, p.email, p.allergies, p.medical_conditions, p.medications, p.is_active, p.created_at, p.updated_at,
                COALESCE((
                  SELECT jsonb_agg(code)
                  FROM (
                    SELECT jsonb_array_elements_text(cn.medical_codes) AS code
                    FROM clinical_notes cn
                    WHERE cn.patient_id = p.patient_id
                  ) codes
                ), '[]'::jsonb) AS cumulative_medical_codes
         FROM patients p WHERE p.patient_id = $1`,
        [patientId]
      );
    }

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
