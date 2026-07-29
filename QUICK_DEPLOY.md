# 🚀 Quick Deploy Guide (15 Minutes)

The fastest way to get your app online using free tiers.

## What You'll Get
- ✅ Public URL accessible from anywhere
- ✅ Automatic HTTPS
- ✅ Professional hosting
- ✅ Free tier (suitable for personal use)

---

## Step-by-Step (Railway + Vercel)

### 1️⃣ Setup GitHub (5 minutes)

```powershell
# In your LibraryApp folder
git init
git add .
git commit -m "Initial commit"
```

Then:
1. Go to https://github.com/new
2. Create a new repository called "library-app"
3. Follow GitHub's instructions to push your code:

```powershell
git remote add origin https://github.com/YOUR_USERNAME/library-app.git
git branch -M main
git push -u origin main
```

### 2️⃣ Deploy Database on Railway (3 minutes)

1. Go to https://railway.app
2. Sign up with GitHub
3. Click **"New Project"** → **"Provision PostgreSQL"**
4. Click on the PostgreSQL service
5. Go to **"Variables"** tab
6. Copy these values (keep this tab open):
   - `PGHOST`
   - `PGPORT` (usually 5432)
   - `PGDATABASE`
   - `PGUSER`
   - `PGPASSWORD`

### 3️⃣ Deploy Backend on Railway (5 minutes)

1. In Railway, click **"New"** → **"GitHub Repo"**
2. Select your `library-app` repository
3. Railway will start deploying - click **"Cancel"** to configure first
4. Click **"Settings"**:
   - **Root Directory**: `backend`
   - **Start Command**: `npm run db:migrate && npm start`
5. Go to **"Variables"** tab and add:
   ```
   NODE_ENV=production
   PORT=5000
   DB_HOST=(paste from step 2)
   DB_PORT=5432
   DB_NAME=(paste from step 2)
   DB_USER=(paste from step 2)
   DB_PASSWORD=(paste from step 2)
   JWT_SECRET=(generate using command below)
   GOOGLE_BOOKS_API_KEY=(your existing key from .env)
   FRONTEND_URL=https://library-app.vercel.app
   RATE_LIMIT_WINDOW_MS=900000
   RATE_LIMIT_MAX_REQUESTS=100
   MAX_FILE_SIZE=10485760
   UPLOAD_DIR=./uploads
   ```
6. Click **"Deploy"**
7. Once deployed, go to **"Settings"** → **"Networking"** → **"Generate Domain"**
8. Copy your backend URL (e.g., `https://library-app-production.up.railway.app`)

**Generate JWT_SECRET in PowerShell:**
```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | % {[char]$_})
```

### 4️⃣ Deploy Frontend on Vercel (2 minutes)

1. Go to https://vercel.com
2. Sign up with GitHub
3. Click **"Add New"** → **"Project"**
4. Select your `library-app` repository
5. Configure:
   - **Framework Preset**: Vite
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
6. Click **"Environment Variables"**:
   ```
   VITE_API_URL=(paste your Railway backend URL)/api
   ```
   Example: `https://library-app-production.up.railway.app/api`
7. Click **"Deploy"**
8. Wait ~2 minutes for deployment
9. Get your live URL (e.g., `https://library-app.vercel.app`)

### 5️⃣ Update Backend CORS

1. Go back to Railway
2. Click on your backend service
3. Go to **"Variables"**
4. Update `FRONTEND_URL` to:
   ```
   https://library-app.vercel.app
   ```
   (replace with your actual Vercel URL)
5. Service will auto-redeploy

---

## ✅ Done! Test Your App

1. Open your Vercel URL in a browser
2. Create an account
3. Try all features
4. Share the URL with friends!

---

## 💰 Costs

- **Railway**: Free for 500 hours/month, then $5/month
- **Vercel**: Free for hobby projects
- **Total**: $0-5/month

---

## 🔧 Troubleshooting

### "Cannot connect to backend"
- Check `VITE_API_URL` in Vercel environment variables
- Make sure it ends with `/api`
- Check Railway backend is running (should show green status)

### "Database connection failed"
- Check Railway PostgreSQL is running
- Verify all DB variables are correct in backend service

### "Camera not working"
- Camera requires HTTPS (Vercel provides this automatically)
- Mobile browsers may need camera permissions

---

## 📱 Custom Domain (Optional)

### On Vercel:
1. Go to your project → **"Settings"** → **"Domains"**
2. Add your domain (e.g., `library.yourdomain.com`)
3. Update DNS records as instructed

### Update Backend:
1. Go to Railway → Backend Variables
2. Update `FRONTEND_URL` to include your custom domain

---

## 🔄 Updating Your App

When you make changes:

```powershell
git add .
git commit -m "Description of changes"
git push
```

Both Railway and Vercel will automatically deploy your changes!

---

## 🆘 Need Help?

- Railway Support: https://railway.app/help
- Vercel Support: https://vercel.com/support
- Check Railway logs: Click service → "Deployments" → View logs
- Check Vercel logs: Project → "Deployments" → View function logs
