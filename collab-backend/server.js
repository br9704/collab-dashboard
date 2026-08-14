const express = require('express');
const { createServer } = require('http');
const { Server: SocketIOServer } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { ROLES, canPerformAction, getDefaultRole, getCreatorRole } = require('./roles');
require('dotenv').config();

const app = express();
app.use(cors());

const server = createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling'],
  pingInterval: 25000,
  pingTimeout: 60000
});

const PORT = process.env.PORT || 3001;

// ==========================================
// SPRINT 10-11: Session & Persistence Setup
// ==========================================

// In-memory session storage. NOT persistent: every session, stroke, comment and role is
// lost on restart, and this cannot scale past a single process. Replaced by a Yjs document
// store in Sprint 2 — see masterplan.md.
const sessions = new Map();

// Enhanced Session class with history, permissions, comments, activity log
class Session {
  constructor(sessionId) {
    this.id = sessionId;
    this.name = `Session ${sessionId.slice(0, 6)}`;
    this.creator = null;
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
    
    // Real-time state
    this.users = new Set();
    this.sessionMembers = {}; // { userId: { role: 'admin'|'editor'|'viewer' } }
    this.cursors = {};
    this.strokes = [];
    this.shapes = [];
    this.textBoxes = [];
    this.comments = []; // Sprint 17
    this.mode = 'pencil';
    
    // Sprint 10-11: Undo/Redo history
    this.history = [];
    this.historyIndex = -1;
    this.maxHistorySize = 100;
    
    // Sprint 13-14: Shared camera state
    this.camera = {
      x: 0,
      y: 0,
      zoom: 1,
      timestamp: Date.now()
    };
    
    // Sprint 16: Presence awareness
    this.userPresence = {}; // { userId: { isDrawing, lastActivity, activeArea } }
    
    // Sprint 18: Activity log
    this.activityLog = [];
    
    // Sprint 18: Shape recognition (snapping rules)
    this.shapeRecognitionEnabled = true;
  }

  addUser(userId, role = 'editor') {
    this.users.add(userId);
    this.sessionMembers[userId] = { role };
    this.userPresence[userId] = {
      cursor: { x: 0, y: 0 },
      isDrawing: false,
      lastActivity: Date.now(),
      activeArea: null
    };
    this.logActivity('user-joined', userId, { userName: userId.slice(0, 8) });
    return this.users.size;
  }

  removeUser(userId) {
    this.users.delete(userId);
    delete this.cursors[userId];
    delete this.sessionMembers[userId];
    delete this.userPresence[userId];
    this.logActivity('user-left', userId, { userName: userId.slice(0, 8) });
    return this.users.size === 0;
  }

  // Sprint 10-11: History management (Undo/Redo)
  addToHistory(action, payload, userId) {
    // Remove any redo items if we're adding new history
    this.history = this.history.slice(0, this.historyIndex + 1);
    
    // Add new action
    this.history.push({
      action,
      payload,
      userId,
      timestamp: Date.now()
    });
    
    // Limit history size
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    } else {
      this.historyIndex++;
    }
  }

  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      return {
        success: true,
        operationIndex: this.historyIndex,
        history: this.history
      };
    }
    return { success: false };
  }

  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      return {
        success: true,
        operationIndex: this.historyIndex,
        history: this.history
      };
    }
    return { success: false };
  }

  // Sprint 18: Activity logging
  logActivity(action, userId, details = {}) {
    this.activityLog.push({
      action,
      userId,
      timestamp: Date.now(),
      details
    });
    
    // Keep last 1000 activities
    if (this.activityLog.length > 1000) {
      this.activityLog.shift();
    }
  }

  // Sprint 17: Comment management
  addComment(strokeId, text, author) {
    const comment = {
      id: Date.now() + Math.random(),
      strokeId,
      text,
      author,
      timestamp: Date.now(),
      resolved: false
    };
    
    this.comments.push(comment);
    return comment;
  }

  getCommentsFor(strokeId) {
    return this.comments.filter(c => c.strokeId === strokeId);
  }

  resolveComment(commentId) {
    const comment = this.comments.find(c => c.id === commentId);
    if (comment) {
      comment.resolved = true;
    }
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      creator: this.creator,
      createdAt: this.createdAt,
      users: Array.from(this.users),
      sessionMembers: this.sessionMembers,
      cursors: this.cursors,
      strokes: this.strokes,
      shapes: this.shapes,
      textBoxes: this.textBoxes,
      comments: this.comments,
      mode: this.mode,
      camera: this.camera,
      userPresence: this.userPresence,
      history: this.history,
      historyIndex: this.historyIndex,
      activityLog: this.activityLog.slice(-50) // Last 50 activities
    };
  }
}

