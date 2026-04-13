# Clinical Notes Date Fix - Timezone and Patient ID Issues

## Problems Fixed

### 1. Dates Off by 1 Day (Timezone Issue)
**Problem**: When creating a clinical note, the note_date shown in history was 1 day behind the created_at timestamp.
- Created at: 2026-04-13 17:00:00 (shown correctly)
- Note date: 2026-04-12 (shown as yesterday!)

**Root Cause**: The `normalizeDateInput()` function was using `.toISOString()` to get the date:
```javascript
// WRONG - converts local time to UTC first
const today = new Date();  // e.g., 2026-04-13 17:00 local time
return today.toISOString().split('T')[0];  // might return 2026-04-14 or 2026-04-12 depending on timezone!
```

When you're in a timezone behind UTC (e.g., EST -5), your local 17:00 converts to 22:00 UTC (tomorrow). When you're ahead of UTC, the opposite happens.

**Fix**: Use local date components instead:
```javascript
// CORRECT - uses local date
const today = new Date();
const year = today.getFullYear();
const month = String(today.getMonth() + 1).padStart(2, '0');
const day = String(today.getDate()).padStart(2, '0');
return `${year}-${month}-${day}`;  // Always returns correct LOCAL date
```

### 2. Patient ID Type Mismatch
**Problem**: Creating a clinical note failed with "invalid input syntax for type integer: P001"

**Root Cause**: The API endpoint receives `patientId` as a string (e.g., "P001"), but the database stores:
- `patients.id` - INTEGER (auto-increment, e.g., 1, 2, 3)
- `patients.patient_id` - VARCHAR (string ID, e.g., "P001", "P002")
- `clinical_notes.patient_id` - INTEGER (references patients.id)

The code was directly using the string "P001" when it should have looked up the integer ID first.

**Fix**: Look up the integer ID first:
```javascript
// Get the integer ID from the patient_id string
const patientResult = await query(
  'SELECT id FROM patients WHERE patient_id = $1', 
  [patientId]  // "P001"
);
const patientDbId = patientResult.rows[0].id;  // 1

// Use the integer ID for database queries
INSERT INTO clinical_notes (patient_id, ...) VALUES ($1, ...)
// where $1 = patientDbId (1, not "P001")
```

## Results

### Before Fix
```
API Request:  POST /api/notes/patient/P001
Body:         { noteText: "...", noteDate not specified }
Result:       ERROR - "Failed to save note"
               Database Error: invalid input syntax for type integer
```

### After Fix
```
API Request:  POST /api/notes/patient/P001
Body:         { noteText: "..." }
Result:       ✓ Success
{
  "note": {
    "id": 1,
    "patient_id": 1,
    "note_date": "2026-04-13",      ← Correct date!
    "created_at": "2026-04-13T16:59:23.020Z",  ← Correct timestamp!
    "note_text": "..."
  }
}
```

## Files Modified

**backend/src/routes/notes.ts**
- Lines 7-26: Fixed `normalizeDateInput()` to use local date components
- Lines 81-84: Fixed patient lookup to use `patient_id` column and extract integer `id`
- Lines 88-117: Updated all note creation/update queries to use integer `patientDbId`

## Testing

### Test Case: Create Note Today

```bash
# Get auth token
TOKEN=$(curl -s -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"doctor@hospital.com","password":"SecurePass123!"}' \
  | jq -r '.accessToken')

# Create note without specifying date (should use today)
curl -X POST http://localhost:5001/api/notes/patient/P001 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"noteText": "Test note", "noteType": "general"}'

# Expected: note_date = today's local date
```

### Verification Steps

1. **Local Testing**
   ```bash
   ./app.sh start
   # Navigate to http://localhost:5173
   # Login and create a clinical note
   # Verify: note shows today's date in history
   ```

2. **API Direct Test**
   ```bash
   # Get today's date in your local timezone
   TODAY=$(date +%Y-%m-%d)
   
   # Create note
   curl -X POST http://localhost:5001/api/notes/patient/P001 \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $TOKEN" \
     -d "{\"noteText\": \"Test\", \"date\": \"$TODAY\"}"
   
   # Verify: Returns success with note_date = $TODAY
   ```

## Related Issues

### PostgreSQL Error Messages

You may see logs like:
```
postgres-1  | 2026-04-13 17:00:32.437 UTC [138] FATAL:  database "medapp" does not exist
```

This is **not related** to this fix. It's a harmless message from:
- PostgreSQL healthcheck running `pg_isready -U medapp` (which tries to connect to default database)
- The actual database `med_app_db` exists and is working correctly
- Docker-compose verifies this - the backend connects and works fine

The database configuration is correct in `docker-compose.yml`:
```yaml
POSTGRES_DB: med_app_db
DATABASE_URL: postgresql://medapp:medapp_dev_password@postgres:5432/med_app_db
```

These error messages can be safely ignored - they don't affect functionality.

## Deployment

For **Render Deployment**, push the changes and they'll automatically deploy. No manual database migration needed - the backend handles the date fixes transparently.

## Summary

✓ Clinical notes now display with correct date (same as created date)  
✓ Patient ID lookup works correctly  
✓ Notes can be created and updated without type errors  
✓ Dates are consistently stored in local timezone  
✓ Created timestamp and note date are now aligned
