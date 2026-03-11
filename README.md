# Collab Dashboard

A professional real-time collaborative whiteboard built with React, Socket.io, and Canvas API. Multiple users draw, diagram, and annotate simultaneously with sub-100ms latency.

![Version](https://img.shields.io/badge/version-4.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Features

### Canvas & Drawing
- **Freehand drawing** — pencil tool with configurable color and width
- **Geometric shapes** — line, rectangle, circle with click-drag
- **Smart shapes** — flowchart elements (process, decision, terminal, document, database), UML shapes (class, interface, actor), auto-connectors
- **AI shape completion** — recognizes rough sketches and snaps them to clean geometric shapes (circle, rectangle, line, triangle, diamond, arrow detection)
- **Text annotations** — click-to-place text boxes with inline editing
- **Text formatting** — bold, italic, underline, font size control via toolbar
- **Layers** — create, reorder, toggle visibility, delete layers
- **Camera** — pan and zoom with synchronized view across all collaborators

### Templates
- **Flowchart** — start → process → decision → end layout with connectors
- **Kanban Board** — To Do / In Progress / Done columns
- **Mobile Wireframe** — phone-shaped frame with UI placeholders
- **Sequence Diagram** — actor lifelines with message arrows
- **Mind Map** — central node with branching topics

### Media
- **Video embedding** — embed YouTube, Vimeo, or uploaded video files directly on the canvas
- **Export** — save canvas as PNG, SVG, or JSON

### Collaboration
- **Real-time cursors** — see every collaborator's cursor position with <100ms latency
- **Presence halos** — visual indicators showing who is actively drawing and where
- **Comments** — attach threaded comments to any stroke, with resolve/unresolve
- **Activity log** — timestamped feed of all session actions (joins, draws, role changes)
- **Toast notifications** — real-time alerts for user join/leave, role changes, template loads

### Roles & Permissions
- **Creator** — full access: draw, edit, manage users, export, delete session
- **Editor** — can draw, add shapes/text, undo/redo, comment; cannot manage users
- **Commenter** — can add/delete comments and use templates; cannot draw
- **Viewer** — read-only access
- **Advanced permissions** — granular per-user permission overrides (grant/revoke individual capabilities like `canvas:draw`, `layers:create`, `session:manage-users`)
- **Resource-level permissions** — permissions scoped to specific shapes/layers

### Quality
- **WCAG AA accessible** — ARIA labels, keyboard navigation, focus management, skip links
- **Error boundaries** — graceful error handling with recovery UI
- **Performance optimized** — requestAnimationFrame rendering, dirty tracking, ref-based state
- **Micro-interactions** — subtle animations on hover, transitions, smooth panel toggles

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| UI Framework | React | 19.x |
| Build Tool | Vite | 7.x |
| WebSocket Client | socket.io-client | 4.x |
| Runtime | Node.js | 22.x |
| HTTP Server | Express | 5.x |
| WebSocket Server | Socket.io | 4.x |
| Environment | dotenv | 17.x |
| ID Generation | uuid | 13.x |
| CORS | cors | 2.x |

---

## Quick Start

### Prerequisites

- Node.js 18+ installed
- npm or yarn

### 1. Start the backend

```bash
cd collab-backend
npm install
npm start
# Server listens on http://localhost:3001
```

### 2. Start the frontend

```bash
cd collab-frontend
npm install
npm run dev
# Opens at http://localhost:5173
```

### 3. Collaborate

1. Open two (or more) browser tabs at `http://localhost:5173`
2. Click **New Session** in the first tab
3. Copy the session ID and **Join Session** from the second tab
4. Draw — strokes, shapes, and cursors sync in real-time

---

## Project Structure

```
collab-dashboard/
├── collab-backend/
│   ├── server.js              # Express + Socket.io server, all event handlers
│   ├── roles.js               # Role constants + permission matrix
│   ├── package.json
│   └── .env                   # PORT, CORS config
│
├── collab-frontend/
│   ├── index.html             # Vite entry
│   ├── vite.config.js         # Vite config (React plugin)
│   ├── package.json
│   └── src/
│       ├── main.jsx                          # React mount
│       ├── App.jsx                           # Root — session flow, panel state, v4 integrations
│       ├── App.css                           # Global layout + sidebar styles
│       ├── index.css                         # Base reset + design tokens
│       │
│       ├── components/
│       │   ├── Canvas.jsx                    # Core drawing surface (pencil, shapes, text, smart shapes, AI, video)
│       │   ├── SessionManager.jsx            # Create / join session UI
│       │   ├── UserList.jsx                  # Online user avatars + roles
│       │   ├── CursorPresence.jsx            # Remote cursor rendering
│       │   ├── PresenceHalo.jsx              # Active-drawing glow indicators
│       │   ├── LatencyMeter.jsx              # Live latency readout
│       │   ├── UndoRedoControls.jsx          # Undo / redo buttons
│       │   ├── LayersPanel.jsx               # Layer management sidebar
│       │   ├── CommentsPanel.jsx             # Stroke comment threads
│       │   ├── ActivityLog.jsx               # Session activity feed
│       │   ├── RolesPanel.jsx                # Role assignment (admin)
│       │   ├── TextInputDialog.jsx           # Modal text input (replaced prompt())
│       │   ├── TextFormattingToolbar.jsx      # Bold / italic / underline / size
│       │   ├── ExportDialog.jsx              # PNG / SVG / JSON export
│       │   ├── TemplateManager.jsx           # Template browser + loader
│       │   ├── SmartShapes.jsx               # Smart shape palette sidebar
│       │   ├── AICompletion.jsx              # AI shape completion overlay
│       │   ├── VideoEmbed.jsx                # Video embed dialog
│       │   ├── VideoEmbedCanvas.jsx          # Draggable video overlays on canvas
│       │   ├── AdvancedPermissions.jsx       # Granular permission editor
│       │   ├── Toast.jsx                     # Toast notification system
│       │   ├── ErrorBoundary.jsx             # React error boundary
│       │   └── *.css                         # Co-located component styles
│       │
│       ├── hooks/
│       │   ├── useSocket.js                  # Socket.io connection + reconnect
│       │   └── useSessionState.js            # Session state sync from server
│       │
│       ├── utils/
│       │   ├── permissions.js                # Advanced permission classes
│       │   ├── shapeUtils.js                 # Shape type configs + connectors
│       │   └── shapeRecognition.js           # Stroke → shape recognition engine
│       │
│       └── data/
│           └── templates.js                  # Pre-made template definitions
│
├── MASTER_PLAN.md             # Sprint history, architecture, roadmap
├── CLAUDE.md                  # AI-friendly project context
└── README.md                  # This file
```

---

## Design System

The UI follows a **white and neutral grey** palette — no brand colors.

| Token | Value | Usage |
|-------|-------|-------|
| Background | `#ffffff` | Canvas, inputs, panels |
| Surface | `#f8f9fa` | Cards, sidebars |
| Border | `#e5e7eb` | Input borders, dividers |
| Text Primary | `#1a1a1a` | Body text |
| Text Secondary | `#6b7280` | Labels, placeholders |
| Focus Ring | `#6b7280` | Input focus state |
| Accent (neutral) | `#4b5563` | Buttons, active states |
| Error | `#ef4444` | Error states only |

Borders are 1px, radius 4px, shadows subtle (`0 2px 8px rgba(0,0,0,0.08)`). Touch targets ≥ 44px.

---

## Real-Time Architecture

```
User A draws a stroke
  │
  ▼
Canvas captures pointer events
  │
  ▼
Client emits 'stroke-draw' via Socket.io (WebSocket transport)
  │
  ▼
Server receives → permission check (role-based) → stores in Session
  │
  ▼
Server broadcasts 'stroke-created' to all users in session room
  │
  ▼
All clients render the stroke on their canvas
  │
  (end-to-end latency: 50–80ms on LAN)
```

**Key events:**

| Direction | Event | Purpose |
|-----------|-------|---------|
| C → S | `session-create` | Create session, assign creator role |
| C → S | `session-join` | Join session as viewer |
| C → S | `cursor-move` | Send cursor position |
| C → S | `stroke-draw` | Draw freehand stroke |
| C → S | `shape-draw` | Draw geometric/smart shape |
| C → S | `text-add` / `text-update` / `text-delete` | Text CRUD |
| C → S | `undo` / `redo` | History navigation |
| C → S | `role-change` | Change user role (creator only) |
| C → S | `comment-add` / `comment-resolve` | Comment management |
| C → S | `camera-change` | Pan/zoom sync |
| S → C | `stroke-created` / `shape-created` / `text-created` | Content broadcast |
| S → C | `user-joined` / `user-left` | Presence updates |
| S → C | `role-updated` | Role change broadcast |
| S → C | `undo-applied` / `redo-applied` | History broadcast |

---

## Role & Permission Model

### Base Roles (Backend — `roles.js`)

| Role | Draw | Edit Text | Shapes | Manage Users | Export | Delete Session |
|------|------|-----------|--------|-------------|--------|----------------|
| Creator | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Editor | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Viewer | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Advanced Permissions (Frontend — `permissions.js`)

The frontend adds a **Commenter** role and supports **granular per-user overrides**:

- 30+ individual permission flags (e.g., `canvas:draw`, `layers:create`, `session:kick-users`, `ai:completion`)
- Resource-level permissions (grant/revoke per specific shape or layer)
- Permission inheritance with explicit deny override

Session creators can manage all permissions via the 🔐 **Permissions** panel.

---

## Deployment

### Backend (any Node.js host)

```bash
cd collab-backend
npm install
NODE_ENV=production PORT=3001 node server.js
```

Set `CORS_ORIGIN` in `.env` to your frontend URL.

### Frontend (static hosting)

```bash
cd collab-frontend
npm install
npm run build
# Deploy dist/ to Vercel, Netlify, Cloudflare Pages, etc.
```

Set `VITE_API_URL` and `VITE_SOCKET_URL` to your backend URL before building.

### Docker (optional)

```dockerfile
# Backend
FROM node:22-alpine
WORKDIR /app
COPY collab-backend/ .
RUN npm install --production
EXPOSE 3001
CMD ["node", "server.js"]
```

---

## Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Follow the design system (white/grey palette, no brand colors)
4. Add JSDoc comments to exported functions
5. Test with 2+ browser tabs for real-time sync
6. Commit with conventional commits: `feat:`, `fix:`, `docs:`, `style:`, `perf:`
7. Open a PR with a clear description

---

## License

MIT — free for personal and commercial use.

---

**Author:** Bruno Jaamaa  
**Built with:** React 19, Socket.io 4, Vite 7, Express 5