function createSession(sessionId = null) {
  const id = sessionId || `sess_${Math.random().toString(36).slice(2, 10)}`;
  const session = new Session(id);
  sessions.set(id, session);
  console.log(`[SESSION] Created: ${id}`);
  return session;
}

function getSession(sessionId) {
  return sessions.get(sessionId);
}

function deleteSession(sessionId) {
  sessions.delete(sessionId);
  console.log(`[SESSION] Deleted: ${sessionId}`);
}

// Sprint 18: Shape recognition helper
function recognizeShape(points) {
  if (points.length < 3) return null;
  
  // Check if points form a line (all collinear)
  const isLine = checkCollinear(points);
  if (isLine) return { type: 'line' };
  
  // Check if points form a rectangle
  const rect = checkRectangle(points);
  if (rect) return { type: 'rectangle', bounds: rect };
  
  // Check if points form a circle
  const circle = checkCircle(points);
  if (circle) return { type: 'circle', center: circle.center, radius: circle.radius };
  
  return null;
}

function checkCollinear(points) {
  if (points.length < 3) return false;
  // Simple check: if points have similar angles, they're collinear
  const tolerance = 0.1;
  for (let i = 1; i < points.length - 1; i++) {
    const angle1 = Math.atan2(points[i].y - points[i-1].y, points[i].x - points[i-1].x);
    const angle2 = Math.atan2(points[i+1].y - points[i].y, points[i+1].x - points[i].x);
    if (Math.abs(angle1 - angle2) > tolerance && Math.abs(angle1 - angle2) < Math.PI - tolerance) {
      return false;
    }
  }
  return true;
}

function checkRectangle(points) {
  if (points.length < 4) return false;
  
  // Get bounding box
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  
  // Check if most points are near corners or edges
  const tolerance = (maxX - minX + maxY - minY) / 20;
  let cornerCount = 0;
  
  for (const p of points) {
    const distToCorner = Math.min(
      Math.hypot(p.x - minX, p.y - minY),
      Math.hypot(p.x - maxX, p.y - minY),
      Math.hypot(p.x - minX, p.y - maxY),
      Math.hypot(p.x - maxX, p.y - maxY)
    );
    
    if (distToCorner < tolerance) cornerCount++;
  }
  
  if (cornerCount >= points.length * 0.6) {
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }
  
  return null;
}

function checkCircle(points) {
  if (points.length < 4) return null;
  
  // Find center by averaging point positions
  const centerX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const centerY = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  
  // Calculate distances to center
  const distances = points.map(p => Math.hypot(p.x - centerX, p.y - centerY));
  const avgDistance = distances.reduce((sum, d) => sum + d, 0) / distances.length;
  const variance = distances.reduce((sum, d) => sum + Math.pow(d - avgDistance, 2), 0) / distances.length;
  const stdDev = Math.sqrt(variance);
  
  // If variance is low, it's a circle
  if (stdDev < avgDistance * 0.15) {
    return { center: { x: centerX, y: centerY }, radius: avgDistance };
  }
  
  return null;
}

// ==========================================
// Socket.io Connection Handling
// ==========================================

