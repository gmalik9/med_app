import { Router, Request, Response } from 'express';
import { query } from '../db';
import { authenticate } from '../middleware/auth';

const router = Router();

// Get analytics dashboard for doctor
router.get('/dashboard', authenticate, async (req: Request, res: Response) => {
  try {
    const doctorId = req.user?.userId;

    // Total patients treated
    const patientsResult = await query(
      `SELECT COUNT(DISTINCT patient_id) as count FROM clinical_notes WHERE doctor_id = $1`,
      [doctorId]
    );

    // Notes created this month
    const notesThisMonthResult = await query(
      `SELECT COUNT(*) as count FROM clinical_notes 
       WHERE doctor_id = $1 AND EXTRACT(MONTH FROM note_date) = EXTRACT(MONTH FROM NOW())
       AND EXTRACT(YEAR FROM note_date) = EXTRACT(YEAR FROM NOW())`,
      [doctorId]
    );

    // Appointments today
    const appointmentsResult = await query(
      `SELECT COUNT(*) as count FROM appointments 
       WHERE doctor_id = $1 AND DATE(appointment_date) = DATE(NOW()) AND status = 'scheduled'`,
      [doctorId]
    );

    // Recent activity
    const recentActivityResult = await query(
      `SELECT action, COUNT(*) as count FROM audit_log 
       WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '7 days'
       GROUP BY action
       ORDER BY count DESC LIMIT 10`,
      [doctorId]
    );

    res.json({
      stats: {
        totalPatients: parseInt(patientsResult.rows[0]?.count || 0),
        notesThisMonth: parseInt(notesThisMonthResult.rows[0]?.count || 0),
        appointmentsToday: parseInt(appointmentsResult.rows[0]?.count || 0),
        recentActivity: recentActivityResult.rows
      }
    });
  } catch (err) {
    console.error('Get analytics error:', err);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Get patient trends
router.get('/patient/:patientId/trends', authenticate, async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;

    // Vital signs trend
    const vitalsResult = await query(
      `SELECT recorded_date, temperature, heart_rate, oxygen_saturation 
       FROM vital_signs WHERE patient_id = $1 
       ORDER BY recorded_date DESC LIMIT 10`,
      [patientId]
    );

    // Visit frequency
    const visitResult = await query(
      `SELECT COUNT(*) as count, 
              DATE_TRUNC('month', visit_date) as month 
       FROM visit_history WHERE patient_id = $1 
       GROUP BY DATE_TRUNC('month', visit_date)
       ORDER BY month DESC LIMIT 12`,
      [patientId]
    );

    res.json({
      trends: {
        vitals: vitalsResult.rows,
        visitFrequency: visitResult.rows
      }
    });
  } catch (err) {
    console.error('Get patient trends error:', err);
    res.status(500).json({ error: 'Failed to fetch patient trends' });
  }
});

// Log analytics event
router.post('/event', authenticate, async (req: Request, res: Response) => {
  try {
    const { eventType, eventData } = req.body;

    await query(
      `INSERT INTO analytics_events (doctor_id, event_type, event_data, event_date)
       VALUES ($1, $2, $3, NOW())`,
      [req.user?.userId, eventType, JSON.stringify(eventData)]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Log analytics error:', err);
    res.status(500).json({ error: 'Failed to log event' });
  }
});

export default router;
