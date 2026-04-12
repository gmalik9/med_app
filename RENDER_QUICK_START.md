# Render.com Deployment - Quick Start Guide

Deploy your Medical Notes App to Render.com in 5 minutes. ✨

## Prerequisites

✓ GitHub account with code pushed
✓ Render.com account (sign up free at https://render.com)

## Step 1: Set Up Database (2 minutes)

1. Log in to [Render Dashboard](https://dashboard.render.com)
2. Click **New +** → **PostgreSQL**
3. Fill in:
   - **Name**: `med-app-db`
   - **Database**: `med_app_db`  
   - **User**: `medapp`
   - **Region**: Pick closest to you
   - **Plan**: Free
4. Click **Create Database**
5. ⏳ Wait for it to be ready (1-2 minutes)
6. **Copy the Internal Database URL** (you'll need this next)

## Step 2: Deploy Backend (2 minutes)

1. Click **New +** → **Web Service**
2. Select your GitHub repository
3. Fill in:
   - **Name**: `med-app-backend`
   - **Environment**: `Node`
   - **Build Command**: `cd backend && npm install && npm run build`
   - **Start Command**: `cd backend && npm run start`
   - **Plan**: Free

4. Click **Advanced** → **Add Environment Variable**
   - Paste each line below:
   ```
   PORT=5000
   NODE_ENV=production
   DATABASE_URL=<paste your Internal Database URL here>
   JWT_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
   JWT_REFRESH_SECRET=<generate another>
   ALLOWED_ORIGINS=https://med-app-frontend.onrender.com
   SESSION_TIMEOUT_MINUTES=30
   SEED_DATABASE=false
   ```

5. Click **Create Web Service**
6. ⏳ Wait for deployment (takes 3-5 minutes)
7. **Copy your backend URL** (e.g., `https://med-app-backend.onrender.com`)

## Step 3: Deploy Frontend (1 minute)

1. Click **New +** → **Static Site**
2. Select your GitHub repository
3. Fill in:
   - **Name**: `med-app-frontend`
   - **Build Command**: `cd frontend && npm install && npm run build`
   - **Publish Directory**: `frontend/dist`
   - **Plan**: Free

4. Click **Advanced** → **Add Environment Variable**:
   ```
   VITE_API_URL=<paste your backend URL from Step 2>
   ```

5. Click **Create Static Site**
6. ⏳ Wait for deployment

## 🎉 Done!

Your app is live! 

- **Frontend**: The provided Render URL
- **Test credentials**:
  - Email: `doctor@hospital.com`
  - Password: `SecurePass123!`

## Troubleshooting

**Frontend shows blank page?**
- Check browser console (F12)
- Verify `VITE_API_URL` matches your backend URL exactly

**Backend not responding?**
- Check service logs in Render dashboard
- Verify all environment variables are set
- Make sure DATABASE_URL is the "Internal" URL, not "External"

**Database connection failed?**
- Double-check DATABASE_URL is correct
- Restart the backend service

## Next Steps

✓ Set up auto-deploy from GitHub (settings → auto-deploy branch)
✓ Test all features on the deployed site
✓ Monitor logs in Render dashboard

**Need help?** See `RENDER_DEPLOYMENT.md` for detailed guide.
