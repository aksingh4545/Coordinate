# Graph Report - C:\Users\ACER\Desktop\coordinator\Coordinate  (2026-05-18)

## Corpus Check
- 42 files · ~235,044 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 232 nodes · 315 edges · 17 communities (9 shown, 8 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.73)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Backend Server & DB|Backend Server & DB]]
- [[_COMMUNITY_Frontend UI Layer|Frontend UI Layer]]
- [[_COMMUNITY_API & Core Stack|API & Core Stack]]
- [[_COMMUNITY_Deployment & DevOps|Deployment & DevOps]]
- [[_COMMUNITY_Frontend Dependencies|Frontend Dependencies]]
- [[_COMMUNITY_Map & UI Dependencies|Map & UI Dependencies]]
- [[_COMMUNITY_Backend Package Config|Backend Package Config]]
- [[_COMMUNITY_Express Routes & QR|Express Routes & QR]]
- [[_COMMUNITY_MapView Internal|MapView Internal]]
- [[_COMMUNITY_GPS Accuracy Manager|GPS Accuracy Manager]]
- [[_COMMUNITY_Location Smoother|Location Smoother]]
- [[_COMMUNITY_Kalman Filter|Kalman Filter]]
- [[_COMMUNITY_Backend Vercel Config|Backend Vercel Config]]
- [[_COMMUNITY_Frontend Vercel Config|Frontend Vercel Config]]
- [[_COMMUNITY_Frontend Docs|Frontend Docs]]
- [[_COMMUNITY_React Logo|React Logo]]

## God Nodes (most connected - your core abstractions)
1. `useMap()` - 19 edges
2. `LocationSmoother` - 8 edges
3. `GpsAccuracyManager` - 7 edges
4. `scripts` - 5 edges
5. `getAuthUser()` - 5 edges
6. `scripts` - 4 edges
7. `SimpleKalmanFilter` - 4 edges
8. `connectDB()` - 3 edges
9. `isDBConnected()` - 3 edges
10. `safeMongoOperation()` - 3 edges

## Surprising Connections (you probably didn't know these)
- `RouteUpdaterWithState()` --calls--> `useMap()`  [EXTRACTED]
  Frontend/src/components/MapView.jsx → Frontend/src/context/MapContext.jsx
- `CallModal()` --calls--> `useMap()`  [EXTRACTED]
  Frontend/src/components/CallModal.jsx → Frontend/src/context/MapContext.jsx
- `LiveChat()` --calls--> `useMap()`  [EXTRACTED]
  Frontend/src/components/LiveChat.jsx → Frontend/src/context/MapContext.jsx
- `SOSOverlay()` --calls--> `useMap()`  [EXTRACTED]
  Frontend/src/components/SOSOverlay.jsx → Frontend/src/context/MapContext.jsx
- `HomePage()` --calls--> `useMap()`  [EXTRACTED]
  Frontend/src/pages/HomePage.jsx → Frontend/src/context/MapContext.jsx

## Hyperedges (group relationships)
- **** — DEPLOYMENT_CHECKLIST, DEPLOY_QUICK, RENDER_FIX, RENDER_YAML [EXTRACTED 1.00]
- **** — GIT_WORKFLOW_GUIDE, QUICK_GIT_GUIDE [EXTRACTED 1.00]
- **** — API_CREATE_ROOM, API_JOIN_ROOM, API_GET_ROOM, API_LEAVE_ROOM [EXTRACTED 1.00]
- **** — API_PLACES_NEARBY, API_PLACES_SEARCH, API_PLACES_DIRECTIONS, API_PLACES_DETAILS [EXTRACTED 1.00]
- **** — MAPVIEW, LIVECHAT, SOS_OVERLAY, SMART_MEETING [EXTRACTED 1.00]
- **** — HOMEPAGE, HOST_ROOM_PAGE, MEMBER_ROOM_PAGE, JOIN_ROOM_PAGE [EXTRACTED 1.00]
- **** — MAIN_BRANCH, PRODUCTION_BRANCH, DEVELOP_BRANCH [EXTRACTED 1.00]

## Communities (17 total, 8 thin omitted)

### Community 0 - "Backend Server & DB"
Cohesion: 0.06
Nodes (32): connectDB(), getRoomsCollection(), getTripsCollection(), getUsersCollection(), isDBConnected(), allowedKeys, app, doc (+24 more)

### Community 1 - "Frontend UI Layer"
Cohesion: 0.11
Nodes (15): CallModal(), LiveChat(), SOSOverlay(), MapContext, MapProvider(), useMap(), HomePage(), HostRoomPage() (+7 more)

### Community 2 - "API & Core Stack"
Cohesion: 0.06
Nodes (35): GET /api/rooms/:roomId, POST /api/rooms/join, POST /api/rooms/:roomId/leave, GET /api/places/details, GET /api/places/directions, GET /api/places/nearby, GET /api/places/search, db.js MongoDB Operations (+27 more)

### Community 3 - "Deployment & DevOps"
Cohesion: 0.1
Nodes (22): POST /api/rooms/create, Deployment Checklist, GitHub Actions Deploy Frontend, Deploy Quick Guide, develop Branch, GitHub Actions, Git Workflow Guide, main Branch (+14 more)

### Community 4 - "Frontend Dependencies"
Cohesion: 0.11
Nodes (18): devDependencies, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, @types/react, @types/react-dom (+10 more)

### Community 5 - "Map & UI Dependencies"
Cohesion: 0.14
Nodes (14): React Leaflet, World Map Background, dependencies, axios, leaflet, lucide-react, react, react-dom (+6 more)

### Community 6 - "Backend Package Config"
Cohesion: 0.15
Nodes (12): author, description, keywords, license, main, name, scripts, dev (+4 more)

### Community 7 - "Express Routes & QR"
Cohesion: 0.15
Nodes (11): Express, QRCode Library, express, qrcode, qrcode, group, router, contentType (+3 more)

## Knowledge Gaps
- **76 isolated node(s):** `client`, `name`, `version`, `type`, `main` (+71 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Map & UI Dependencies` to `Frontend Dependencies`, `Express Routes & QR`?**
  _High betweenness centrality (0.164) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Deployment & DevOps` to `Backend Package Config`, `Express Routes & QR`?**
  _High betweenness centrality (0.130) - this node is a cross-community bridge._
- **Why does `qrcode` connect `Express Routes & QR` to `Map & UI Dependencies`?**
  _High betweenness centrality (0.124) - this node is a cross-community bridge._
- **What connects `client`, `name`, `version` to the rest of the system?**
  _76 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Backend Server & DB` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Frontend UI Layer` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._
- **Should `API & Core Stack` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._