import { query } from './index';
import * as bcrypt from 'bcryptjs';

export async function seedDatabase() {
  try {
    console.log('🌱 Seeding database with dummy data...');

    // Create a doctor
    const doctorEmail = 'doctor@hospital.com';
    const doctorPassword = 'SecurePass123!';
    const hashedPassword = await bcrypt.hash(doctorPassword, 12);

    const doctorResult = await query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, specialty, license_number, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (email) DO UPDATE SET is_active = true
       RETURNING id`,
      [doctorEmail, hashedPassword, 'Dr.', 'Smith', 'doctor', 'General Medicine', 'LIC123456', true]
    );

    const doctorId = doctorResult.rows[0]?.id;
    console.log('✓ Doctor created/updated:', doctorEmail);

    // Create some patients
    const patients = [
      { patient_id: 'P001', firstName: 'John', lastName: 'Doe', dob: '1990-01-15' },
      { patient_id: 'P002', firstName: 'Jane', lastName: 'Smith', dob: '1985-05-20' },
      { patient_id: 'P003', firstName: 'Robert', lastName: 'Johnson', dob: '1975-12-10' },
    ];

    const patientIds: string[] = [];

    for (const p of patients) {
      const pResult = await query(
        `INSERT INTO patients (patient_id, first_name, last_name, dob, phone, email, allergies, medical_conditions, medications, created_by, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (patient_id) DO UPDATE SET is_active = true
         RETURNING patient_id`,
        [
          p.patient_id,
          p.firstName,
          p.lastName,
          p.dob,
          '555-0100',
          `${p.patient_id.toLowerCase()}@email.com`,
          'Penicillin',
          'Hypertension',
          'Lisinopril 10mg',
          doctorId,
          true,
        ]
      );
      patientIds.push(pResult.rows[0].patient_id);
      console.log('✓ Patient created:', p.patient_id);
    }

    // Create clinical notes for each patient
    for (let i = 0; i < patientIds.length; i++) {
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

      const noteResult = await query(
        `INSERT INTO clinical_notes (patient_id, doctor_id, note_date, note_text, note_type, diagnosis, treatment_plan, followup_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (patient_id, doctor_id, note_date) DO UPDATE SET note_text = EXCLUDED.note_text
         RETURNING id`,
        [
          patientIds[i],
          doctorId,
          today,
          `Patient presents with routine follow-up. Vital signs stable. Continue current medications. Next visit in 2 weeks.`,
          'general',
          'Hypertension - controlled',
          'Continue Lisinopril 10mg daily',
          new Date(Date.now() + 1209600000).toISOString().split('T')[0],
        ]
      );
      console.log('✓ Clinical note created for patient:', patients[i].patient_id);

      // Create a previous note
      await query(
        `INSERT INTO clinical_notes (patient_id, doctor_id, note_date, note_text, note_type, diagnosis, treatment_plan)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (patient_id, doctor_id, note_date) DO UPDATE SET note_text = EXCLUDED.note_text`,
        [
          patientIds[i],
          doctorId,
          yesterday,
          `Follow-up visit. Patient reports feeling better. Blood pressure readings stable over past week.`,
          'general',
          'Hypertension - controlled',
          'Continue current treatment plan',
        ]
      );
    }

    // Create appointments
    for (let i = 0; i < patientIds.length; i++) {
      const appointmentDate = new Date(Date.now() + i * 86400000 + 86400000).toISOString();

      await query(
        `INSERT INTO appointments (patient_id, doctor_id, appointment_date, appointment_type, status, reason)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [patientIds[i], doctorId, appointmentDate, 'Check-up', 'scheduled', `Routine ${patients[i].patient_id} visit`]
      );
    }
    console.log('✓ Appointments created');

    // Create visits
    for (let i = 0; i < patientIds.length; i++) {
      const visitDate = new Date(Date.now() + i * 43200000).toISOString();
      const nextVisitDate = new Date(Date.now() + (i + 14) * 86400000).toISOString().split('T')[0];

      await query(
        `INSERT INTO visit_history (patient_id, doctor_id, visit_date, visit_type, chief_complaint, diagnosis, treatment_provided, followup_instructions, next_visit_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT DO NOTHING`,
        [
          patientIds[i],
          doctorId,
          visitDate,
          'Routine Visit',
          'Regular checkup',
          'Hypertension - controlled, otherwise healthy',
          'Blood pressure medication review, lifestyle counseling',
          'Continue current medications, increase water intake, reduce salt',
          nextVisitDate,
        ]
      );
    }
    console.log('✓ Visit history created');

    // Create templates
    const templates = [
      { name: 'Hypertension Follow-up', category: 'Cardiology', text: 'BP readings: __ systolic / __ diastolic. Current meds: Lisinopril 10mg. Patient reports compliance. Continue current regimen.' },
      { name: 'Routine Checkup', category: 'General', text: 'Patient presents for routine examination. Vitals within normal limits. No acute concerns. Preventive care discussed.' },
      { name: 'Diabetes Management', category: 'Endocrinology', text: 'Blood glucose levels: __. A1C: __. Patient diet adherence: Good/Fair/Poor. Adjust medications as needed.' },
    ];

    for (const t of templates) {
      await query(
        `INSERT INTO note_templates (creator_id, template_name, template_category, template_text, is_public, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [doctorId, t.name, t.category, t.text, true, true]
      );
    }
    console.log('✓ Note templates created');

    // Create analytics events
    await query(
      `INSERT INTO analytics_events (doctor_id, event_type, event_data)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [doctorId, 'login', JSON.stringify({ timestamp: new Date().toISOString() })]
    );
    console.log('✓ Analytics events created');

    console.log('\n✅ Database seeding completed successfully!\n');
    console.log('Test Account:');
    console.log('  Email: doctor@hospital.com');
    console.log('  Password: SecurePass123!');
    console.log('\nTest Patients:');
    console.log('  P001: John Doe');
    console.log('  P002: Jane Smith');
    console.log('  P003: Robert Johnson');
  } catch (err) {
    console.error('Error seeding database:', err);
    throw err;
  }
}
