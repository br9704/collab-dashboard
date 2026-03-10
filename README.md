# Collaborative Whiteboard Dashboard

Real-time collaborative drawing application with WebSocket-powered multi-user synchronization.

## Features

- ✅ **Real-time Cursor Tracking** - See other users' cursors (<100ms latency)
- ✅ **Shared Canvas Rendering** - Draw together and see strokes instantly
- ✅ **Multiple Shape Tools** - Pencil, line, rectangle, circle, text
- ✅ **Color Picker** - Choose custom colors for drawing
- ✅ **Text Annotations** - Add editable text boxes on canvas
- ✅ **User Presence** - See who's online in the session
- ✅ **Auto-Reconnection** - Graceful handling of network interruptions

## Tech Stack

- **Frontend:** React 18 + Vite + Socket.io Client
- **Backend:** Node.js + Express + Socket.io
- **Real-time:** WebSocket with fallback to HTTP polling

## Quick Start

### Backend
```bash
cd collab-backend
npm install
npm run dev
# Backend runs on http://localhost:3001
```

### Frontend
```bash
cd collab-frontend
npm install
npm run dev
# Frontend runs on http://localhost:5173
```

## Usage

1. Open **2+ browser windows** to http://localhost:5173
2. Click "New Session" to create a session (or "Join" with the session ID)
3. Draw on the canvas - other users will see it in real-time!

## Architecture

- **Sessions:** In-memory storage (one session per unique ID)
- **Events:** Real-time via Socket.io (WebSocket + polling fallback)
- **Latency:** <100ms cursor sync, <200ms shape sync

## Socket.io Events

### Client → Server
- `session-create` - Create new session
- `session-join` - Join existing session by ID
- `cursor-move` - Update cursor position
- `stroke-draw` - Draw a stroke on canvas
- `shape-draw` - Draw a shape (line, rect, circle)
- `text-add` - Add text annotation
- `text-update` - Edit text
- `text-delete` - Delete text
- `tool-change` - Change drawing tool/mode

### Server → Client
- `user-joined` - New user joined session
- `user-left` - User left session
- `cursor-update` - Other user's cursor moved
- `stroke-created` - Stroke was drawn
- `shape-created` - Shape was drawn
- `text-created` - Text was added
- `text-updated` - Text was edited
- `text-deleted` - Text was deleted
- `tool-changed` - Drawing tool changed

## Project Structure

```
collab-dashboard/
├── collab-backend/          # Node.js + Express server
│   ├── server.js            # Main Socket.io server
│   ├── .env                 # Environment variables
│   └── package.json
├── collab-frontend/         # React + Vite app
│   ├── src/
│   │   ├── App.jsx          # Main app component
│   │   ├── components/      # UI components
│   │   │   ├── Canvas.jsx           # Drawing canvas
│   │   │   ├── SessionManager.jsx   # Session UI
│   │   │   ├── UserList.jsx         # Online users
│   │   │   └── CursorPresence.jsx   # Remote cursors
│   │   └── hooks/           # Custom React hooks
│   │       ├── useSocket.js         # Socket.io connection
│   │       └── useSessionState.js   # Shared state management
│   └── index.html
└── README.md
```

## Performance Targets

- **Cursor latency:** <100ms end-to-end
- **Shape sync:** <200ms
- **FPS:** ≥60 FPS during drawing
- **Concurrent users:** 10+ per session
- **Bundle size:** <500 KB (frontend)

## Testing

### Multi-User Testing (Local)
```bash
# Terminal 1: Backend
cd collab-backend && npm run dev

# Terminal 2: Frontend
cd collab-frontend && npm run dev

# Terminal 3+: Open additional browser windows/tabs to http://localhost:5173
# Create/join same session → Draw together!
```

### Network Throttling
- DevTools → Network → Set throttling (Slow 3G, etc.)
- Verify app still responds (may see latency increase)

## Known Limitations

- **In-memory storage** - Sessions lost on server restart
- **No persistence** - Drawings not saved to database (future: Supabase)
- **No real authentication** - Simple socket ID-based (future: JWT)
- **Canvas size fixed** - Doesn't fully respond to window resize

## Future Enhancements

1. **Session Persistence** - Save drawings to Supabase PostgreSQL
2. **Real Authentication** - JWT + user accounts
3. **Undo/Redo** - Canvas operation history
4. **Export Canvas** - Download as PNG/SVG
5. **Collaborative Zoom** - Synchronized camera control
6. **Rich Text** - Formatted annotations with styles

---

Built by Claude Code for Bruno Jaamaa
Sprint 1-9 MVP: Collaborative real-time drawing dashboard
