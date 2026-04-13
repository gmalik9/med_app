# Render Deployment - Complete Setup Guide

## Issue Summary

When deploying to Render, the frontend may show "loading" state that never completes, and account creation may fail with network errors. This is typically caused by:

1. **API URL detection not working correctly** - Frontend can't find the backend
2. **CORS not configured** - Backend rejects requests from frontend domain
3. **Database not seeded** - No initial data in database

## Quick Fix Checklist

### 1. Backend Configuration (Render Dashboard)

Go to your backend service settings and verify these environment variables:

```
PORT=5000
NODE_ENV=production
DATABASE_URL=postgresql://medapp:PASSWORD@HOST/med_app_db   # Use INTERNAL database URL
JWT_SECRET=<32+ character random string>
JWT_REFRESH_SECRET=<32+ character random string>
ALLOWED_ORIGINS=https://med-app-frontend-7l2w.onrender.com,https://*.onrender.com
SESSION_TIMEOUT_MINUTES=30
SEED_DATABASE=false
```

**IMPORTANT**: Use the **Internal Database URL** (starts with `postgresql://`), NOT the external URL.

### 2. Frontend Configuration (Render Dashboard)

For static site deployment:

```
VITE_API_URL=https://med-app-backend-zd1j.onrender.com
```

**OR** if deploying as web service:

```
VITE_API_URL=<your-backend-url>
```

**NOTE**: The frontend now has smart URL detection that doesn't require VITE_API_URL for Render deployments. It will auto-detect by replacing "frontend" with "backend" in the hostname.

### 3. Seed the Database

Once both services are deployed, run:

```bash
curl -X POST https://med-app-backend-zd1j.onrender.com/api/seed
```

You should see:
```json
{"status":"ok","message":"Database seeded successfully"}
```

### 4. Test Login

- Visit: https://med-app-frontend-7l2w.onrender.com
- Email: `doctor@hospital.com`
- Password: `SecurePass123!`

If login doesn't work, check the browser console (F12 → Network tab) to see API errors.

## How the Auto-Detection Works

The frontend's `apiClient.ts` now detects the deployment environment:

1. **Localhost** - Uses `http://localhost:5001`
2. **Render** - Replaces "frontend" with "backend" in hostname
   - `med-app-frontend-7l2w.onrender.com` → `https://med-app-backend-zd1j.onrender.com`
3. **Docker** - Uses `http://backend:5000`
4. **Other remote** - Uses `/api` proxy (requires reverse proxy setup)

## Debugging

### Check Backend Health

```bash
curl https://med-app-backend-zd1j.onrender.com/health
```

Should return: `{"status":"ok","timestamp":"..."}`

### Test API Endpoint

```bash
# Get login token
TOKEN=$(curl -s -X POST https://med-app-backend-zd1j.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"doctor@hospital.com","password":"SecurePass123!"}' | jq -r '.accessToken')

# Test authenticated endpoint
curl https://med-app-backend-zd1j.onrender.com/api/auth/profile \
  -H "Authorization: Bearer $TOKEN"
```

### Check Browser Console

1. Open frontend in browser
2. Press `F12` (Developer Tools)
3. Go to **Network** tab
4. Try logging in
5. Look for failed requests and check the error messages

### Check Render Logs

1. In Render dashboard, go to backend service
2. Click **Logs** tab
3. Look for error messages during login/signup attempts

## Common Issues

### Issue: Login button stuck on "loading"

**Cause**: Frontend can't reach backend API

**Fix**:
1. Check `ALLOWED_ORIGINS` in backend includes frontend URL
2. Check browser console for CORS errors
3. Verify backend is running (check health endpoint)
4. Confirm API URLs are correct (should be HTTPS on Render)

### Issue: "Network error" on account creation

**Cause**: Backend not accessible or database connection failed

**Fix**:
1. Check DATABASE_URL in backend (must use INTERNAL URL)
2. Verify database service is running
3. Check backend logs for database errors
4. Test backend health endpoint

### Issue: 502 Bad Gateway

**Cause**: Backend crashed or not responding

**Fix**:
1. Check backend logs in Render dashboard
2. Restart backend service
3. Verify all environment variables are set
4. Check database connection

### Issue: Login works but data doesn't load

**Cause**: Database not seeded

**Fix**:
```bash
curl -X POST https://med-app-backend-zd1j.onrender.com/api/seed
```

## Redeployment

After making code changes:

1. Push to GitHub
2. Render automatically redeploys (if auto-deploy is enabled)
3. For manual deploy: In Render dashboard, click **Deploy** on the service

## Environment Variable Reference

| Variable | Description | Example |
|----------|-------------|---------|
| DATABASE_URL | PostgreSQL connection string (INTERNAL) | `postgresql://medapp:pass@dpg-xxx/med_app_db` |
| ALLOWED_ORIGINS | Comma-separated list of allowed frontend domains | `https://domain.onrender.com,https://*.onrender.com` |
| JWT_SECRET | Secret for signing JWT tokens (32+ chars) | `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6` |
| JWT_REFRESH_SECRET | Secret for refresh tokens (32+ chars) | `z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4` |
| NODE_ENV | Runtime environment | `production` |
| PORT | Server port | `5000` |
| SESSION_TIMEOUT_MINUTES | Session expiration time | `30` |
| SEED_DATABASE | Auto-seed on startup | `false` |
| VITE_API_URL | Frontend API URL (optional, auto-detected) | `https://backend.onrender.com` |

## Files Modified

- `frontend/src/utils/apiClient.ts` - Added Render hostname detection
- Documentation files updated with deployment information

## Next Steps

1. Verify deployment working at https://med-app-frontend-7l2w.onrender.com
2. Set up monitoring for uptime
3. Configure custom domain (optional)
4. Set up automated backups for database
5. Plan for production scaling
