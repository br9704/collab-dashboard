# CLAUDE.md — AI Project Context

> Use this file to onboard AI coding assistants (Claude Code, Codex, etc.) to the Collab Dashboard project.

---

## What This Is

A real-time collaborative whiteboard. Users create/join sessions, draw together on a shared canvas, and see each other's cursors live. Think Figma/Miro but built from scratch with React + Socket.io.

**Version:** v4.0 with v5 quality improvements applied.

---

## Monorepo Layout

```
collab-dashboard/
├── collab-frontend/   ← React app (Vite 7, React 19)
├── collab-backend/    ← Node.js server (Express 5, Socket.io 4)
├── README.md
├── MASTER_PLAN.md
└── CLAUDE.md          ← You are here
```

---

## Frontend (`collab-frontend/`)

### Entry Points
- `index.html` → `src/main.jsx` → `src/App.jsx`

### Key Patterns
- **No router** — single-page app with conditional rendering (session manager vs canvas)
- **State flow:** `useSocket` hook manages Socket.io connection → `useSessionState` syncs all session data from server events → passed as props to components
- **Drawing:** HTML5 Canvas API via `useRef` on `<canvas>`. All drawing in `Canvas.jsx` (~800 lines)
- **Panels:** Sidebar panels (Layers, Comments, Activity, Roles, Permissions, Smart Shapes) toggled by boolean state in `App.jsx`
- **Modals:** TemplateManager and VideoEmbed rendered outside `main-container` to avoid overflow clipping
- **CSS:** Co-located `.css` files per component. Global tokens in `index.css` and `App.css`

### Component Map
| Component | Purpose | Key Props |
|-----------|---------|-----------|
| `App.jsx` | Root orchestrator — session flow, panel toggles, event wiring | — |
| `Canvas.jsx` | Core drawing surface — pencil, shapes, text, smart shapes, AI completion, video overlays | `socket`, `sessionState`, `userRole`, `selectedSmartShape` |
| `SessionManager.jsx` | Create/join session UI | `socket`, `onSessionJoin` |
| `UserList.jsx` | Shows online users with role badges | `users`, `sessionMembers` |
| `CursorPresence.jsx` | Renders remote users' cursors | `socket`, `cursors`, `users` |
| `PresenceHalo.jsx` | Glow effect showing who's drawing where | `userPresence`, `users` |
| `LayersPanel.jsx` | Create/reorder/toggle/delete layers | `layers`, `onLayerCreate`, etc. |
| `CommentsPanel.jsx` | Thread comments on a selected stroke | `socket`, `strokeId`, `comments` |
| `ActivityLog.jsx` | Timestamped session activity feed | `activityLog`, `users` |
| `RolesPanel.jsx` | Admin role assignment dropdowns | `socket`, `users`, `sessionMembers` |
| `AdvancedPermissions.jsx` | Granular per-user permission editor | `users`, `permissionManager` |
| `TemplateManager.jsx` | Browse + load templates (modal) | `isOpen`, `onLoadTemplate` |
| `SmartShapes.jsx` | Smart shape palette sidebar | `onShapeSelected`, `selectedShape` |
| `AICompletion.jsx` | AI shape completion suggestion overlay | (internal to Canvas) |
| `VideoEmbed.jsx` | YouTube/Vimeo/file embed dialog | `isOpen`, `onVideoEmbed` |
| `VideoEmbedCanvas.jsx` | Draggable video overlays on canvas | (internal to Canvas) |
| `TextInputDialog.jsx` | Modal text input (replaced `prompt()`) | `x`, `y`, `onSubmit`, `onCancel` |
| `TextFormattingToolbar.jsx` | Bold/italic/underline/size toolbar | `isVisible`, formatting callbacks |
| `ExportDialog.jsx` | PNG/SVG/JSON export | `isOpen`, canvas ref |
| `Toast.jsx` | Toast notification system | via `useToast()` hook |
| `ErrorBoundary.jsx` | React error boundary with fallback UI | wraps `main-container` |
| `LatencyMeter.jsx` | Live ping display | `socket` |
| `UndoRedoControls.jsx` | Undo/redo buttons | `socket`, `historyIndex` |

### Hooks
| Hook | Purpose |
|------|---------|
| `useSocket(url)` | Creates Socket.io connection, handles reconnect, returns `{ socket, connected, error }` |
| `useSessionState(socket, sessionId)` | Listens to all server events, returns full session state object |

### Utilities
| File | Purpose |
|------|---------|
| `permissions.js` | `SessionPermissionManager`, `UserPermissions`, `BASE_ROLES`, `PERMISSIONS` constants |
| `shapeUtils.js` | Shape type definitions (`SHAPE_TYPES`), shape config (`SHAPE_CONFIG`), connector logic |
| `shapeRecognition.js` | Stroke → shape recognition (circle, rectangle, triangle, diamond, arrow, line) |
| `data/templates.js` | 5 pre-made template definitions + helper functions |

