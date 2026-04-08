# Deployment Checklist

## ✅ Backend (Render)

- [ ] **Add MONGODB_URI to Render Environment Variables**
  - Go to: https://dashboard.render.com/
  - Select your backend service
  - Add: `MONGODB_URI=mongodb://aksingh4539047_db_user:ankit45mongo@ac-2zly6wl-shard-00-00.jz1bzub.mongodb.net:27017/?tls=true&authSource=admin&directConnection=true`

- [ ] **Verify other environment variables on Render:**
  - `FRONTEND_URL=https://coordinatev2.vercel.app`
  - `PORT=5000`
  - `NODE_ENV=production`

- [ ] **Push latest code to Git repository**
  ```bash
  cd C:\Users\ACER\Desktop\coordinator\Coordinate\Backend
  git add .
  git commit -m "fix: improve MongoDB connection and error handling"
  git push
  ```

- [ ] **Check Render logs after deployment**
  - Should see: ✅ MongoDB Connected Successfully
  - Should see: 🚀 Server running on port 5000

- [ ] **Whitelist all IPs in MongoDB Atlas** (if not already done)
  - Network Access → Add IP → Allow from Anywhere (0.0.0.0/0)

## ✅ Frontend (Vercel)

- [ ] **Update Vercel Environment Variables**
  - Go to: https://vercel.com/dashboard
  - Select your frontend project
  - Add environment variable: `VITE_SOCKET_URL=https://coordinate-dfj5.onrender.com`

- [ ] **Redeploy to Vercel**
  ```bash
  cd C:\Users\ACER\Desktop\coordinator\Coordinate\Frontend
  vercel --prod
  ```
  OR trigger deployment via Git push

## ✅ Test Everything

- [ ] **Test backend health**
  ```bash
  curl https://coordinate-dfj5.onrender.com/
  ```

- [ ] **Test frontend** 
  - Open: https://coordinatev2.vercel.app
  - Open browser console (F12)
  - Should NOT see 521 errors
  - Should see: ✅ Socket connected

- [ ] **Test room creation**
  - Create a room
  - Should get QR code
  - Should see room ID

- [ ] **Test location sharing**
  - Join room with mobile device
  - Location should update in real-time

## 🔧 Troubleshooting

### Still getting 521 error?
1. Check Render logs for specific error
2. Verify MONGODB_URI is correctly set
3. Check MongoDB Atlas network access settings
4. Try restarting the Render service

### Socket.IO still not connecting?
1. Verify VITE_SOCKET_URL is set correctly in Vercel
2. Clear browser cache and reload
3. Check browser console for CORS errors
4. Verify CORS settings in server.js match your frontend URL

### MongoDB connection timeout?
1. Check MongoDB Atlas is running
2. Verify credentials in MONGODB_URI
3. Whitelist Render's IP range
4. Check network/firewall settings

## 📞 Quick Test Commands

```bash
# Test backend API
curl -X POST https://coordinate-dfj5.onrender.com/api/rooms/create \
  -H "Content-Type: application/json" \
  -d '{"hostId":"test123","hostName":"Test User"}'

# Check server status
curl -I https://coordinate-dfj5.onrender.com
```
