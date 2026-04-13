# Quick Fix for Render Deployment

**Problem**: Login button stuck on loading, signup fails with network error

**Solution**: Complete in 3 steps

## Step 1: Seed the Database

Run this command once:

```bash
curl -X POST https://med-app-backend-zd1j.onrender.com/api/seed
```

Expected response:
```json
{"status":"ok","message":"Database seeded successfully"}
```

This creates the test user account:
- Email: `doctor@hospital.com`
- Password: `SecurePass123!`

## Step 2: Verify Backend CORS

Go to Render Dashboard:
1. Click on `med-app-backend` service
2. Click **Environment**
3. Verify `ALLOWED_ORIGINS` includes your frontend URL

Should look like:
```
https://med-app-frontend-7l2w.onrender.com,https://*.onrender.com
```

If missing, add it and click **Save**. Service will redeploy automatically.

## Step 3: Test Login

1. Visit: https://med-app-frontend-7l2w.onrender.com
2. Enter credentials:
   - Email: `doctor@hospital.com`
   - Password: `SecurePass123!`
3. Click Login

**Should work now!** ✓

---

## If Still Not Working

### Check API URL Detection

Open browser DevTools (F12 → Console) and look for:
```
[API Client] Using Render backend URL: https://med-app-backend-zd1j.onrender.com
```

If you see a different URL, the auto-detection failed.

### Manual Fix

If auto-detection doesn't work, set environment variable on frontend:

**Render Dashboard → Frontend Service → Environment**

Add:
```
VITE_API_URL=https://med-app-backend-zd1j.onrender.com
```

Then redeploy frontend.

### Verify Backend is Running

```bash
curl https://med-app-backend-zd1j.onrender.com/health
```

Should return:
```json
{"status":"ok","timestamp":"..."}
```

If not, check Render backend logs.

### Check Database Connection

In Render backend logs, look for:
```
🏥 Medical notes app running on port 5000
Database: Connected
```

If database error appears, verify `DATABASE_URL` is correct and uses **internal URL**.

---

## Summary

1. **Seed database**: `curl -X POST https://med-app-backend-zd1j.onrender.com/api/seed`
2. **Verify CORS**: Check `ALLOWED_ORIGINS` on backend service
3. **Test login**: Visit frontend and log in
4. **Done!**

For more details, see `RENDER_DEPLOYMENT_FIX.md`
