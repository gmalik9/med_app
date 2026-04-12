# Render.com Deployment Guide

This guide provides step-by-step instructions to deploy the Medical Notes App to Render.com.

## Prerequisites

- GitHub account with this repository pushed
- Render.com account (free tier available at https://render.com)
- Node.js 18+ (for local testing)

## Architecture

The app deploys as:
- **PostgreSQL Database** - Managed PostgreSQL on Render
- **Backend** - Node.js/Express on Render Web Service
- **Frontend** - React/Vite on Render Static Site (or as part of backend)

## Deployment Steps

### Step 1: Push Repository to GitHub

```bash
cd /path/to/med_app
git add .
git commit -m "Prepare for render deployment"
git push origin main
```

### Step 2: Create PostgreSQL Database on Render

1. Log in to [Render Dashboard](https://dashboard.render.com)
2. Click **New +** → **PostgreSQL**
3. Configure:
   - **Name**: `med-app-db`
   - **Database**: `med_app_db`
   - **User**: `medapp`
   - **Region**: Choose closest to your users
   - **Plan**: Free (for development) or Paid (for production)
4. Click **Create Database**
5. Copy the **Internal Database URL** (starts with `postgres://`) - you'll need this for the backend

### Step 3: Deploy Backend Service

1. Click **New +** → **Web Service**
2. Select your GitHub repository
3. Configure:
   - **Name**: `med-app-backend`
   - **Environment**: `Node`
   - **Build Command**: 
     ```
     cd backend && npm install && npm run build
     ```
   - **Start Command**: 
     ```
     cd backend && npm run start
     ```
   - **Plan**: Free or Paid

4. **Add Environment Variables** (click **Add Environment Variable**):
   ```
   PORT=5000
   NODE_ENV=production
   DATABASE_URL=<paste the Internal Database URL from Step 2>
   JWT_SECRET=<generate a secure random string>
   JWT_REFRESH_SECRET=<generate another secure random string>
   ALLOWED_ORIGINS=https://med-app-frontend.onrender.com
   ALLOWED_ORIGINS=https://med-app-frontend\..*\.onrender\.com
   SESSION_TIMEOUT_MINUTES=30
   SEED_DATABASE=false
   ```

5. Click **Create Web Service**
6. Wait for deployment to complete
7. Copy the service URL (e.g., `https://med-app-backend.onrender.com`)

### Step 4: Deploy Frontend

Option A: Deploy as Static Site (recommended for simple frontend)

1. Click **New +** → **Static Site**
2. Select your GitHub repository
3. Configure:
   - **Name**: `med-app-frontend`
   - **Build Command**: 
     ```
     cd frontend && npm install && npm run build
     ```
   - **Publish Directory**: `frontend/dist`
   - **Plan**: Free

4. **Add Environment Variable**:
   ```
   VITE_API_URL=https://med-app-backend.onrender.com
   ```

5. Click **Create Static Site**
6. Wait for deployment to complete
7. Your app will be available at the provided Render URL

Option B: Deploy Frontend with Backend (if you prefer single service)

See the alternative deployment in Step 5 below.

### Step 5: Initialize Database

Once backend is deployed:

1. Open backend service logs in Render dashboard
2. Look for "Database initialized" message
3. If you need to seed dummy data, make a request:
   ```bash
   curl -X POST https://med-app-backend.onrender.com/api/seed
   ```

### Step 6: Verify Deployment

1. Visit your frontend URL
2. Log in with test credentials:
   - Email: `doctor@hospital.com`
   - Password: `SecurePass123!`
3. Test creating a patient and note
4. Check backend logs for any errors

## Automated Deployment Setup

### Enable Auto-Deploy from Git

1. In Render Dashboard → Service Settings
2. Look for **GitHub** section
3. Enable **Auto-Deploy** for `main` branch
4. Future git pushes will automatically redeploy

## Environment Variables

| Variable | Development | Production |
|----------|-------------|-----------|
| PORT | 5000 | 5000 |
| NODE_ENV | development | production |
| DATABASE_URL | local postgres | Render postgres |
| JWT_SECRET | dev_jwt_secret_change_in_production_12345 | [secure random] |
| JWT_REFRESH_SECRET | dev_refresh_secret_change_in_production_12345 | [secure random] |
| ALLOWED_ORIGINS | http://localhost:5173 | https://domain.com |
| SESSION_TIMEOUT_MINUTES | 15 | 30 |
| SEED_DATABASE | true (optional) | false |

## Generating Secure Secrets

```bash
# Generate random JWT secrets
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Cost Estimates (as of 2024)

- **PostgreSQL**: Free ($0) or $15/month (paid)
- **Web Service (Backend)**: Free ($0) or $7/month (paid) per 750 hours
- **Static Site (Frontend)**: Free ($0)

**Total Free Tier**: $0
**Total Paid Tier**: ~$22/month

## Troubleshooting

### Database Connection Failed
- Check DATABASE_URL is correct (use Internal URL, not External)
- Verify backend can access database in logs

### Frontend Blank Page
- Check browser console for errors
- Verify VITE_API_URL is correct
- Check backend ALLOWED_ORIGINS includes frontend URL

### 502 Bad Gateway
- Check backend logs for errors
- Verify backend is running
- Check database connection

### Seed Data Not Appearing
- Run: `curl -X POST https://your-backend.onrender.com/api/seed`
- Check backend logs for seed output

## Scaling for Production

### Enable PostgreSQL Connection Pooling
Set in backend environment variables:
```
DATABASE_URL=<base_url>?max=10&connection_timeout=10000
```

### Increase Backend Resources
- Upgrade plan from Free to Paid
- Render will allocate more CPU/memory

### Use CDN for Frontend
- Consider Render's built-in caching
- Or integrate Cloudflare CDN

### Monitor Performance
- Set up error tracking (Sentry)
- Monitor database queries
- Use Render's built-in metrics

## Custom Domain (Optional)

1. In Render dashboard → Service settings
2. Under **Custom Domain**
3. Add your domain
4. Follow DNS configuration instructions

## Rollback a Deployment

1. Render automatically keeps recent builds
2. In Service Settings → Deploys
3. Click **Deploy** next to previous version
4. This will rollback to that deployment

## Next Steps

1. Test the deployed app thoroughly
2. Set up monitoring and alerts
3. Plan for regular backups of database
4. Document any custom configurations
5. Set up CI/CD for automated testing before deploy

## Support

For issues:
- Check [Render Docs](https://render.com/docs)
- Review backend/frontend logs in Render dashboard
- Test locally with `./app.sh start` first
