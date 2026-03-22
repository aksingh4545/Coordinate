# 🎯 Coordinator - Real-Time Map Location Sharing

A robust real-time location sharing system that helps groups navigate crowded places together. The Host creates a room and shares a QR code, and members can scan to join and see everyone's location on a map with distance indicators.

## ✨ Features

- **🏠 Create/Join Groups**: Host creates a room, members join via QR code or room ID
- **📍 Real-Time Location Tracking**: Live location updates using WebSocket
- **📏 Distance Calculation**: See exact distances between all members
- **🔗 Visual Connections**: Lines on map showing connections between members and host
- **📱 Mobile-Friendly**: Responsive design works on all devices
- **🎨 Beautiful UI**: Modern gradient design with smooth animations
- **🔄 Auto-Sync**: Locations update automatically every 3 seconds

## 🏗️ Architecture

```
┌─────────────────┐
│     HOST        │  ← Creates room, gets QR code
│  (Group Leader) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      WebSocket      ┌──────────────────┐
│    SERVER       │◄──────────────────► │   MongoDB        │
│  - Express API  │                     │  - Rooms         │
│  - Socket.IO    │                     │  - Members       │
│  - QR Generation│                     │  - Locations     │
└────────┬────────┘                     └──────────────────┘
         │
         ▼
┌─────────────────┐
│   MOBILE USERS  │  ← Scan QR, share location
│   (Members)     │
└─────────────────┘
```

## 🚀 Getting Started

### Prerequisites

- **Node.js** (v16 or higher)
- **MongoDB** (local or cloud instance)
- **npm** or **yarn**

### Installation

#### 1. Clone and Navigate

```bash
cd Coordinate
```

#### 2. Setup Backend

```bash
cd Backend
npm install

# Create .env file
echo PORT=5000 > .env
echo MONGODB_URI=mongodb://localhost:27017/coordinator >> .env
echo FRONTEND_URL=http://localhost:5173 >> .env

# Start the server
npm start
```

#### 3. Setup Frontend (New Terminal)

```bash
cd Coordinate/Frontend
npm install

# Create .env file
echo VITE_SOCKET_URL=http://localhost:5000 > .env

# Start the dev server
npm run dev
```

#### 4. Start MongoDB (if running locally)

```bash
# Windows (if MongoDB is installed as service)
net start MongoDB

# Or run mongod manually
mongod --dbpath C:\data\db
```

### Access the Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:5000

## 📖 How to Use

### As a Host

1. Open the app on your device
2. Click **"Create New Group"**
3. Enter your name
4. A unique room ID and QR code will be generated
5. Share the QR code or room code with your group
6. View all members on the map with real-time locations
7. See distances between all members

### As a Member

1. Scan the QR code shared by the host OR enter the room code manually
2. Enter your name
3. Click **"Join Group"**
4. Your location will be automatically shared
5. See the host and other members on the map
6. View your distance from the host

## 🛠️ Tech Stack

### Backend
- **Node.js** + **Express** - Server framework
- **Socket.IO** - Real-time bidirectional communication
- **MongoDB** + **Mongoose** - Database and ODM
- **QRCode** - QR code generation

### Frontend
- **React 19** - UI library
- **React Router** - Navigation
- **Leaflet** + **React-Leaflet** - Interactive maps
- **Socket.IO Client** - Real-time communication
- **Tailwind CSS** - Styling

## 📡 API Endpoints

### Create Room (Host)
```http
POST /api/rooms/create
Content-Type: application/json

{
  "hostId": "user_abc123",
  "hostName": "John Doe"
}
```

### Join Room (Member)
```http
POST /api/rooms/join
Content-Type: application/json

{
  "roomId": "ABC12345",
  "userId": "user_xyz789",
  "userName": "Jane Smith"
}
```

### Get Room Details
```http
GET /api/rooms/:roomId
```

### Leave Room
```http
POST /api/rooms/:roomId/leave
Content-Type: application/json

{
  "userId": "user_xyz789"
}
```

## 🔌 Socket.IO Events

### Client → Server
- `user:join` - Join a room with userId and roomId
- `location:update` - Send location update (lat, lng)
- `room:sync` - Request current room locations

### Server → Client
- `location:updated` - Broadcast location changes
- `user:left` - Notify when user leaves

## 🎨 UI Components

- **HomePage** - Landing page with create/join options
- **HostRoomPage** - Host view with QR sharing and member list
- **JoinRoomPage** - Join page for scanning QR/manual entry
- **MemberRoomPage** - Member view with map and locations
- **MapView** - Interactive map with markers and distance lines

## 🔧 Configuration

### Environment Variables

**Backend (.env)**
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/coordinator
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
```

**Frontend (.env)**
```env
VITE_SOCKET_URL=http://localhost:5000
```

### Production Deployment

1. **Backend (e.g., Vercel, Heroku, Railway)**
   - Set `MONGODB_URI` to cloud MongoDB (MongoDB Atlas)
   - Set `FRONTEND_URL` to your frontend domain
   - Enable CORS for your frontend domain

2. **Frontend (e.g., Vercel, Netlify)**
   - Set `VITE_SOCKET_URL` to your backend URL
   - Build: `npm run build`

## 🐛 Troubleshooting

### Location Not Working
- Ensure location permissions are granted in browser
- Use HTTPS in production (required for geolocation)
- Check browser console for errors

### Socket Connection Failed
- Verify backend server is running
- Check CORS settings in server.js
- Ensure correct SOCKET_URL in frontend .env

### MongoDB Connection Error
- Start MongoDB service
- Check MONGODB_URI in .env
- For cloud MongoDB, whitelist your IP address

## 📱 Mobile Usage

For best mobile experience:
1. Deploy to a public URL
2. Use HTTPS (required for location services)
3. Add to home screen for app-like experience

## 🔒 Security Considerations

- Room IDs are random and hard to guess
- No authentication required (public rooms)
- Location data stored temporarily
- Consider adding room passwords for private groups

## 🚀 Future Enhancements

- [ ] End-to-end encryption for location data
- [ ] Room passwords/PIN codes
- [ ] Chat functionality
- [ ] Location history/trail
- [ ] Geofencing alerts
- [ ] Multiple map providers (Google Maps, Mapbox)
- [ ] Offline mode with cached locations
- [ ] Battery optimization settings

## 📄 License

MIT License - feel free to use for personal or commercial projects!

## 👥 Contributing

Contributions welcome! Please feel free to submit a Pull Request.

---

**Built with ❤️ for better group coordination**
