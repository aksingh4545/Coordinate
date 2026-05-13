# Coordinator

A real-time location sharing and group coordination application that helps people find each other in crowded places. Built with the MERN stack (MongoDB, Express, React, Node.js) and Socket.io for real-time communication.

---

## Features

### 1. Room Management
- **Create Room**: Host can create a group room with a unique 8-character room ID
- **Join Room**: Members can join using room ID or by scanning a QR code
- **QR Code Sharing**: Auto-generated QR codes for easy room sharing
- **Leave Room**: Members can leave at any time; room closes when host leaves

### 2. Real-Time Location Tracking
- **Live GPS Tracking**: Real-time location updates using browser Geolocation API
- **Map Visualization**: Interactive map showing all member locations
- **Distance Calculation**: Shows distance between each member and the host
- **Auto-Center**: Map automatically centers on all group members

### 3. Two Operating Modes
- **Crowd Mode**: Basic location sharing with connection lines between members
- **Tracking Mode**: Advanced mode with:
  - Configurable tracking range (5-200 meters)
  - Automatic alerts when members fall behind the group
  - Range visualization circles on the map

### 4. Target Navigation
- **Set Target Location**: Host can set a destination on the map
- **Live Navigation**: Shows distance, bearing (direction), and estimated time of arrival
- **Visual Path**: Dashed lines connecting all members to the target

### 5. Live Chat
- **Text Messaging**: Real-time text chat between all room members
- **Voice Messages**: Record and send voice messages (up to 20 seconds)
- **Member List**: Shows all online members with their distances
- **Notification Sounds**: Audio alerts for incoming messages

### 6. Map Features
- **Multiple Map Styles**: Switch between OpenStreetMap (standard) and Satellite views
- **Custom Markers**: Distinct markers for host, current user, and other members
- **Connection Lines**: Visual lines showing relationships between members
- **Distance Labels**: Real-time distance display on map

### 7. Responsive Design
- **Mobile-First**: Optimized for mobile devices
- **Desktop Features**: Full feature set on desktop browsers
- **Touch Gestures**: Swipe to expand/collapse chat on mobile

---

## Tech Stack

### Frontend
- **React 19** - UI framework
- **Vite** - Build tool and dev server
- **Tailwind CSS 4** - Styling
- **React Leaflet** - Interactive maps (OpenStreetMap)
- **Socket.io Client** - Real-time communication
- **React Router** - Client-side routing

### Backend
- **Node.js** - Runtime environment
- **Express** - Web framework
- **Socket.io** - Real-time WebSocket server
- **MongoDB** - Database (with in-memory fallback)
- **QRCode** - QR code generation

---

## Project Structure

```
Coordinate/
├── Backend/
│   ├── server.js          # Main server entry point
│   ├── db.js              # MongoDB connection & operations
│   ├── package.json
│   └── Routes/
│       └── group.js       # Group-related API routes
│
├── Frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── MapView.jsx      # Interactive map component
│   │   │   └── LiveChat.jsx    # Chat component with voice
│   │   ├── pages/
│   │   │   ├── HomePage.jsx    # Landing page
│   │   │   ├── HostRoomPage.jsx # Host room management
│   │   │   ├── MemberRoomPage.jsx # Member room view
│   │   │   └── JoinRoomPage.jsx # Join room page
│   │   ├── context/
│   │   │   └── MapContext.jsx  # Global state management
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── package.json
│   └── index.html
│
└── README.md
```

---

## Installation & Setup

### Prerequisites
- Node.js (v18 or higher)
- MongoDB (optional - app works without it)

### Backend Setup

```bash
cd Backend
npm install
```

Create a `.env` file in Backend directory:
```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
FRONTEND_URL=http://localhost:5173
```

Start the backend server:
```bash
npm start
# or for development
npm run dev
```

### Frontend Setup

```bash
cd Frontend
npm install
```

Create a `.env` file in Frontend directory:
```env
VITE_SOCKET_URL=http://localhost:5000
```

Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:5173`

---

## API Endpoints

### Room Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/rooms/create` | Create a new room |
| POST | `/api/rooms/join` | Join an existing room |
| GET | `/api/rooms/:roomId` | Get room details |
| POST | `/api/rooms/:roomId/leave` | Leave a room |

### Socket Events

#### Client Emits:
- `user:join` - User joins a room
- `location:update` - Update user location
- `room:sync` - Request current room state
- `room:settings:update` - Update room settings (host only)
- `chat:message` - Send text message
- `chat:voice` - Send voice message
- `chat:history` - Request chat history

#### Server Emits:
- `location:updated` - Location update broadcast
- `room:settings` - Room settings changed
- `room:warning` - Out-of-range warning
- `chat:message` - New text message
- `chat:voice` - New voice message
- `user:left` - User left notification

---

## Configuration Options

### Room Settings
- **mode**: `"crowd"` or `"tracking"`
- **trackingRange**: Distance in meters (5-200)
- **targetLocation**: `{ lat: number, lng: number }`
- **mapStyle**: `"osm"` or `"satellite"`

---

## Deployment

### Backend (Render/Railway/DigitalOcean)
1. Set environment variables (`MONGODB_URI`, `FRONTEND_URL`)
2. Deploy from the Backend folder
3. Note: Works with in-memory storage if MongoDB unavailable

### Frontend (Vercel/Netlify)
1. Build: `npm run build`
2. Deploy the `dist` folder
3. Configure environment variable `VITE_SOCKET_URL` to your backend URL

---

## How It Works

### Creating a Room
1. User enters their name on the home page
2. Clicks "Create Room"
3. Backend generates a unique 8-character room ID
4. Room is saved to MongoDB (or memory fallback)
5. QR code is generated for easy sharing

### Joining a Room
1. User enters room ID or scans QR code
2. Enters their name
3. Backend validates room exists and is active
4. User is added to room members
5. Redirected to room page

### Location Sharing
1. User grants browser location permission
2. Geolocation API provides coordinates
3. Location is sent via Socket.io to server
4. Server broadcasts to all room members
5. Map updates in real-time

### Chat System
1. Text messages sent via Socket.io
2. Voice messages recorded as WebM audio
3. Audio converted to base64 for transmission
4. Messages stored in memory/map
5. Recent 100 messages kept per room

---

## License

ISC