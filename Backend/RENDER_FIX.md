# Render Deployment Fix Guide

## Problem
**521 Error** - Render backend is crashing on startup, likely due to MongoDB connection timeout.

## Root Cause
Your Render server is failing to connect to MongoDB Atlas, causing the entire server to crash before it can listen for requests.

## Solution Steps

### 1️⃣ Add MongoDB URI to Render Environment Variables

1. Go to your Render dashboard: https://dashboard.render.com/
2. Click on your backend service (`coordinate-dfj5`)
3. Go to **Environment** tab
4. Add the following environment variable:

   ```
   MONGODB_URI=mongodb://aksingh4539047_db_user:ankit45mongo@ac-2zly6wl-shard-00-00.jz1bzub.mongodb.net:27017/?tls=true&authSource=admin&directConnection=true
   ```

5. Also add (if not already present):
   ```
   FRONTEND_URL=https://coordinatev2.vercel.app
   PORT=5000
   NODE_ENV=production
   ```

### 2️⃣ Deploy the Updated Code

Push the latest changes to your Git repository:

```bash
cd C:\Users\ACER\Desktop\coordinator\Coordinate\Backend
git add .
git commit -m "fix: improve MongoDB connection handling for Render"
git push
```

Render will automatically redeploy with the new code.

### 3️⃣ Check Render Logs

After deployment, check the logs:

1. Go to Render dashboard
2. Click on your backend service
3. Go to **Logs** tab
4. Look for:
   - ✅ `🔄 Connecting to MongoDB...`
   - ✅ `✅ MongoDB Connected Successfully`
   - ✅ `🚀 Server running on port 5000`

If you see errors, they will tell you exactly what's wrong.

### 4️⃣ Whitelist Render IP (If Needed)

If MongoDB connection still fails:

1. Go to MongoDB Atlas: https://cloud.mongodb.com/
2. Click **Network Access** in the left sidebar
3. Click **Add IP Address**
4. Click **Allow Access From Anywhere** (0.0.0.0/0)
5. Click **Confirm**

### 5️⃣ Test the Connection

Once deployed, test your backend:

```bash
# Test API
curl https://coordinate-dfj5.onrender.com/api/rooms/test

# Check if server is running
curl -I https://coordinate-dfj5.onrender.com
```

## What Changed in This Update

1. **Better error handling** - Server won't start if DB connection fails (clear error in logs)
2. **Connection timeout** - 10-second timeout prevents hanging
3. **Connection pooling** - Better performance with multiple users
4. **Health check** - Pings MongoDB to verify connection works
5. **Render config file** - Added `render.yaml` for easy deployment

## Common Issues

### ❌ "MONGODB_URI is not set"
**Fix:** Add the environment variable in Render dashboard (Step 1)

### ❌ "MongoNetworkError: failed to connect"
**Fix:** Whitelist Render's IP in MongoDB Atlas (Step 4)

### ❌ Server starts but Socket.IO still fails
**Fix:** Make sure your frontend `.env` has the correct Render URL:
```
VITE_SOCKET_URL=https://coordinate-dfj5.onrender.com
```

## Frontend Configuration

In your **Frontend** directory, create/update `.env`:

```env
VITE_SOCKET_URL=https://coordinate-dfj5.onrender.com
```

Then redeploy to Vercel:
```bash
cd C:\Users\ACER\Desktop\coordinator\Coordinate\Frontend
vercel --prod
```

## Testing Locally

```bash
cd C:\Users\ACER\Desktop\coordinator\Coordinate\Backend
npm run dev
```

You should see:
```
🔄 Connecting to MongoDB...
✅ MongoDB Connected Successfully
🚀 Server running on port 5000
📍 Frontend URL: https://coordinatev2.vercel.app
💾 Using MongoDB for persistent storage
```
