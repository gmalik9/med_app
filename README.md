# 🏥 Medical Notes - Secure Patient Records System

A secure, mobile-first web application for healthcare professionals to manage patient records and clinical notes with emphasis on security, privacy, and compliance.

## Features

### Core (MVP)
- 🔐 **Secure Authentication** - JWT-based auth with token refresh
- 👤 **Patient Management** - Search, create, and edit patient records
- 📝 **Clinical Notes** - Daily note entry with date selection
- 🔒 **Encrypted Storage** - All sensitive data encrypted at rest
- 📊 **Audit Logging** - Track all access and modifications
- 📱 **Mobile-First** - Responsive design optimized for mobile browsers

### Phase 2 (Planned)
- Patient demographics and medical history
- Visit tracking and appointment scheduling
- Allergies and medications management
- Vital signs tracking
- Session timeout and auto-logout
- Multi-user role management

### Phase 3 (Planned)
- Note templates for common conditions
- Export to PDF/print functionality
- Advanced analytics dashboard
- Backup & disaster recovery
- Data retention policies

## Security Features

✅ **Authentication & Authorization**
- JWT token-based authentication (15min expiry)
- Refresh tokens with 7-day expiry
- Role-based access control (RBAC)
- Session management with timeout

✅ **Data Protection**
- SSL/TLS for all transport
- AES-256 encryption for sensitive fields
- Bcryptjs password hashing (salt rounds: 12)
- Encrypted database backups

✅ **Compliance & Audit**
- Complete audit trail of all access
- No sensitive data in logs
- Session timeout on inactivity
- CORS protection

## Tech Stack

**Frontend**
- React 18 + TypeScript
- Vite (build tool)
- Axios (HTTP client)
- CSS-in-JS (inline styles)

**Backend**
- Node.js + Express
- TypeScript
- PostgreSQL
- JWT (authentication)
- bcryptjs (password hashing)

## Getting Started

### Prerequisites
- Node.js 16+
- PostgreSQL 12+
- npm or yarn

### Installation

1. **Clone the repository**
```bash
cd med_app
```

2. **Setup Backend**
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your settings (especially DATABASE_URL and JWT secrets)
npm run dev
```

3. **Setup Frontend**
```bash
cd ../frontend
npm install
npm run dev
```

4. **Access the app**
- Frontend: http://localhost:5173
- Backend API: http://localhost:5000

### Environment Configuration

**Backend (.env)**
```
PORT=5000
DATABASE_URL=postgresql://user:password@localhost:5432/med_app_db
JWT_SECRET=change_me_to_a_secure_key
JWT_REFRESH_SECRET=change_me_to_another_secure_key
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
SESSION_TIMEOUT_MINUTES=15
```

**Frontend (.env)**
```
VITE_API_URL=http://localhost:5000
```

## Database Setup

The backend automatically creates the necessary tables on startup. Ensure PostgreSQL is running and the connection string is correct.

### Schema
- **users** - Doctor/admin accounts
- **patients** - Patient records
- **clinical_notes** - Daily notes per patient per doctor
- **audit_log** - Access tracking
- **sessions** - Active user sessions

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new doctor
- `POST /api/auth/login` - Login
- `POST /api/auth/refresh` - Refresh access token

### Patients
- `GET /api/patients/search` - Search by patient ID
- `POST /api/patients/create` - Create new patient
- `GET /api/patients/:id` - Get patient details
- `PUT /api/patients/:id` - Update patient

### Notes
- `GET /api/notes/patient/:patientId` - Get today's note
- `POST /api/notes/patient/:patientId` - Create/update note
- `GET /api/notes/patient/:patientId/history` - Get note history

## Security Best Practices

1. **Never commit .env files** - Use .env.example as template
2. **Rotate JWT secrets regularly** in production
3. **Use strong passwords** for database and JWT secrets
4. **Enable HTTPS** in production (use reverse proxy like nginx)
5. **Implement rate limiting** on login endpoint
6. **Regular security audits** and dependency updates
7. **Database backups** encrypted and stored securely
8. **Monitor audit logs** for suspicious activity

## Development

### Running Tests
```bash
# Backend
cd backend
npm test

# Frontend
cd ../frontend
npm test
```

### Building for Production
```bash
# Backend
cd backend
npm run build

# Frontend
cd ../frontend
npm run build
```

## Troubleshooting

### Database Connection Issues
- Ensure PostgreSQL is running
- Check DATABASE_URL in .env
- Verify database user has necessary permissions

### CORS Errors
- Check ALLOWED_ORIGINS in backend .env
- Ensure frontend URL matches allowed origins

### JWT Token Errors
- Verify JWT_SECRET is set correctly
- Check token expiration
- Try refreshing the token

## Contributing

This is a medical application. Any changes should:
1. Maintain security standards
2. Include audit logging
3. Preserve patient privacy
4. Be thoroughly tested

## License

MIT

## Support

For issues or questions, please refer to the documentation or create an issue in the repository.

---

**⚠️ Important**: This application handles sensitive medical data. Ensure you comply with all applicable healthcare regulations (HIPAA, GDPR, etc.) in your jurisdiction before deployment.
