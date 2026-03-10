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

// In-memory session storage
const sessions = new Map();

// Session class
class Session {
  constructor(sessionId) {
    this.id = sessionId;
    this.users = new Set();
    this.cursors = {};
    this.strokes = [];
    this.shapes = [];
    this.textBoxes = [];
    this.mode = 'pencil';
    this.createdAt = Date.now();
  }

  addUser(userId) {
    this.users.add(userId);
    return this.users.size;
  }

  removeUser(userId) {
    this.users.delete(userId);
    delete this.cursors[userId];
    return this.users.size === 0;
  }

  toJSON() {
    return {
      id: this.id,
      users: Array.from(this.users),
      cursors: this.cursors,
      strokes: this.strokes,
      shapes: this.shapes,
      textBoxes: this.textBoxes,
      mode: this.mode,
      createdAt: this.createdAt
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

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`[CONNECT] User ${socket.id}`);
  let currentSessionId = null;
  let userId = socket.id;

  // Session creation
  socket.on('session-create', (callback) => {
    const session = createSession();
    session.addUser(userId);
    currentSessionId = session.id;
    socket.join(session.id);

    console.log(`[SESSION-CREATE] User ${userId} created ${session.id}`);
    callback({ sessionId: session.id });
  });

  // Session joining
  socket.on('session-join', (sessionId, callback) => {
    const session = getSession(sessionId);
    if (!session) {
      return callback({ error: 'Session not found' });
    }

    session.addUser(userId);
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

    socket.to(currentSessionId).emit('cursor-update', {
      userId,
      x,
      y,
      timestamp: Date.now()
    });
  });

  // Draw stroke
  socket.on('stroke-draw', (data) => {
    if (!currentSessionId) return;

    const session = getSession(currentSessionId);
    if (!session) return;

    const stroke = {
      id: Date.now() + Math.random(),
      userId,
      points: data.points,
      color: data.color || '#000000',
      width: data.width || 2,
      timestamp: Date.now()
    };

    session.strokes.push(stroke);
    io.to(currentSessionId).emit('stroke-created', stroke);
  });

  // Add shape
  socket.on('shape-draw', (data) => {
    if (!currentSessionId) return;

    const session = getSession(currentSessionId);
    if (!session) return;

    const shape = {
      id: Date.now() + Math.random(),
      userId,
      type: data.type, // 'line', 'rectangle', 'circle'
      points: data.points,
      color: data.color || '#000000',
      width: data.width || 2,
      timestamp: Date.now()
    };

    session.shapes.push(shape);
    io.to(currentSessionId).emit('shape-created', shape);
  });

  // Add text box
  socket.on('text-add', (data) => {
    if (!currentSessionId) return;

    const session = getSession(currentSessionId);
    if (!session) return;

    const textBox = {
      id: Date.now() + Math.random(),
      userId,
      text: data.text,
      x: data.x,
      y: data.y,
      color: data.color || '#000000',
      timestamp: Date.now()
    };

    session.textBoxes.push(textBox);
    io.to(currentSessionId).emit('text-created', textBox);
  });

  // Update text box (Conflict Resolution: Last-Write-Wins)
  socket.on('text-update', (data) => {
    if (!currentSessionId) return;

    const session = getSession(currentSessionId);
    if (!session) return;

    const textBox = session.textBoxes.find(t => t.id === data.id);
    if (textBox && textBox.userId === userId) {
      // Add serverTime for conflict resolution
      const serverTime = Date.now();
      textBox.text = data.text;
      textBox.timestamp = serverTime;
      textBox.version = (textBox.version || 0) + 1;
      
      // Broadcast to all users with version info
      io.to(currentSessionId).emit('text-updated', {
        ...textBox,
        serverTime,
        editorId: userId
      });
    }
  });

  // Delete text box
  socket.on('text-delete', (id) => {
    if (!currentSessionId) return;

    const session = getSession(currentSessionId);
    if (!session) return;

    const index = session.textBoxes.findIndex(t => t.id === id);
    if (index > -1 && session.textBoxes[index].userId === userId) {
      session.textBoxes.splice(index, 1);
      io.to(currentSessionId).emit('text-deleted', id);
    }
  });

  // Change tool/color
  socket.on('tool-change', (data) => {
    if (!currentSessionId) return;

    const session = getSession(currentSessionId);
    if (!session) return;

    session.mode = data.mode;
    io.to(currentSessionId).emit('tool-changed', { mode: data.mode, userId });
  });

  // Measure latency (echo back with timestamp)
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
            cursors: session.cursors
          });
        }
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`[SERVER] Listening on port ${PORT}`);
});
