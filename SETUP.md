# Quick Start Guide - Medical Notes App

## 🚀 Development Setup (Without Docker)

### Prerequisites
- **Node.js**: v16 or higher
- **PostgreSQL**: v12 or higher
- **npm** or **yarn**

### Step 1: Clone and Install Dependencies

```bash
cd med_app

# Install root dependencies (optional - for concurrently)
npm install

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
cd ..
```

### Step 2: Setup PostgreSQL

Create a PostgreSQL database:

```bash
createdb med_app_db
```

Or if you need to specify a user:

```bash
createdb -U postgres med_app_db
```

### Step 3: Configure Backend Environment

Copy the example env file:

```bash
cd backend
cp .env.example .env
```

Edit `.env` with your database credentials:

```env
PORT=5000
DATABASE_URL=postgresql://postgres:password@localhost:5432/med_app_db
JWT_SECRET=your_secret_key_here_change_in_production
JWT_REFRESH_SECRET=your_refresh_secret_here_change_in_production
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:5173
SESSION_TIMEOUT_MINUTES=15
```

### Step 4: Configure Frontend Environment

```bash
cd ../frontend
cp .env.example .env
```

Edit `.env`:

```env
VITE_API_URL=http://localhost:5000
```

### Step 5: Start Development Servers

**Option A: Run separately (in different terminals)**

Terminal 1 - Backend:

```bash
cd backend
npm run dev
# Server running on http://localhost:5000
```

Terminal 2 - Frontend:

```bash
cd frontend
npm run dev
# App running on http://localhost:5173
```

**Option B: Run both together**

From root directory (requires concurrently):

```bash
npm run dev
```

### Step 6: Access the Application

Open your browser and go to: **http://localhost:5173**

### Step 7: Create Your First Account

1. Click "Register" on the login page
2. Enter email, password, first name, and last name
3. Click "Register"
4. You'll be logged in automatically

### Step 8: Search/Create Your First Patient

1. Enter a patient ID (e.g., "P001") in the search box
2. Click "Search"
3. If the patient doesn't exist, click "Create Patient"
4. Fill in the patient details
5. Click "Save"
6. You can now add clinical notes for today

---

## 🐳 Development Setup (With Docker)

If you prefer Docker:

```bash
docker-compose up
```

Then access:
- Frontend: http://localhost:5173
- Backend API: http://localhost:5000
- PostgreSQL: localhost:5432

Default credentials:
- Username: `medapp`
- Password: `medapp_dev_password`

---

## 📦 Production Build

### Backend

```bash
cd backend
npm run build
npm start
```

### Frontend

```bash
cd frontend
npm run build
npm run preview
```

---

## 🔐 Security Checklist for Production

- [ ] Change `JWT_SECRET` and `JWT_REFRESH_SECRET` to strong random strings
- [ ] Change database user password
- [ ] Set `NODE_ENV=production`
- [ ] Enable HTTPS (use reverse proxy like nginx)
- [ ] Add rate limiting on login endpoint
- [ ] Setup database backups
- [ ] Configure CORS `ALLOWED_ORIGINS` correctly
- [ ] Enable database encryption
- [ ] Setup monitoring and logging
- [ ] Regular security audits

---

## 🐛 Troubleshooting

### "Cannot connect to database"

Check your `DATABASE_URL` and ensure:
- PostgreSQL is running
- Database exists
- Credentials are correct

```bash
psql postgresql://user:password@localhost:5432/med_app_db
```

### CORS errors

Ensure your frontend URL is in `ALLOWED_ORIGINS` in `.env`:

```env
ALLOWED_ORIGINS=http://localhost:5173,http://yourdomain.com
```

### Frontend not loading API

Check that `VITE_API_URL` points to your backend:

```bash
curl http://localhost:5000/health
```

### "Port already in use"

Change the port in `.env` or use:

```bash
# Linux/Mac
lsof -i :5000
kill -9 <PID>

# Windows
netstat -ano | findstr :5000
taskkill /PID <PID> /F
```

---

## 📚 Project Structure

```
med_app/
├── backend/
│   ├── src/
│   │   ├── routes/        # API endpoints
│   │   ├── middleware/    # Auth, logging
│   │   ├── db/            # Database setup
│   │   ├── utils/         # Utilities
│   │   ├── config.ts      # Configuration
│   │   └── index.ts       # Server entry point
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/         # Page components
│   │   ├── components/    # Reusable components
│   │   ├── context/       # Auth context
│   │   ├── hooks/         # Custom hooks
│   │   ├── utils/         # API client
│   │   ├── App.tsx        # Main app
│   │   └── main.tsx       # Entry point
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
└── README.md
```

---

## 🚀 Next Steps

1. **Test the app**: Create patients and notes
2. **Review security**: Check audit logs and database
3. **Deploy**: Use Docker for production
4. **Monitor**: Setup logging and alerting
5. **Scale**: Add caching, optimize database

---

## 📞 Support

- Check `README.md` for full documentation
- Review `backend/.env.example` for configuration options
- Check browser console for frontend errors
- Check server logs for backend errors

Happy coding! 🏥
