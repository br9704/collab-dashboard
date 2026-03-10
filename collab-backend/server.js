const express = require('express');
const { createServer } = require('http');
const { Server: SocketIOServer } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
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

// In-memory session storage
const sessions = new Map();
const sessionAutoSaveIntervals = new Map();

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
  // Stop auto-save interval
  if (sessionAutoSaveIntervals.has(sessionId)) {
    clearInterval(sessionAutoSaveIntervals.get(sessionId));
    sessionAutoSaveIntervals.delete(sessionId);
  }
  
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
  let userRole = 'editor'; // Default role

  // Session creation
  socket.on('session-create', (callback) => {
    const session = createSession();
    session.creator = userId;
    session.addUser(userId, 'admin');
    userRole = 'admin';
    currentSessionId = session.id;
    socket.join(session.id);

    console.log(`[SESSION-CREATE] User ${userId} created ${session.id}`);
    
    // Emit user-joined to notify all clients (including creator) of their role
    io.to(session.id).emit('user-joined', {
      userId,
      users: Array.from(session.users),
      sessionState: session.toJSON()
    });
    
    // Sprint 10-11: Start auto-save interval (every 10 seconds)
    const autoSaveInterval = setInterval(() => {
      const sess = getSession(currentSessionId);
      if (sess) {
        console.log(`[AUTO-SAVE] Session ${currentSessionId} saved`);
        // In production with Supabase, would do:
        // supabase.from('sessions').upsert({ id: sess.id, data: sess.toJSON(), updated_at: now() })
      }
    }, 10000);
    
    sessionAutoSaveIntervals.set(session.id, autoSaveInterval);
    
    callback({ sessionId: session.id, session: session.toJSON() });
  });

  // Session joining
  socket.on('session-join', (sessionId, callback) => {
    const session = getSession(sessionId);
    if (!session) {
      return callback({ error: 'Session not found' });
    }

    session.addUser(userId, 'editor'); // Default to editor role
    userRole = 'editor';
    currentSessionId = sessionId;
    socket.join(sessionId);

    console.log(`[SESSION-JOIN] User ${userId} joined ${sessionId}`);
    
    io.to(sessionId).emit('user-joined', {
      userId,
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

  // Draw stroke
  socket.on('stroke-draw', (data) => {
    if (!currentSessionId || userRole === 'viewer') return;

    const session = getSession(currentSessionId);
    if (!session) return;

    // Sprint 16: Mark user as drawing
    if (session.userPresence[userId]) {
      session.userPresence[userId].isDrawing = true;
      session.userPresence[userId].activeArea = {
        x: Math.min(...data.points.map(p => p.x)),
        y: Math.min(...data.points.map(p => p.y)),
        x2: Math.max(...data.points.map(p => p.x)),
        y2: Math.max(...data.points.map(p => p.y))
      };
    }

    const stroke = {
      id: Date.now() + Math.random(),
      userId,
      points: data.points,
      color: data.color || '#000000',
      width: data.width || 2,
      timestamp: Date.now(),
      comments: [] // Sprint 17
    };

    session.strokes.push(stroke);
    
    // Sprint 10-11: Add to undo history
    session.addToHistory('stroke-added', { strokeId: stroke.id, stroke }, userId);
    session.logActivity('stroke-added', userId, { strokeCount: session.strokes.length });

    io.to(currentSessionId).emit('stroke-created', stroke);
  });

  // Add shape
  socket.on('shape-draw', (data) => {
    if (!currentSessionId || userRole === 'viewer') return;

    const session = getSession(currentSessionId);
    if (!session) return;

    // Sprint 18: Shape recognition
    let shapeType = data.type;
    let shapeBounds = null;
    
    if (session.shapeRecognitionEnabled && data.points && data.points.length >= 3) {
      const recognized = recognizeShape(data.points);
      if (recognized) {
        shapeType = recognized.type;
        shapeBounds = recognized.bounds || recognized;
      }
    }

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

    if (shapeBounds) {
      shape.bounds = shapeBounds;
    }

    session.shapes.push(shape);
    
    // Sprint 10-11: Add to history
    session.addToHistory('shape-added', { shapeId: shape.id, shape }, userId);
    session.logActivity('shape-added', userId, { shapeType, shapeCount: session.shapes.length });

    io.to(currentSessionId).emit('shape-created', shape);
  });

  // Add text box
  socket.on('text-add', (data) => {
    if (!currentSessionId || userRole === 'viewer') return;

    const session = getSession(currentSessionId);
    if (!session) return;

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

    session.textBoxes.push(textBox);
    
    // Sprint 10-11: Add to history
    session.addToHistory('text-added', { textBoxId: textBox.id, textBox }, userId);
    session.logActivity('text-added', userId, { textCount: session.textBoxes.length });

    io.to(currentSessionId).emit('text-created', textBox);
  });

  // Update text box (Last-Write-Wins conflict resolution)
  socket.on('text-update', (data) => {
    if (!currentSessionId || userRole === 'viewer') return;

    const session = getSession(currentSessionId);
    if (!session) return;

    const textBox = session.textBoxes.find(t => t.id === data.id);
    if (textBox && textBox.userId === userId) {
      const serverTime = Date.now();
      const oldText = textBox.text;
      textBox.text = data.text;
      textBox.timestamp = serverTime;
      textBox.version = (textBox.version || 0) + 1;
      
      // Add to history
      session.addToHistory('text-updated', { 
        textBoxId: data.id, 
        oldText, 
        newText: data.text 
      }, userId);

      io.to(currentSessionId).emit('text-updated', {
        ...textBox,
        serverTime,
        editorId: userId
      });
    }
  });

  // Delete text box
  socket.on('text-delete', (id) => {
    if (!currentSessionId || userRole === 'viewer') return;

    const session = getSession(currentSessionId);
    if (!session) return;

    const index = session.textBoxes.findIndex(t => t.id === id);
    if (index > -1 && session.textBoxes[index].userId === userId) {
      const deleted = session.textBoxes[index];
      session.textBoxes.splice(index, 1);
      
      // Add to history
      session.addToHistory('text-deleted', { textBoxId: id, textBox: deleted }, userId);
      session.logActivity('text-deleted', userId, { textCount: session.textBoxes.length });

      io.to(currentSessionId).emit('text-deleted', id);
    }
  });

  // Sprint 10-11: Undo
  socket.on('undo', (callback) => {
    if (!currentSessionId) return;

    const session = getSession(currentSessionId);
    if (!session) return;

    const result = session.undo();
    if (result.success) {
      console.log(`[UNDO] User ${userId} at index ${result.operationIndex}`);
      io.to(currentSessionId).emit('undo-applied', {
        operationIndex: result.operationIndex,
        appliedBy: userId
      });
    }
    callback && callback(result);
  });

  // Sprint 10-11: Redo
  socket.on('redo', (callback) => {
    if (!currentSessionId) return;

    const session = getSession(currentSessionId);
    if (!session) return;

    const result = session.redo();
    if (result.success) {
      console.log(`[REDO] User ${userId} at index ${result.operationIndex}`);
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

  // Sprint 18: Update user role (admin only)
  socket.on('role-change', (data) => {
    if (!currentSessionId || userRole !== 'admin') return;

    const session = getSession(currentSessionId);
    if (!session) return;

    if (session.sessionMembers[data.userId]) {
      session.sessionMembers[data.userId].role = data.newRole;
      io.to(currentSessionId).emit('role-updated', {
        userId: data.userId,
        newRole: data.newRole
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
  console.log(`[FEATURES] Sprints 10-18 enabled: Persistence, Undo/Redo, Camera Sync, Presence, Comments, Roles, Activity Log, Shape Recognition`);
});
