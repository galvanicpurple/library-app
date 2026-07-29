# Quick Setup Guide

## Prerequisites Checklist

Before starting, ensure you have:
- [ ] Node.js 18+ installed (`node --version`)
- [ ] PostgreSQL 14+ installed and running
- [ ] Google Books API key (get from https://console.cloud.google.com)

## Step-by-Step Setup

### 1. Install Dependencies (5 minutes)

```powershell
# From the LibraryApp root directory
npm install
npm run install-all
```

### 2. Setup PostgreSQL Database (2 minutes)

Open PowerShell and run:

```powershell
# Connect to PostgreSQL
psql -U postgres

# In PostgreSQL console, create database
CREATE DATABASE library_app;

# Create user (optional, or use existing postgres user)
CREATE USER library_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE library_app TO library_user;

# Exit
\q
```

### 3. Configure Backend (3 minutes)

```powershell
cd backend

# Copy environment file
Copy-Item .env.example .env

# Edit .env file with your settings
notepad .env
```

**Required settings in `.env`:**
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=library_app
DB_USER=postgres  # or library_user if you created one
DB_PASSWORD=your_password_here

JWT_SECRET=generate_a_random_string_here_at_least_32_chars

GOOGLE_BOOKS_API_KEY=your_google_api_key_here
```

**To generate JWT_SECRET (in PowerShell):**
```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | % {[char]$_})
```

### 4. Run Database Migrations (1 minute)

```powershell
# From backend directory
npm run db:migrate
```

You should see: "✓ Database migration completed successfully"

### 5. Configure Frontend (1 minute)

```powershell
cd ..\frontend

# Copy environment file
Copy-Item .env.example .env

# The default should work
# VITE_API_URL=http://localhost:5000/api
```

### 6. Start the Application (30 seconds)

**Option A: Run both servers together (recommended)**
```powershell
# From root directory
cd ..
npm run dev
```

**Option B: Run servers separately**

Terminal 1 (Backend):
```powershell
cd backend
npm run dev
```

Terminal 2 (Frontend):
```powershell
cd frontend
npm run dev
```

### 7. Access the Application

Open your browser to: **http://localhost:5173**

## First Time Use

1. Click "Sign up" to create an account
2. Enter your details and register
3. You'll be redirected to the dashboard
4. Click "Scan" to add books using your camera
5. Or manually add books by searching

## Getting Google Books API Key

1. Go to https://console.cloud.google.com
2. Create a new project or select existing
3. Enable "Books API"
4. Go to Credentials → Create Credentials → API Key
5. Copy the key to your `.env` file

## Common Issues

### "Database connection failed"
- Check if PostgreSQL is running: `Get-Service postgresql*`
- Start it: `Start-Service postgresql-x64-14` (replace with your version)
- Verify credentials in `.env`

### "Port already in use"
- Backend (5000): Change `PORT` in backend/.env
- Frontend (5173): Change `port` in frontend/vite.config.js

### "Camera not working"
- Camera requires HTTPS or localhost
- Grant camera permission when browser asks
- Use file upload as alternative

### "Google Books API quota exceeded"
- Free tier: 1000 requests/day
- Reduce scanning frequency
- Or upgrade to paid tier

## Development Commands

```powershell
# Start dev servers
npm run dev

# Start backend only
npm run dev:backend

# Start frontend only
npm run dev:frontend

# Build for production
npm run build

# Run database migrations
cd backend && npm run db:migrate
```

## Security Checklist

For production deployment:
- [ ] Change JWT_SECRET to a strong random value
- [ ] Use strong database password
- [ ] Enable HTTPS/SSL
- [ ] Set NODE_ENV=production
- [ ] Configure CORS for your domain only
- [ ] Enable PostgreSQL SSL
- [ ] Set up database backups
- [ ] Configure rate limiting appropriately

## Need Help?

- Check README.md for detailed documentation
- Review API documentation in README.md
- Check console logs for error messages
- Ensure all prerequisites are installed

## Next Steps

Once running:
1. Create your account
2. Set up your shelves (e.g., "Living Room", "Bedroom")
3. Scan your first bookshelf
4. Review and organize your books
5. Start tracking your reading!

Happy organizing! 📚
