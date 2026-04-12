# API Documentation

## Base URL
```
http://localhost:5000/api
```

## Authentication
All endpoints (except `/auth/register` and `/auth/login`) require a bearer token in the Authorization header:

```
Authorization: Bearer <access_token>
```

---

## Auth Endpoints

### Register
**POST** `/auth/register`

Create a new doctor/user account.

**Request Body:**
```json
{
  "email": "doctor@example.com",
  "password": "secure_password",
  "firstName": "John",
  "lastName": "Doe"
}
```

**Response (201):**
```json
{
  "user": {
    "id": 1,
    "email": "doctor@example.com",
    "role": "doctor"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

### Login
**POST** `/auth/login`

Authenticate doctor and get tokens.

**Request Body:**
```json
{
  "email": "doctor@example.com",
  "password": "secure_password"
}
```

**Response (200):**
```json
{
  "user": {
    "id": 1,
    "email": "doctor@example.com",
    "role": "doctor"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

### Refresh Token
**POST** `/auth/refresh`

Get a new access token using refresh token.

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response (200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

---

## Patient Endpoints

### Search Patient
**GET** `/patients/search?patientId=P001`

Search for a patient by ID.

**Query Parameters:**
- `patientId` (required): Patient identifier

**Response (200):**
```json
{
  "exists": true,
  "patient": {
    "id": 1,
    "patient_id": "P001",
    "first_name": "Jane",
    "last_name": "Smith",
    "dob": "1990-01-15",
    "phone": "555-1234",
    "email": "jane@example.com",
    "allergies": "Penicillin, Shellfish",
    "medical_conditions": "Asthma, Hypertension",
    "medications": "Albuterol, Lisinopril",
    "created_at": "2024-01-10T10:00:00Z",
    "updated_at": "2024-01-10T10:00:00Z"
  }
}
```

If patient doesn't exist:
```json
{
  "exists": false,
  "patient": null
}
```

### Create Patient
**POST** `/patients/create`

Create a new patient record.

**Request Body:**
```json
{
  "patientId": "P001",
  "firstName": "Jane",
  "lastName": "Smith"
}
```

**Response (201):**
```json
{
  "patient": {
    "id": 1,
    "patient_id": "P001",
    "first_name": "Jane",
    "last_name": "Smith",
    "dob": null,
    "phone": "",
    "email": ""
  }
}
```

### Get Patient
**GET** `/patients/:id`

Get full patient details by internal ID.

**Response (200):**
```json
{
  "patient": {
    "id": 1,
    "patient_id": "P001",
    "first_name": "Jane",
    "last_name": "Smith",
    "dob": "1990-01-15",
    "phone": "555-1234",
    "email": "jane@example.com",
    "allergies": "Penicillin",
    "medical_conditions": "Asthma",
    "medications": "Albuterol",
    "created_at": "2024-01-10T10:00:00Z",
    "updated_at": "2024-01-10T10:00:00Z"
  }
}
```

### Update Patient
**PUT** `/patients/:id`

Update patient information.

**Request Body (all fields optional):**
```json
{
  "firstName": "Jane",
  "lastName": "Smith",
  "dob": "1990-01-15",
  "phone": "555-1234",
  "email": "jane@example.com",
  "allergies": "Penicillin, Shellfish",
  "medicalConditions": "Asthma, Hypertension",
  "medications": "Albuterol, Lisinopril"
}
```

**Response (200):**
```json
{
  "patient": {
    "id": 1,
    "patient_id": "P001",
    "first_name": "Jane",
    "last_name": "Smith",
    ...
  }
}
```

---

## Notes Endpoints

### Get Today's Note
**GET** `/notes/patient/:patientId`

Get the clinical note for a specific date (default today).

**Query Parameters:**
- `date` (optional): Date in YYYY-MM-DD format (defaults to today)

**Response (200) - Note exists:**
```json
{
  "exists": true,
  "note": {
    "id": 1,
    "patient_id": 1,
    "doctor_id": 1,
    "note_date": "2024-01-10",
    "note_text": "Patient presenting with...",
    "created_at": "2024-01-10T14:30:00Z",
    "updated_at": "2024-01-10T14:30:00Z"
  }
}
```

**Response (200) - Note doesn't exist:**
```json
{
  "exists": false,
  "note": null
}
```

### Save Note
**POST** `/notes/patient/:patientId`

Create or update a clinical note.

**Request Body:**
```json
{
  "noteText": "Patient presenting with persistent cough. Vitals stable. Prescribed antibiotics. Follow-up in 3 days.",
  "date": "2024-01-10"
}
```

**Response (200/201):**
```json
{
  "note": {
    "id": 1,
    "patient_id": 1,
    "doctor_id": 1,
    "note_date": "2024-01-10",
    "note_text": "Patient presenting with...",
    "created_at": "2024-01-10T14:30:00Z",
    "updated_at": "2024-01-10T14:35:00Z"
  }
}
```

### Get Note History
**GET** `/notes/patient/:patientId/history`

Get all clinical notes for a patient.

**Query Parameters:**
- `limit` (optional): Maximum number of notes to return (default: 30)

**Response (200):**
```json
{
  "notes": [
    {
      "id": 5,
      "patient_id": 1,
      "doctor_id": 1,
      "note_date": "2024-01-10",
      "note_text": "Follow-up note...",
      "created_at": "2024-01-10T14:30:00Z",
      "updated_at": "2024-01-10T14:30:00Z",
      "first_name": "John",
      "last_name": "Doe",
      "email": "doctor@example.com"
    },
    {
      "id": 4,
      "patient_id": 1,
      "doctor_id": 1,
      "note_date": "2024-01-09",
      "note_text": "Initial assessment...",
      "created_at": "2024-01-09T10:00:00Z",
      "updated_at": "2024-01-09T10:00:00Z",
      "first_name": "John",
      "last_name": "Doe",
      "email": "doctor@example.com"
    }
  ]
}
```

---

## Error Responses

### 400 Bad Request
```json
{
  "error": "Email and password required"
}
```

### 401 Unauthorized
```json
{
  "error": "Invalid credentials"
}
```

```json
{
  "error": "No authorization token"
}
```

### 404 Not Found
```json
{
  "error": "Patient not found"
}
```

### 409 Conflict
```json
{
  "error": "Patient already exists"
}
```

### 500 Internal Server Error
```json
{
  "error": "Registration failed"
}
```

---

## Rate Limiting

Currently not implemented in this version. Recommended for production:
- Login: 5 attempts per 15 minutes per IP
- API: 100 requests per minute per token

---

## Pagination

Currently, note history is limited to 30 most recent notes. Use `limit` parameter to adjust:

```
GET /api/notes/patient/1/history?limit=50
```

---

## Timestamps

All timestamps are in ISO 8601 format (UTC):
```
2024-01-10T14:30:45Z
```

---

## Example: Complete Workflow

### 1. Register
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "doctor@example.com",
    "password": "secure123",
    "firstName": "John",
    "lastName": "Doe"
  }'
```

### 2. Search for Patient
```bash
curl -X GET "http://localhost:5000/api/patients/search?patientId=P001" \
  -H "Authorization: Bearer <access_token>"
```

### 3. Create Patient (if doesn't exist)
```bash
curl -X POST http://localhost:5000/api/patients/create \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "patientId": "P001",
    "firstName": "Jane",
    "lastName": "Smith"
  }'
```

### 4. Update Patient
```bash
curl -X PUT http://localhost:5000/api/patients/1 \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "555-1234",
    "email": "jane@example.com",
    "allergies": "Penicillin"
  }'
```

### 5. Save Note
```bash
curl -X POST http://localhost:5000/api/notes/patient/1 \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "noteText": "Patient exam completed. Everything normal.",
    "date": "2024-01-10"
  }'
```

### 6. Get Note History
```bash
curl -X GET "http://localhost:5000/api/notes/patient/1/history?limit=10" \
  -H "Authorization: Bearer <access_token>"
```

---

## Security Notes

1. **Tokens expire in 15 minutes** - Use refresh token to get a new access token
2. **All endpoints are logged** - Audit trail includes user, action, timestamp, IP
3. **Passwords are hashed** with bcryptjs (12 salt rounds)
4. **CORS is enforced** - Only requests from configured origins are accepted
5. **All data is encrypted** in transit (HTTPS recommended for production)

---

## Troubleshooting

### 401 Unauthorized
- Token may have expired - use refresh endpoint
- Token may be invalid - re-authenticate
- Token format should be: `Bearer <token>`

### 404 Not Found
- Patient ID (internal ID) may be wrong
- Patient may not exist - check with search endpoint

### 409 Conflict
- Patient ID already exists - use different ID
- Each note can only be saved once per doctor per day

### CORS Error
- Check `ALLOWED_ORIGINS` in backend .env
- Add your frontend URL to the list