io.on('connection', (socket) => {
  console.log(`[CONNECT] User ${socket.id}`);
  let currentSessionId = null;
  let userId = socket.id;
  let userRole = getDefaultRole(); // Default to VIEWER role

  /**
   * SESSION-CREATE Handler
   * 
   * Creates a new collaborative session and assigns the creator with CREATOR role.
   * The creator has full permissions: draw, edit, manage users, export.
   * 
   * Flow:
   *   1. Create new Session instance
   *   2. Set creator ID and initialize with CREATOR role
   *   3. Emit 'user-joined' to broadcast creator's role to all clients (fixes bug where creator showed as VIEWER)
   *   4. Start auto-save interval
   *   5. Return session ID and full state to callback
   * 
   * Permission model:
   *   - Creator: Full permissions (draw, edit, manage, export, delete)
   *   - Others: VIEWER by default (no drawing/editing)
   * 
   * @param {Function} callback - Called with { sessionId, session, error? }
   */
  socket.on('session-create', (callback) => {
    // Create session and assign creator role
    const session = createSession();
    session.creator = userId;
    
    // CRITICAL FIX: Assign CREATOR role to the session creator
    const creatorRole = getCreatorRole(); // ROLES.CREATOR = 'creator'
    session.addUser(userId, creatorRole);
    userRole = creatorRole;
    currentSessionId = session.id;
    socket.join(session.id);

    console.log(`[SESSION-CREATE] User ${userId} created ${session.id} with role: ${creatorRole}`);
    
    // CRITICAL: Broadcast user-joined event so all clients (including creator) receive role update
    // BUG FIX: This emit was missing in original code, causing creator to appear as VIEWER
    io.to(session.id).emit('user-joined', {
      userId,
      role: creatorRole,  // Explicitly include role for clarity
      users: Array.from(session.users),
      sessionState: session.toJSON()
    });
    
    callback({ sessionId: session.id, session: session.toJSON() });
  });

  /**
   * SESSION-JOIN Handler
   * 
   * Joins an existing session and assigns VIEWER role by default.
   * Session creator can promote joiners to EDITOR role via role-change event.
   * 
   * Flow:
   *   1. Look up session by ID
   *   2. Add user with default VIEWER role (restricted access)
   *   3. Emit 'user-joined' to notify all clients
   *   4. Return session state to callback
   * 
   * Permission model:
   *   - Joiners: VIEWER role (read-only) by default
   *   - Creator can promote via 'role-change' event
   * 
   * @param {string} sessionId - The session to join
   * @param {Function} callback - Called with { sessionId, session, error? }
   */
  socket.on('session-join', (sessionId, callback) => {
    const session = getSession(sessionId);
    if (!session) {
      return callback({ error: 'Session not found' });
    }

    // Assign joiner as VIEWER by default (read-only)
    const joinerRole = getDefaultRole(); // ROLES.VIEWER = 'viewer'
    session.addUser(userId, joinerRole);
    userRole = joinerRole;
    currentSessionId = sessionId;
    socket.join(sessionId);

    console.log(`[SESSION-JOIN] User ${userId} joined ${sessionId} with role: ${joinerRole}`);
    
    // Broadcast user-joined so all clients see the new user and their role
    io.to(sessionId).emit('user-joined', {
      userId,
      role: joinerRole,  // Explicitly include role for clarity
      users: Array.from(session.users),
      sessionState: session.toJSON()
    });
    
    callback({ sessionId, session: session.toJSON() });
  });

  // Cursor movement
  socket.on('cursor-move', (data) => {
    if (!currentSessionId) return;

    const session = getSession(currentSessionId);
    if (!session) return;

    const { x, y } = data;
    session.cursors[userId] = { x, y, timestamp: Date.now() };
    
    // Sprint 16: Update presence awareness
    session.userPresence[userId].cursor = { x, y };
    session.userPresence[userId].lastActivity = Date.now();

    socket.to(currentSessionId).emit('cursor-update', {
      userId,
      x,
      y,
      timestamp: Date.now()
    });
  });

  // Sprint 13-14: Camera/Zoom sync
  socket.on('camera-change', (data) => {
    if (!currentSessionId) return;

    const session = getSession(currentSessionId);
    if (!session) return;

    session.camera = {
      x: data.x,
      y: data.y,
      zoom: data.zoom,
      timestamp: Date.now()
    };

    socket.to(currentSessionId).emit('camera-updated', session.camera);
  });

  /**
   * STROKE-DRAW Handler
   * 
   * Receives drawing stroke from client and broadcasts to all session members.
   * Permission: Only CREATOR and EDITOR roles can draw. VIEWER cannot.
   * 
   * Permission check flow:
   *   1. Verify user has permission to draw (canPerformAction('draw-stroke'))
   *   2. If denied, reject silently (return early)
   *   3. If allowed, add stroke to session and broadcast
   * 
   * @param {Object} data - { points: [{x, y}, ...], color, width }
   */
  socket.on('stroke-draw', (data) => {
    if (!currentSessionId) return;

    // Permission check: Only CREATOR and EDITOR can draw (VIEWER cannot)
    if (!canPerformAction(userRole, 'draw-stroke')) {
      console.warn(`[PERMISSION DENIED] User ${userId} (role: ${userRole}) attempted to draw in ${currentSessionId}`);
      return;
    }

    const session = getSession(currentSessionId);
    if (!session) return;

    // Sprint 16: Mark user as drawing and update active area
    if (session.userPresence[userId]) {
      session.userPresence[userId].isDrawing = true;
      session.userPresence[userId].activeArea = {
        x: Math.min(...data.points.map(p => p.x)),
        y: Math.min(...data.points.map(p => p.y)),
        x2: Math.max(...data.points.map(p => p.x)),
        y2: Math.max(...data.points.map(p => p.y))
      };
    }

    // Create stroke object with full metadata
    const stroke = {
      id: Date.now() + Math.random(),
      userId,
      points: data.points,
      color: data.color || '#000000',
      width: data.width || 2,
      timestamp: Date.now(),
      comments: [] // Sprint 17
    };

    // Add to session state
    session.strokes.push(stroke);
    
    // Sprint 10-11: Add to undo history for creator/editor use
    session.addToHistory('stroke-added', { strokeId: stroke.id, stroke }, userId);
    session.logActivity('stroke-added', userId, { strokeCount: session.strokes.length });

    // Broadcast to all users in session
    io.to(currentSessionId).emit('stroke-created', stroke);
  });

  /**
   * SHAPE-DRAW Handler
   * 
   * Creates a shape (rectangle, circle, line) and broadcasts to all session members.
   * Includes automatic shape recognition to snap drawn strokes to clean shapes.
   * Permission: Only CREATOR and EDITOR roles can draw shapes. VIEWER cannot.
   * 
   * Permission check: canPerformAction('draw-shape')
   * 
   * @param {Object} data - { type, points: [{x, y}, ...], color, width }
   */
  socket.on('shape-draw', (data) => {
    if (!currentSessionId) return;

    // Permission check: Only CREATOR and EDITOR can draw shapes (VIEWER cannot)
    if (!canPerformAction(userRole, 'draw-shape')) {
      console.warn(`[PERMISSION DENIED] User ${userId} (role: ${userRole}) attempted to draw shape in ${currentSessionId}`);
      return;
    }

    const session = getSession(currentSessionId);
    if (!session) return;

    // Sprint 18: Shape recognition - auto-detect shape type from drawn points
    let shapeType = data.type;
    let shapeBounds = null;
    
    if (session.shapeRecognitionEnabled && data.points && data.points.length >= 3) {
      const recognized = recognizeShape(data.points);
      if (recognized) {
        shapeType = recognized.type;
        shapeBounds = recognized.bounds || recognized;
      }
    }

    // Create shape object with full metadata
    const shape = {
      id: Date.now() + Math.random(),
      userId,
      type: shapeType,
      points: data.points,
      color: data.color || '#000000',
      width: data.width || 2,
      timestamp: Date.now(),
      comments: [] // Sprint 17
    };

    // Add recognized bounds if shape was auto-detected
    if (shapeBounds) {
      shape.bounds = shapeBounds;
    }

    // Add to session state
    session.shapes.push(shape);
    
    // Sprint 10-11: Add to undo history
    session.addToHistory('shape-added', { shapeId: shape.id, shape }, userId);
    session.logActivity('shape-added', userId, { shapeType, shapeCount: session.shapes.length });

    // Broadcast to all session members
    io.to(currentSessionId).emit('shape-created', shape);
  });

  /**
   * TEXT-ADD Handler
   * 
   * Creates a text box at specified coordinates.
   * Permission: Only CREATOR and EDITOR can add text. VIEWER cannot.
   * 
   * @param {Object} data - { text: string, x: number, y: number, color?: string }
   */
  socket.on('text-add', (data) => {
    if (!currentSessionId) return;

    // Permission check: Only CREATOR and EDITOR can add text (VIEWER cannot)
    if (!canPerformAction(userRole, 'add-text')) {
      console.warn(`[PERMISSION DENIED] User ${userId} (role: ${userRole}) attempted to add text in ${currentSessionId}`);
      return;
    }

    const session = getSession(currentSessionId);
    if (!session) return;

    // Create text box with metadata
    const textBox = {
      id: Date.now() + Math.random(),
      userId,
      text: data.text,
      x: data.x,
      y: data.y,
      color: data.color || '#000000',
      timestamp: Date.now(),
      version: 0,
      comments: [] // Sprint 17
    };

    // Add to session state
    session.textBoxes.push(textBox);
    
    // Sprint 10-11: Add to undo history
    session.addToHistory('text-added', { textBoxId: textBox.id, textBox }, userId);
    session.logActivity('text-added', userId, { textCount: session.textBoxes.length });

    // Broadcast to all session members
    io.to(currentSessionId).emit('text-created', textBox);
  });

  /**
   * TEXT-UPDATE Handler
   * 
   * Updates an existing text box using Last-Write-Wins conflict resolution.
   * Only the text box creator can edit their own text.
   * Permission: Only CREATOR and EDITOR can edit text. VIEWER cannot.
   * 
   * @param {Object} data - { id: string, text: string }
   */
  socket.on('text-update', (data) => {
    if (!currentSessionId) return;

    // Permission check: Only CREATOR and EDITOR can edit text (VIEWER cannot)
    if (!canPerformAction(userRole, 'edit-text')) {
      console.warn(`[PERMISSION DENIED] User ${userId} (role: ${userRole}) attempted to edit text in ${currentSessionId}`);
      return;
    }

    const session = getSession(currentSessionId);
    if (!session) return;

    const textBox = session.textBoxes.find(t => t.id === data.id);
    
    // Only allow users to edit their own text boxes
    if (textBox && textBox.userId === userId) {
      const serverTime = Date.now();
      const oldText = textBox.text;
      textBox.text = data.text;
      textBox.timestamp = serverTime;
      textBox.version = (textBox.version || 0) + 1;
      
      // Add to undo history
      session.addToHistory('text-updated', { 
        textBoxId: data.id, 
        oldText, 
        newText: data.text 
      }, userId);

      // Broadcast updated text to all session members
      io.to(currentSessionId).emit('text-updated', {
        ...textBox,
        serverTime,
        editorId: userId
      });
    }
  });

  /**
   * TEXT-DELETE Handler
   * 
   * Deletes a text box from the session.
   * Only the text box creator can delete their own text.
   * Permission: Only CREATOR and EDITOR can delete text. VIEWER cannot.
   * 
   * @param {string} id - The text box ID to delete
   */
  socket.on('text-delete', (id) => {
    if (!currentSessionId) return;

    // Permission check: Only CREATOR and EDITOR can delete text (VIEWER cannot)
    if (!canPerformAction(userRole, 'delete-text')) {
      console.warn(`[PERMISSION DENIED] User ${userId} (role: ${userRole}) attempted to delete text in ${currentSessionId}`);
      return;
    }

    const session = getSession(currentSessionId);
    if (!session) return;

    const index = session.textBoxes.findIndex(t => t.id === id);
    
    // Only allow users to delete their own text boxes
    if (index > -1 && session.textBoxes[index].userId === userId) {
      const deleted = session.textBoxes[index];
      session.textBoxes.splice(index, 1);
      
      // Add to undo history
      session.addToHistory('text-deleted', { textBoxId: id, textBox: deleted }, userId);
      session.logActivity('text-deleted', userId, { textCount: session.textBoxes.length });

      // Broadcast deletion to all session members
      io.to(currentSessionId).emit('text-deleted', id);
    }
  });

  /**
   * UNDO Handler
   * 
   * Reverts the last action in the session's undo history.
   * Permission: Only CREATOR and EDITOR can undo. VIEWER cannot.
   * 
   * @param {Function} callback - Called with { success, operationIndex }
   */
  socket.on('undo', (callback) => {
    if (!currentSessionId) return;

    // Permission check: Only CREATOR and EDITOR can undo (VIEWER cannot)
    if (!canPerformAction(userRole, 'undo')) {
      console.warn(`[PERMISSION DENIED] User ${userId} (role: ${userRole}) attempted to undo in ${currentSessionId}`);
      callback && callback({ success: false, error: 'Permission denied' });
      return;
    }

    const session = getSession(currentSessionId);
    if (!session) return;

    const result = session.undo();
    if (result.success) {
      console.log(`[UNDO] User ${userId} at operation index ${result.operationIndex}`);
      
      // Broadcast undo to all session members
      io.to(currentSessionId).emit('undo-applied', {
        operationIndex: result.operationIndex,
        appliedBy: userId
      });
    }
    callback && callback(result);
  });

  /**
   * REDO Handler
   * 
   * Reapplies the last undone action in the undo history.
   * Permission: Only CREATOR and EDITOR can redo. VIEWER cannot.
   * 
   * @param {Function} callback - Called with { success, operationIndex }
   */
  socket.on('redo', (callback) => {
    if (!currentSessionId) return;

    // Permission check: Only CREATOR and EDITOR can redo (VIEWER cannot)
    if (!canPerformAction(userRole, 'redo')) {
      console.warn(`[PERMISSION DENIED] User ${userId} (role: ${userRole}) attempted to redo in ${currentSessionId}`);
      callback && callback({ success: false, error: 'Permission denied' });
      return;
    }

    const session = getSession(currentSessionId);
    if (!session) return;

    const result = session.redo();
    if (result.success) {
      console.log(`[REDO] User ${userId} at operation index ${result.operationIndex}`);
      
      // Broadcast redo to all session members
      io.to(currentSessionId).emit('redo-applied', {
        operationIndex: result.operationIndex,
        appliedBy: userId
      });
    }
    callback && callback(result);
  });

  // Sprint 17: Add comment
  socket.on('comment-add', (data) => {
    if (!currentSessionId) return;

    const session = getSession(currentSessionId);
    if (!session) return;

    const comment = session.addComment(data.strokeId, data.text, userId);
    session.logActivity('comment-added', userId, { commentCount: session.comments.length });

    io.to(currentSessionId).emit('comment-created', comment);
  });

  // Sprint 17: Resolve comment
  socket.on('comment-resolve', (commentId) => {
    if (!currentSessionId) return;

    const session = getSession(currentSessionId);
    if (!session) return;

    session.resolveComment(commentId);
    io.to(currentSessionId).emit('comment-resolved', commentId);
  });

  /**
   * ROLE-CHANGE Handler
   * 
   * Updates a user's role in the session.
   * Permission: Only CREATOR can change roles. EDITOR and VIEWER cannot.
   * 
   * Allowed role transitions:
   *   CREATOR → any role (not themselves)
   *   EDITOR → cannot change any roles
   *   VIEWER → cannot change any roles
   * 
   * @param {Object} data - { userId: string, newRole: string }
   */
  socket.on('role-change', (data) => {
    if (!currentSessionId) return;

    // Permission check: Only CREATOR can change user roles
    if (userRole !== ROLES.CREATOR) {
      console.warn(`[PERMISSION DENIED] User ${userId} (role: ${userRole}) attempted to change role in ${currentSessionId}`);
      return;
    }

    const session = getSession(currentSessionId);
    if (!session) return;

    // Update role if user exists in session
    if (session.sessionMembers[data.userId]) {
      const oldRole = session.sessionMembers[data.userId].role;
      session.sessionMembers[data.userId].role = data.newRole;
      
      console.log(`[ROLE-CHANGE] User ${userId} changed role of ${data.userId} from ${oldRole} to ${data.newRole}`);
      
      // Broadcast role update to all session members
      io.to(currentSessionId).emit('role-updated', {
        userId: data.userId,
        oldRole,
        newRole: data.newRole,
        changedBy: userId
      });
    }
  });

  // Measure latency
  socket.on('latency-ping', (data) => {
    socket.emit('latency-pong', {
      clientTime: data.clientTime,
      serverTime: Date.now()
    });
  });

  // Disconnect
  socket.on('disconnect', (reason) => {
    console.log(`[DISCONNECT] User ${userId} (${reason})`);

    if (currentSessionId) {
      const session = getSession(currentSessionId);
      if (session) {
        const isEmpty = session.removeUser(userId);

        if (isEmpty) {
          deleteSession(currentSessionId);
          console.log(`[CLEANUP] Session ${currentSessionId} deleted (empty)`);
        } else {
          io.to(currentSessionId).emit('user-left', {
            userId,
            users: Array.from(session.users),
            cursors: session.cursors,
            userPresence: session.userPresence
          });
        }
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`[SERVER] Listening on port ${PORT}`);
  console.log(`[STATE]  In-memory only — all sessions are lost on restart. See masterplan.md Sprint 2.`);
});
