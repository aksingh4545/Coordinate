# Deployment Guide - Coordinator App

## 🚀 Quick Deploy (Recommended - Free & Easy)

### Option 1: Deploy to Vercel (Frontend + Backend)

---

## 📦 Backend Deployment

### A. Deploy Backend to Render.com (Recommended for Backend)

**Why Render?** Free tier, supports WebSocket, always running

1. **Go to** https://render.com and sign up with GitHub

2. **Create New Web Service**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Select repository: `Coordinate`

3. **Configure Settings**
   ```
   Name: coordinator-backend
   Region: Singapore (closest to India)
   Branch: production
   Root Directory: Backend
   Runtime: Node
   Build Command: npm install
   Start Command: node server.js
   ```

4. **Environment Variables**
   ```
   PORT=5000
   FRONTEND_URL=https://your-frontend-url.vercel.app
   NODE_ENV=production
   ```

5. **Choose Free Plan**
   - Select "Free" tier
   - Click "Create Web Service"

6. **Get Your Backend URL**
   - After deployment, you'll get: `https://coordinator-backend.onrender.com`
   - Copy this URL for frontend config

**Deployment Time**: 5-10 minutes

---

### B. Alternative: Deploy Backend to Vercel

⚠️ **Note**: Vercel serverless has limitations with WebSocket (may not work perfectly)

1. **Go to** https://vercel.com and sign up with GitHub

2. **Import Project**
   - Click "Add New" → "Project"
   - Import `Coordinate` repository
   - Root Directory: `Backend`

3. **Configure**
   ```
   Framework Preset: Node.js
   Build Command: npm install
   Output Directory: (leave empty)
   ```

4. **Environment Variables**
   ```
   PORT=5000
   FRONTEND_URL=https://your-frontend.vercel.app
   NODE_ENV=production
   ```

5. **Deploy**

---

## 💻 Frontend Deployment

### Deploy Frontend to Vercel (Recommended)

1. **Go to** https://vercel.com

2. **Import Project**
   - Click "Add New" → "Project"
   - Import `Coordinate` repository
   - Root Directory: `Frontend`

3. **Configure Build**
   ```
   Framework Preset: Vite
   Build Command: npm run build
   Output Directory: dist
   ```

4. **Environment Variables**
   ```
   VITE_SOCKET_URL=https://your-backend-url.onrender.com
   ```
   *(Use your actual Render backend URL)*

5. **Deploy**
   - Click "Deploy"
   - Wait 2-3 minutes

6. **Get Your Frontend URL**
   - You'll get: `https://coordinator.vercel.app`

---

## 🔧 Update Environment Variables

### After Deployment, Update:

**Backend (Render)**
```env
PORT=5000
FRONTEND_URL=https://coordinator.vercel.app
NODE_ENV=production
```

**Frontend (Vercel)**
```env
VITE_SOCKET_URL=https://coordinator-backend.onrender.com
```

---

## ✅ Complete Deployment Checklist

- [ ] Backend deployed to Render
- [ ] Frontend deployed to Vercel
- [ ] Backend URL added to Frontend env
- [ ] Frontend URL added to Backend env
- [ ] CORS updated in backend server.js
- [ ] Test creating a room
- [ ] Test joining a room
- [ ] Test location sharing

---

## 🔐 Update CORS for Production

In `Backend/server.js`, update CORS:

```javascript
const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
      'https://coordinator.vercel.app',  // Your production URL
      'https://*.vercel.app'  // Allow all Vercel previews
    ],
    methods: ['GET', 'POST'],
    credentials: true,
  },
});
```

---

## 🧪 Test Production Deployment

1. **Open Frontend URL** in browser
2. **Create a room** as host
3. **Open another browser/incognito** window
4. **Join the room** using the room code
5. **Allow location permissions**
6. **Verify both users appear on map**

---

## 📊 Alternative Deployment Options

### Backend Alternatives

| Service | Free Tier | WebSocket | Always On |
|---------|-----------|-----------|-----------|
| Render | ✅ Yes | ✅ Yes | ❌ Sleeps after 15min |
| Railway | ✅ $5 credit | ✅ Yes | ✅ Yes |
| Fly.io | ✅ 3 VMs | ✅ Yes | ✅ Yes |
| Heroku | ❌ No free | ✅ Yes | ✅ Yes |

### Frontend Alternatives

| Service | Free Tier | Custom Domain |
|---------|-----------|---------------|
| Vercel | ✅ Yes | ✅ Yes |
| Netlify | ✅ Yes | ✅ Yes |
| GitHub Pages | ✅ Yes | ✅ Yes |
| Cloudflare Pages | ✅ Yes | ✅ Yes |

---

## 🚨 Common Issues & Solutions

### 1. WebSocket Connection Failed
**Problem**: Frontend can't connect to backend

**Solution**: 
- Check `VITE_SOCKET_URL` in Frontend env
- Ensure backend is running
- Check CORS settings in `server.js`

### 2. Location Not Showing
**Problem**: GPS coordinates not appearing

**Solution**:
- Allow location permissions in browser
- Use HTTPS (required for geolocation)
- Check browser console for errors

### 3. Backend Sleeps (Render Free)
**Problem**: Backend goes to sleep after inactivity

**Solution**:
- Upgrade to Render paid plan ($7/month)
- Use uptime monitor (e.g., UptimeRobot) to ping every 5 min
- Switch to Railway free tier

---

## 🎯 Recommended Production Setup

```
Frontend: Vercel (Free)
   ↓
Backend: Render (Free) or Railway ($5/month)
   ↓
Database: In-memory (current) or MongoDB Atlas (Free)
```

---

## 📈 Deploy to Production Branch

```bash
# When ready for production
git checkout production
git merge main
git push origin production

# Then deploy production branch to hosting
```

---

## 🔗 Useful Links

- **Vercel Dashboard**: https://vercel.com/dashboard
- **Render Dashboard**: https://dashboard.render.com
- **Your Frontend**: `https://coordinator.vercel.app`
- **Your Backend**: `https://coordinator-backend.onrender.com`

---

## Need Help?

Check logs:
- **Vercel**: Dashboard → Project → Deployments → Click deployment → View logs
- **Render**: Dashboard → Web Service → Logs

---

**Last Updated**: March 2026
