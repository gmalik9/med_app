import { Router, Request, Response } from 'express';
import multer from 'multer';
import { query } from '../db';
import { authenticate } from '../middleware/auth';
import { safeDiagnostic } from '../middleware/safeAudit';
import { setResolvedAuditReference } from '../middleware/safeAuditMetadata';
import { processStickerImage } from '../services/stickerOcr';
import { parseStickerText } from '../services/stickerParser';
import { auditedWrite } from '../services/auditedWrite';
import { pagination, PaginationError } from '../utils/pagination';

const router = Router();
const upload = multer({ limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
  fileFilter: (_req, file, callback) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return callback(Object.assign(new Error('Unsupported image'), { status: 415 }));
    callback(null, true);
  },
});

// Get all patients
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const paging = pagination(req.query, { endpoint: 'patients.directory', nullableTimestamp: true }, 50, true);
    const { limit, offset } = paging;
    const result = await query(
      `SELECT p.id, p.patient_id, p.first_name, p.last_name, p.gender, p.dob, p.phone, p.email, p.allergies, p.medical_conditions, p.medications, p.is_active, p.created_at, p.updated_at,
              to_char(p.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US') AS _cursor_timestamp,
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
       WHERE ($4::integer IS NULL
         OR ($3::timestamp IS NULL AND (p.created_at IS NOT NULL OR p.id < $4))
         OR (p.created_at, p.id) < ($3::timestamp, $4::integer))
       ORDER BY p.created_at DESC NULLS FIRST, p.id DESC LIMIT $1 OFFSET $2`,
      [limit + 1, offset, paging.cursor?.t ?? null, paging.cursor?.id ?? null]
    );

    const { rows, ...metadata } = paging.page(result.rows);
    res.json({ patients: rows, ...metadata, limit, offset });
  } catch (err) {
    if (err instanceof PaginationError) return res.status(400).json({ error: err.message });
    safeDiagnostic(req, 'patients_list_failed');
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

    const result = await auditedWrite(req, 'UPDATE_PATIENT_STATUS',
      `UPDATE patients
       SET is_active = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING id, patient_id, first_name, last_name, is_active`,
      [id, is_active]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    res.json({
      patient: result.rows[0],
      message: `Patient ${is_active ? 'activated' : 'deactivated'} successfully`
    });
  } catch (err) {
    safeDiagnostic(req, 'patient_status_failed');
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
    setResolvedAuditReference(req, patient.patient_id, patient.id);
    res.json({ exists: true, patient });
  } catch (err) {
    safeDiagnostic(req, 'patient_search_failed');
    res.status(500).json({ error: 'Search failed' });
  }
});

router.post('/scan-sticker', authenticate, upload.single('image'), async (req: Request, res: Response, next) => {
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
      [req.user?.userId, patient?.patient_id ?? null, JSON.stringify({ matched: Boolean(patient), warningCount: parsed.confidenceWarnings.length }), req.ip]
    );

    res.json({
      text,
      parsed,
      exists: Boolean(patient),
      patient,
    });
  } catch (err) {
    safeDiagnostic(req, 'sticker_scan_failed');
    next(err);
  }
});

// Create new patient
router.post('/create', authenticate, async (req: Request, res: Response) => {
  try {
    const { patientId, firstName, lastName, gender, dob, phone, email, allergies, medicalConditions, medications } = req.body;

    if (!patientId) {
      return res.status(400).json({ error: 'Patient ID required' });
    }

    // Check if patient already exists
    const existing = await query('SELECT id FROM patients WHERE patient_id = $1', [patientId]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Patient already exists' });
    }

    const result = await auditedWrite(req, 'CREATE_PATIENT',
      `INSERT INTO patients (patient_id, first_name, last_name, gender, dob, phone, email, created_by, allergies, medical_conditions, medications)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [patientId, firstName || '', lastName || '', gender || '', dob || null, phone || '', email || '', req.user?.userId, allergies || '', medicalConditions || '', medications || '']
    );

    const patient = result.rows[0];

    res.status(201).json({ patient });
  } catch (err) {
    if ((err as { code?: string }).code === '23505') return res.status(409).json({ error: 'Patient already exists' });
    safeDiagnostic(req, 'patient_create_failed');
    res.status(500).json({ error: 'Failed to create patient' });
  }
});

// Update patient
router.put('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, gender, dob, phone, email, allergies, medicalConditions, medications } = req.body;

    const result = await auditedWrite(req, 'UPDATE_PATIENT',
      `UPDATE patients 
       SET first_name = COALESCE($2, first_name),
           last_name = COALESCE($3, last_name),
           gender = COALESCE($4, gender),
           dob = CASE WHEN $11 THEN $5::date ELSE dob END,
           phone = COALESCE($6, phone),
           email = COALESCE($7, email),
           allergies = COALESCE($8, allergies),
           medical_conditions = COALESCE($9, medical_conditions),
           medications = COALESCE($10, medications),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, patient_id, first_name, last_name, gender, dob, phone, email, allergies, medical_conditions, medications, is_active, created_at, updated_at`,
      [id, firstName, lastName, gender, dob, phone, email, allergies, medicalConditions, medications, Object.prototype.hasOwnProperty.call(req.body, 'dob')]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

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
    safeDiagnostic(req, 'patient_update_failed');
    res.status(500).json({ error: 'Failed to update patient' });
  }
});

// Get patient by ID
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const patientId = String(req.params.id);

    // Check if id is numeric (integer) or alphanumeric (patient_id string like "P001")
    const isNumeric = /^\d+$/.test(patientId);
    if (isNumeric && (!Number.isSafeInteger(Number(patientId)) || Number(patientId) > 2147483647)) {
      return res.status(400).json({ error: 'Invalid internal patient ID; use search for a numeric MRN' });
    }
    
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

    setResolvedAuditReference(req, result.rows[0].patient_id, result.rows[0].id);
    res.json({ patient: result.rows[0] });
  } catch (err) {
    safeDiagnostic(req, 'patient_read_failed');
    res.status(500).json({ error: 'Failed to fetch patient' });
  }
});

export default router;
