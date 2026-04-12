import { query } from './index';

export async function initializeDatabase() {
  try {
    console.log('Initializing database schema...');

    // Create users table
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        role VARCHAR(50) DEFAULT 'doctor',
        specialty VARCHAR(255),
        license_number VARCHAR(255),
        phone VARCHAR(20),
        bio TEXT,
        is_active BOOLEAN DEFAULT true,
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Add missing columns to existing users table if needed
    await query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS phone VARCHAR(20)
    `);
    
    await query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS bio TEXT
    `);

    // Create patients table
    await query(`
      CREATE TABLE IF NOT EXISTS patients (
        id SERIAL PRIMARY KEY,
        patient_id VARCHAR(50) UNIQUE NOT NULL,
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        gender VARCHAR(50),
        dob DATE,
        phone VARCHAR(20),
        email VARCHAR(255),
        address TEXT,
        allergies TEXT,
        medical_conditions TEXT,
        medications TEXT,
        emergency_contact VARCHAR(255),
        emergency_phone VARCHAR(20),
        created_by INTEGER REFERENCES users(id),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      ALTER TABLE patients
      ADD COLUMN IF NOT EXISTS gender VARCHAR(50)
    `);

    // Create clinical_notes table
    await query(`
      CREATE TABLE IF NOT EXISTS clinical_notes (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        doctor_id INTEGER NOT NULL REFERENCES users(id),
        note_date DATE NOT NULL,
        note_text TEXT,
        medical_codes JSONB DEFAULT '[]'::jsonb,
        note_type VARCHAR(50) DEFAULT 'general',
        diagnosis TEXT,
        treatment_plan TEXT,
        followup_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(patient_id, doctor_id, note_date)
      )
    `);

    await query(`
      ALTER TABLE clinical_notes
      ADD COLUMN IF NOT EXISTS medical_codes JSONB DEFAULT '[]'::jsonb
    `);

    // Create vital_signs table (Phase 2)
    await query(`
      CREATE TABLE IF NOT EXISTS vital_signs (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        recorded_by INTEGER NOT NULL REFERENCES users(id),
        recorded_date TIMESTAMP NOT NULL,
        temperature DECIMAL(5,2),
        heart_rate INTEGER,
        blood_pressure_systolic INTEGER,
        blood_pressure_diastolic INTEGER,
        respiratory_rate INTEGER,
        oxygen_saturation DECIMAL(5,2),
        weight DECIMAL(7,2),
        height DECIMAL(5,2),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create appointments table (Phase 2)
    await query(`
      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        doctor_id INTEGER NOT NULL REFERENCES users(id),
        appointment_date TIMESTAMP NOT NULL,
        appointment_type VARCHAR(100),
        status VARCHAR(50) DEFAULT 'scheduled',
        reason TEXT,
        notes TEXT,
        reminder_sent BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create visit_history table (Phase 2)
    await query(`
      CREATE TABLE IF NOT EXISTS visit_history (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        doctor_id INTEGER NOT NULL REFERENCES users(id),
        visit_date TIMESTAMP NOT NULL,
        visit_type VARCHAR(50),
        chief_complaint TEXT,
        diagnosis TEXT,
        treatment_provided TEXT,
        followup_instructions TEXT,
        next_visit_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create note_templates table (Phase 3)
    await query(`
      CREATE TABLE IF NOT EXISTS note_templates (
        id SERIAL PRIMARY KEY,
        creator_id INTEGER NOT NULL REFERENCES users(id),
        template_name VARCHAR(255) NOT NULL,
        template_category VARCHAR(100),
        template_text TEXT,
        is_public BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create data_retention table (Phase 3)
    await query(`
      CREATE TABLE IF NOT EXISTS data_retention (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        retention_until DATE,
        reason VARCHAR(255),
        auto_delete BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create analytics_events table (Phase 3)
    await query(`
      CREATE TABLE IF NOT EXISTS analytics_events (
        id SERIAL PRIMARY KEY,
        doctor_id INTEGER REFERENCES users(id),
        event_type VARCHAR(100),
        event_data JSONB,
        event_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create audit_log table
    await query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        patient_id INTEGER REFERENCES patients(id),
        action VARCHAR(100),
        details TEXT,
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create sessions table
    await query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        refresh_token_hash VARCHAR(255),
        ip_address VARCHAR(45),
        user_agent TEXT,
        expires_at TIMESTAMP,
        last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for performance
    await query(`CREATE INDEX IF NOT EXISTS idx_patients_patient_id ON patients(patient_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_clinical_notes_patient_id ON clinical_notes(patient_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_clinical_notes_doctor_id ON clinical_notes(doctor_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_clinical_notes_date ON clinical_notes(note_date)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_vital_signs_patient_id ON vital_signs(patient_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_vital_signs_date ON vital_signs(recorded_date)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_appointments_patient_id ON appointments(patient_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_visit_history_patient_id ON visit_history(patient_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_visit_history_date ON visit_history(visit_date)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_audit_log_patient_id ON audit_log(patient_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`);

    console.log('Database schema initialized successfully');
  } catch (err) {
    console.error('Error initializing database:', err);
    throw err;
  }
}
