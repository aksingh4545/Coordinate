# 🚀 Deploy in 10 Minutes - Step by Step

## Prerequisites
- GitHub account
- Vercel account (free) - https://vercel.com
- Render account (free) - https://render.com

---

## Step 1: Push Code to GitHub

```bash
# Make sure you're on production branch
git checkout production

# Add all changes
git add .

# Commit
git commit -m "Ready for production"

# Push to GitHub
git push origin production
```

---

## Step 2: Deploy Backend to Render (5 minutes)

1. **Go to** https://render.com
2. **Sign in** with GitHub
3. **Click** "New +" → "Web Service"
4. **Connect** your `Coordinate` repository
5. **Fill in**:
   ```
   Name: coordinator-backend
   Region: Singapore
   Branch: production
   Root Directory: Backend
   Runtime: Node
   Build Command: npm install
   Start Command: node server.js
   ```
6. **Choose**: Free plan
7. **Environment Variables**:
   ```
   PORT=5000
   FRONTEND_URL=https://YOUR_APP.vercel.app
   NODE_ENV=production
   ```
   *(Leave FRONTEND_URL empty for now, update after frontend deploy)*
8. **Click** "Create Web Service"
9. **Wait** for deployment (green checkmark)
10. **Copy** your URL: `https://coordinator-backend-xxxx.onrender.com`

---

## Step 3: Deploy Frontend to Vercel (3 minutes)

1. **Go to** https://vercel.com
2. **Sign in** with GitHub
3. **Click** "Add New" → "Project"
4. **Import** your `Coordinate` repository
5. **Configure**:
   ```
   Root Directory: Frontend
   Framework Preset: Vite
   Build Command: npm run build
   Output Directory: dist
   ```
6. **Environment Variables**:
   ```
   VITE_SOCKET_URL=https://coordinator-backend-xxxx.onrender.com
   ```
   *(Use your Render URL from Step 2)*
7. **Click** "Deploy"
8. **Wait** for deployment
9. **Copy** your URL: `https://coordinator.vercel.app`

---

## Step 4: Update Backend URL (2 minutes)

1. **Go back to** Render Dashboard
2. **Select** your backend service
3. **Click** "Environment" tab
4. **Update** `FRONTEND_URL`:
   ```
   FRONTEND_URL=https://coordinator.vercel.app
   ```
   *(Use your Vercel URL from Step 3)*
5. **Click** "Save Changes"
6. **Wait** for redeploy

---

## Step 5: Test Your App (1 minute)

1. **Open** `https://coordinator.vercel.app` in browser
2. **Click** "Create New Group"
3. **Enter** your name
4. **Allow** location permission when prompted
5. **Check** if map shows your location
6. **Open** incognito window
7. **Join** the room with a different name
8. **Verify** both users appear on map

---

## ✅ Done! Your App is Live!

**Frontend**: `https://coordinator.vercel.app`
**Backend**: `https://coordinator-backend-xxxx.onrender.com`

---

## 📱 Share Your App

Share the Vercel URL with friends:
- Send them the link
- They click "Join Existing Group"
- Enter the room code
- They can see your location in real-time!

---

## ⚠️ Important Notes

### Render Free Tier Limitations
- Backend sleeps after 15 minutes of inactivity
- First request after sleep takes ~30 seconds to wake up
- Solution: Upgrade to paid plan ($7/month) or use uptime monitor

### HTTPS Required
- Geolocation only works on HTTPS
- Vercel and Render provide HTTPS automatically
- Local testing: Use `http://localhost` (works without HTTPS)

### CORS Issues
- If you get CORS errors, check:
  - Backend `FRONTEND_URL` env variable
  - Backend server.js CORS configuration
  - Both URLs match exactly (no trailing slashes)

---

## 🔧 Troubleshooting

### "Cannot connect to server"
1. Check backend is running (visit Render URL)
2. Verify `VITE_SOCKET_URL` in Vercel env vars
3. Check Vercel deployment logs

### "Location not showing"
1. Allow location permissions in browser
2. Use HTTPS (already done on Vercel/Render)
3. Check browser console (F12) for errors

### "Room not found"
1. Ensure backend is awake (visit Render URL first)
2. Check room code is correct (uppercase)
3. Verify backend logs on Render

---

## 📊 Monitor Your App

**Vercel Analytics**: Dashboard → Project → Analytics
**Render Logs**: Dashboard → Web Service → Logs
**Vercel Logs**: Dashboard → Project → Deployments → View logs

---

## 🎉 Congratulations!

You've successfully deployed your Coordinator app!

Share it with your friends and start coordinating! 📍
