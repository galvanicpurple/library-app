# 🔧 Railway Database Connection Fix

## Problem
Backend crashes with: `Error: getaddrinfo ENOTFOUND postgres.railway.internal`

## Solution
Use Railway's `DATABASE_URL` variable instead of individual DB variables.

## Steps to Fix:

### 1. Update Your Code (Already Done)
The `backend/src/db/db.js` file has been updated to support `DATABASE_URL`.

### 2. Push Changes to GitHub

```powershell
cd C:\Users\eCEOs\LibraryApp
git add .
git commit -m "Fix database connection to use DATABASE_URL"
git push
```

### 3. Configure Railway Backend Variables

Go to Railway → Your Backend Service → Variables tab

**Option A: Use DATABASE_URL (Easiest)**

1. Click **"New Variable"** → **"Add Reference"**
2. Select your **PostgreSQL** service
3. Choose **DATABASE_URL** from the dropdown
4. This creates: `DATABASE_URL=${{Postgres.DATABASE_URL}}`

**Then REMOVE these old variables (if they exist):**
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`

**Option B: Use Public Connection Details**

If Option A doesn't work, get the public URL from your PostgreSQL service:

1. Go to PostgreSQL service → **Variables** tab
2. Look for **DATABASE_PUBLIC_URL** or similar
3. It looks like: `postgresql://postgres:pass@autorack.proxy.rlwy.net:12345/railway`

Then in your backend service, set:
```
DB_HOST=autorack.proxy.rlwy.net (your actual host)
DB_PORT=12345 (your actual port)
DB_NAME=railway
DB_USER=postgres
DB_PASSWORD=your_actual_password
```

### 4. Verify Deployment

After pushing to GitHub:
1. Railway will automatically redeploy
2. Check the logs for "✓ Database connected successfully"
3. The migration should run and complete

---

## ✅ Your Final Backend Variables Should Look Like:

```
NODE_ENV=production
PORT=5000
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=your_generated_secret
GOOGLE_BOOKS_API_KEY=your_api_key
FRONTEND_URL=https://library-app-frontend-five.vercel.app
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
MAX_FILE_SIZE=10485760
UPLOAD_DIR=./uploads
```

Note: When using `DATABASE_URL`, you don't need the individual `DB_*` variables!

---

## 🔍 Troubleshooting

**If you still see connection errors:**

1. Check PostgreSQL service is running (green status)
2. Make sure DATABASE_URL reference is correct: `${{Postgres.DATABASE_URL}}`
3. Check logs for the actual error message
4. Verify SSL is enabled in production (already configured in updated code)

**Check if migration succeeded:**
- Look for "✓ Database migration completed successfully" in logs
- If not, the start command will retry the migration on next deploy
