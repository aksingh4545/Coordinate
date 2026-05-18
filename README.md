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
- **Kalman Filter**: Smooths GPS jitter for stable marker positions

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

### 5. Walkie-Talkie Channel
- **Push-to-Talk**: Hold button to transmit voice
- **Real-time Indicator**: See who's currently talking
- **Voice Activity Detection**: Auto-stops when you stop speaking
- **Member Status**: Visual indicator on who's speaking
- **Compact FAB Button**: Always visible at bottom-right corner

### 6. Emergency SOS
- **Long Press SOS**: Press anywhere on screen for 5 seconds to activate
- **Visual Progress**: Circular progress indicator shows hold progress
- **Countdown Timer**: 5-second countdown with cancel option
- **Live Alert**: All room members receive emergency notification instantly
- **Location Sharing**: SOS includes precise GPS location
- **Vibration**: Device vibrates during SOS activation
- **Visual Feedback**: Red pulsing button for easy activation
- **SOS Button**: Floating 🆘 button always accessible

### 7. Trip Mode (Smart Meeting Point)
- **Toggle Trip Mode**: Enable from host menu options
- **Fair Center Point**: Calculates optimal meeting point for all group members
- **Nearest Landmarks**: Finds popular places nearby using Google Places API
- **Nearest Exits/Gates**: Locates transit stations, airports, subway stations
- **Collapsible Panel**: Compact strip at top, expandable for details
- **Horizontal Scrolling**: Quick access cards for landmarks and exits
- **One-Tap Set Target**: Select any recommendation as meeting point
- **Google Places Integration**: Uses real-world location data via backend proxy

### 8. Map Features
- **Multiple Map Styles**: Switch between OpenStreetMap (standard) and Satellite views
- **Custom Markers**: Distinct markers for host, current user, and other members
  - 🟢 Green: Current user
  - 🟣 Purple: Host
  - 🩷 Pink: Other members
- **Dynamic Marker Sizing**: Markers scale smaller when zoomed in, larger when zoomed out
- **Connection Lines**: Visual lines showing relationships between members
- **Distance Labels**: Real-time distance display on map
- **Semi-Transparent Popups**: Minimal popup design for better map visibility
- **Smooth Transitions**: Markers animate smoothly between positions

### 9. Responsive Design
- **Mobile-First**: Optimized for mobile devices
- **Desktop Features**: Full feature set on desktop browsers
- **Compact Mobile UI**: Single-line top bar with Room ID and menu
- **Floating Components**: Walkie-talkie and SOS buttons at accessible positions

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
- **Google Places API** - Location data via backend proxy

---

## Project Structure

```
Coordinate/
├── Backend/
│   ├── server.js          # Main server entry point
│   ├── db.js              # MongoDB connection & operations
│   ├── package.json
│   └── Routes/
│       ├── group.js        # Group-related API routes
│       └── places.js       # Google Places API proxy routes
│
├── Frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── MapView.jsx         # Interactive map with dynamic markers
│   │   │   ├── LiveChat.jsx        # Walkie-talkie PTT button
│   │   │   ├── SOSOverlay.jsx     # Emergency SOS system
│   │   │   └── SmartMeetingPoint.jsx # Trip mode panel
│   │   ├── pages/
│   │   │   ├── HomePage.jsx       # Landing page
│   │   │   ├── HostRoomPage.jsx    # Host room management
│   │   │   ├── MemberRoomPage.jsx  # Member room view
│   │   │   └── JoinRoomPage.jsx   # Join room page
│   │   ├── context/
│   │   │   └── MapContext.jsx      # Global state + SOS management
│   │   ├── utils/
│   │   │   ├── locationSmoother.js  # Kalman filter implementation
│   │   │   └── placesService.js    # Google Places API service
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
- Google Maps API Key (optional - for Trip Mode features)

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
GOOGLE_MAPS_API_KEY=your_google_api_key
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
VITE_GOOGLE_MAPS_API_KEY=your_google_api_key
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

### Google Places (Proxy)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/places/nearby` | Find nearby places |
| GET | `/api/places/search` | Search for places |
| GET | `/api/places/directions` | Get route directions |
| GET | `/api/places/details` | Get place details |

### Socket Events

#### Client Emits:
- `user:join` - User joins a room
- `location:update` - Update user location
- `room:sync` - Request current room state
- `room:settings:update` - Update room settings (host only)
- `room:warning` - Send out-of-range warning
- `walkie:start` - Start push-to-talk transmission
- `walkie:stop` - Stop push-to-talk transmission
- `sos:activate` - Activate emergency SOS
- `sos:cancel` - Cancel emergency SOS
- `sos:countdown` - Broadcast countdown to others

#### Server Emits:
- `location:updated` - Location update broadcast
- `room:settings` - Room settings changed
- `room:warning` - Out-of-range warning
- `walkie:Speaking` - Someone started talking
- `walkie:Stopped` - Someone stopped talking
- `sos:activated` - SOS alert broadcast
- `sos:cancelled` - SOS cancelled
- `sos:countdown` - Countdown broadcast
- `user:left` - User left notification

---

## Configuration Options

### Room Settings
- **mode**: `"crowd"` or `"tracking"`
- **trackingRange**: Distance in meters (5-200)
- **targetLocation**: `{ lat: number, lng: number }`
- **mapStyle**: `"osm"` or `"satellite"`
- **tripMode**: `true` or `false`

---

## Deployment

### Backend (Render/Railway/DigitalOcean)
1. Set environment variables (`MONGODB_URI`, `FRONTEND_URL`, `GOOGLE_MAPS_API_KEY`)
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
3. Kalman filter smooths the GPS data
4. Location is sent via Socket.io to server
5. Server broadcasts to all room members
6. Map updates in real-time with smooth animations

### Walkie-Talkie
1. User holds the PTT button
2. Microphone activates, voice is monitored
3. "Speaking" indicator shows to other members
4. Voice activity detection auto-stops when silent
5. Release button to stop transmission

### Emergency SOS
1. User long-presses anywhere on screen (5 seconds)
2. Progress indicator shows hold progress
3. Countdown modal appears with cancel option
4. SOS activated → all members receive instant alert
5. Location and vibration included
6. Host can cancel anytime

### Trip Mode (Smart Meeting Point)
1. Host enables Trip Mode from menu
2. Fair center point calculated from all member locations
3. Google Places API finds nearby landmarks and exits
4. Results displayed in compact horizontal cards
5. Tap any option to set as target location
6. All members see the target on their maps

---

## License

ISC