### Design System
- **Palette:** White (`#fff`) + neutral greys (`#f8f9fa`, `#e5e7eb`, `#6b7280`, `#1a1a1a`)
- **No brand colors.** No blue, purple, or green in the UI.
- **Borders:** 1px solid `#e5e7eb`, radius 4px
- **Touch targets:** ≥ 44px
- **Font:** system font stack, 16px base

### Build
```bash
npm run dev    # Vite dev server on :5173
npm run build  # Production build → dist/
```

---

## Backend (`collab-backend/`)

### Files
- `server.js` — Everything: Express setup, Socket.io config, Session class, all event handlers, shape recognition helpers
- `roles.js` — Role constants (`CREATOR`, `EDITOR`, `VIEWER`) + permission matrix + helper functions

### Session Model (in-memory)
```javascript
class Session {
  id, name, creator, createdAt
  users: Set              // connected socket IDs
  sessionMembers: {}      // { socketId: { role: 'creator'|'editor'|'viewer' } }
  cursors: {}             // { socketId: { x, y, timestamp } }
  strokes: []             // freehand stroke objects
  shapes: []              // geometric shape objects
  textBoxes: []           // text annotation objects
  comments: []            // { id, strokeId, text, author, resolved }
  history: []             // undo/redo stack
  historyIndex: number
  camera: { x, y, zoom }
  userPresence: {}        // { socketId: { cursor, isDrawing, lastActivity, activeArea } }
  activityLog: []         // { action, userId, timestamp, details }
}
```

### Permission Model
Every socket handler checks permissions via `canPerformAction(userRole, action)` before mutating state. The permission matrix in `roles.js` maps actions to allowed roles:
- `draw-stroke`, `draw-shape`, `add-text`, `edit-text`, `delete-text` → Creator + Editor
- `change-user-role`, `remove-user`, `delete-session`, `export-session` → Creator only
- `add-comment` → All roles
- `resolve-comment`, `undo`, `redo` → Creator + Editor

### Socket Events (server-side)
| Event | Permission | Behavior |
|-------|-----------|----------|
| `session-create` | Any | Creates session, assigns CREATOR role |
| `session-join` | Any | Joins session with VIEWER role |
| `stroke-draw` | Creator/Editor | Stores stroke, broadcasts `stroke-created` |
| `shape-draw` | Creator/Editor | Shape recognition → stores → broadcasts `shape-created` |
| `text-add` | Creator/Editor | Stores text box, broadcasts `text-created` |
| `text-update` | Creator/Editor | Last-write-wins, owner only, broadcasts `text-updated` |
| `text-delete` | Creator/Editor | Owner only, broadcasts `text-deleted` |
| `undo` / `redo` | Creator/Editor | Navigates history, broadcasts `undo-applied`/`redo-applied` |
| `role-change` | Creator only | Updates role, broadcasts `role-updated` |
| `comment-add` | All | Stores comment, broadcasts `comment-created` |
| `comment-resolve` | Any | Marks resolved, broadcasts `comment-resolved` |
| `cursor-move` | Any | Updates cursor + presence, broadcasts `cursor-update` |
| `camera-change` | Any | Updates session camera, broadcasts `camera-updated` |
| `disconnect` | — | Removes user, cleans up empty sessions |

### Running
```bash
npm start      # node server.js on :3001
npm run dev    # same
```

### Environment
```
PORT=3001
CORS_ORIGIN=http://localhost:5173
```

---

## Common Tasks

### Add a new drawing tool
1. Add tool button in `Canvas.jsx` toolbar section
2. Handle mouse events for the new tool in the `handleMouseDown/Move/Up` functions
3. Emit appropriate socket event (`stroke-draw` or `shape-draw`)
4. Add rendering logic in the canvas redraw function

### Add a new panel
1. Create `NewPanel.jsx` + `NewPanel.css` in `components/`
2. Add toggle state in `App.jsx`
3. Add toggle button in sidebar
4. If it needs socket events, add handlers in `server.js`

### Add a new permission
1. Add to `PERMISSIONS` object in backend `roles.js`
2. Add to `PERMISSIONS` constant in frontend `utils/permissions.js`
3. Add to `ROLE_PERMISSIONS` mapping
4. Add `canPerformAction()` check in the relevant socket handler

### Add a new template
1. Add template definition in `src/data/templates.js`
2. Follow the existing structure: `{ id, name, description, category, initialShapes, initialStrokes, initialLayers }`

---

## Gotchas

- **No database** — all session data is in-memory. Server restart = data loss.
- **No auth** — users are identified by socket ID only.
- **Canvas.jsx is large** (~800 lines) — it handles all drawing tools, rendering, and interactions. Consider splitting if adding more tools.
- **Backend is one file** — `server.js` has the Session class + all handlers. Consider modularizing for scale.
- **Text ownership** — only the creator of a text box can edit/delete it (checked server-side).
- **Auto-save intervals** — created per session in `session-create`, cleaned up on delete. Logs only (no actual persistence).
- **Shape recognition** — basic heuristic (collinearity, bounding box corner proximity, radius variance). Not ML-based.

---

## Commit Convention

```
feat: new feature
fix: bug fix
docs: documentation
style: CSS/formatting (no logic change)
perf: performance improvement
a11y: accessibility
chore: tooling, cleanup
```
