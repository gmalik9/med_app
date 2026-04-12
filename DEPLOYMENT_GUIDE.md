# Medical Notes App - Complete Deployment Guide

## 🚀 Quick Start (Choose One)

### Option 1: Local Development (Fastest)
```bash
./app.sh start dummy    # Start with test data
# Visit http://localhost:5173
```

### Option 2: Deploy to Render.com (5 minutes)
See **RENDER_QUICK_START.md** for step-by-step instructions.

### Option 3: Deploy to Production (Detailed)
See **RENDER_DEPLOYMENT.md** for comprehensive guide.

---

## 📋 What's Included

### ✅ Doctor Features
- **Dashboard** - View all metrics in one place
  - Analytics summary
  - Today's appointments
  - Scheduled visits
  - Quick templates
- **Profile Management** - Edit personal & professional info
  - Personal details (name, phone, email)
  - Professional info (specialty, license)
  - Professional bio

### ✅ Patient Management
- Search patients by ID
- View all patients
- Edit patient information
- View clinical notes with correct dates
- Track vital signs
- Manage appointments
- View visit history

### ✅ Clinical Notes
- Create notes with date picker
- View note history
- Consistent date formatting (fixed timezone issue)

### ✅ System Features
- Secure JWT authentication
- Session management
- Database seeding (dummy data)
- Dynamic database connections
- Error handling and logging

---

## 🎯 How to Use

### Running Locally
```bash
# Start services
./app.sh start dummy

# Stop services  
./app.sh stop

# Restart services
./app.sh restart dummy

# View logs
./app.sh logs-f

# Check status
./app.sh status
```

### Accessing the App
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:5001
- **Database**: localhost:5432

### Test Account
```
Email: doctor@hospital.com
Password: SecurePass123!
```

### Test Patients (with dummy data)
- **P001** - John Doe
- **P002** - Jane Smith
- **P003** - Robert Johnson

---

## 🚢 Deployment to Render.com

### Quick Start (5 minutes)
1. Read: `RENDER_QUICK_START.md`
2. Create 3 services on Render
3. Done! Your app is live

### What You Get
- PostgreSQL database (free tier)
- Node.js backend (free tier)
- React frontend (free tier)
- **Total cost**: $0/month (free tier) or ~$22/month (paid tier)

### After Deployment
- ✅ Auto-deploy from GitHub (optional)
- ✅ Custom domain support
- ✅ SSL/TLS included
- ✅ Database backups

---

## 🛠️ Helpful Scripts

### Generate Secure Secrets
```bash
./deploy.sh setup
```
Generates random JWT secrets for production.

### Validate Production Build
```bash
./deploy.sh validate
```
Tests that both backend and frontend build successfully.

### Prepare for Deployment
```bash
./deploy.sh prepare
```
Commits and pushes code to GitHub.

---

## 🔧 Environment Variables

### Local Development
Already set in `docker-compose.yml`

### Production (Render.com)
```
PORT=5000
NODE_ENV=production
DATABASE_URL=<PostgreSQL connection string>
JWT_SECRET=<secure random 32 chars>
JWT_REFRESH_SECRET=<secure random 32 chars>
ALLOWED_ORIGINS=https://yourdomain.com
SESSION_TIMEOUT_MINUTES=30
SEED_DATABASE=false
```

See `RENDER_QUICK_START.md` for exact setup.

---

## 📊 Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Frontend (React)                      │
│            http://localhost:5173                        │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ API Calls
                     ▼
┌─────────────────────────────────────────────────────────┐
│                Backend (Node.js)                        │
│            http://localhost:5001                        │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ SQL Queries
                     ▼
┌─────────────────────────────────────────────────────────┐
│                PostgreSQL Database                      │
│            localhost:5432                               │
└─────────────────────────────────────────────────────────┘
```

---

## 🔒 Security Features

- ✅ Passwords hashed with bcrypt
- ✅ JWT token authentication
- ✅ Refresh token rotation
- ✅ Session management
- ✅ CORS protection
- ✅ Input validation
- ✅ SQL injection prevention

---

## 📱 Features by Role

### Doctor
- ✅ Dashboard with analytics
- ✅ View all patients
- ✅ Create/edit patient records
- ✅ Create clinical notes
- ✅ View notes history
- ✅ Track vital signs
- ✅ Manage appointments
- ✅ View visit history
- ✅ Use note templates
- ✅ Edit profile

### System
- ✅ Automatic database seeding
- ✅ Health checks
- ✅ Error logging
- ✅ Session timeout
- ✅ Audit logging

---

## 🐛 Troubleshooting

### App won't start
```bash
# Check Docker
docker version

# Check port availability
lsof -i :5173  # Frontend port
lsof -i :5001  # Backend port
lsof -i :5432  # Database port

# Rebuild
./app.sh build
./app.sh start
```

### Database connection failed
- Verify `docker-compose.yml` DATABASE_URL
- Check PostgreSQL is running: `./app.sh status`
- Check logs: `./app.sh logs postgres`

### Frontend shows blank page
- Check browser console (F12)
- Verify backend is running
- Check API URL in frontend config

### Date issues in notes
- All dates now use ISO format (YYYY-MM-DD)
- No timezone conversion issues
- Frontend and backend dates match

---

## 📖 Project Structure

```
med_app/
├── backend/                    # Node.js Express API
│   ├── src/
│   │   ├── routes/            # API endpoints
│   │   ├── db/                # Database setup
│   │   ├── middleware/        # Auth, logging
│   │   └── utils/             # Helpers
│   └── Dockerfile
├── frontend/                   # React Vite app
│   ├── src/
│   │   ├── components/        # React components
│   │   ├── pages/            # Page components
│   │   ├── hooks/            # Custom hooks
│   │   └── utils/            # Helpers
│   └── Dockerfile
├── docker-compose.yml         # Local development
├── app.sh                      # Local dev script
├── deploy.sh                   # Deployment helper
├── RENDER_QUICK_START.md       # 5-min deployment
└── RENDER_DEPLOYMENT.md        # Detailed guide
```

---

## 🎓 Next Steps

1. **Read the guides**
   - Local: `app.sh` built-in help
   - Render: `RENDER_QUICK_START.md`

2. **Test locally**
   ```bash
   ./app.sh start dummy
   ```

3. **Try the features**
   - Create a patient
   - Add clinical notes
   - View dashboard
   - Edit profile

4. **Deploy to Render**
   - Follow `RENDER_QUICK_START.md`
   - Takes 5 minutes
   - Free tier available

5. **Set up production** (optional)
   - Custom domain
   - Email notifications
   - Backup strategy

---

## 💡 Tips & Tricks

### Generate Test Data
```bash
./app.sh start dummy    # Automatic seeding
```

### Reset Database
```bash
./app.sh clean          # Remove all data
./app.sh start dummy    # Fresh data
```

### View Logs
```bash
./app.sh logs-f         # Follow all logs
./app.sh backend        # Backend only
./app.sh postgres       # Database only
```

### Seed Production Database
```bash
curl -X POST https://your-backend.onrender.com/api/seed
```

---

## 📞 Support

### Common Issues
- **Port already in use**: Change port in `.env`
- **Permission denied**: Run `chmod +x app.sh`
- **Git not found**: Install Git

### Getting Help
1. Check logs: `./app.sh logs-f`
2. Check Docker: `docker ps`
3. Check database: Check Render dashboard

---

## 📝 License

This project is for educational purposes.

---

## 🎉 You're All Set!

Your Medical Notes App is ready to use. Choose your deployment option above and get started!
