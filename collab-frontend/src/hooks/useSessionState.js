import { useEffect, useState } from 'react';

export function useSessionState(socket, sessionId) {
  const [users, setUsers] = useState([]);
  const [sessionMembers, setSessionMembers] = useState({});
  const [cursors, setCursors] = useState({});
  const [strokes, setStrokes] = useState([]);
  const [shapes, setShapes] = useState([]);
  const [textBoxes, setTextBoxes] = useState([]);
  const [mode, setMode] = useState('pencil');
  const [sessionData, setSessionData] = useState(null);
  
  // Sprint 10-11: Undo/Redo history
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  // Sprint 13-14: Camera state (zoom/pan)
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1, timestamp: Date.now() });
  
  // Sprint 16: Presence awareness
  const [userPresence, setUserPresence] = useState({});
  
  // Sprint 17: Comments
  const [comments, setComments] = useState([]);
  
  // Sprint 18: Activity log
  const [activityLog, setActivityLog] = useState([]);

  useEffect(() => {
    if (!socket || !sessionId) return;

    // Listen for session state on join
    socket.on('user-joined', (data) => {
      setUsers(data.users);
      if (data.sessionState) {
        setStrokes(data.sessionState.strokes || []);
        setShapes(data.sessionState.shapes || []);
        setTextBoxes(data.sessionState.textBoxes || []);
        setCursors(data.sessionState.cursors || {});
        setMode(data.sessionState.mode || 'pencil');
        setSessionMembers(data.sessionState.sessionMembers || {});
        
        // Sprint 10-11: Load history
        setHistory(data.sessionState.history || []);
        setHistoryIndex(data.sessionState.historyIndex || -1);
        
        // Sprint 13-14: Load camera state
        setCamera(data.sessionState.camera || { x: 0, y: 0, zoom: 1, timestamp: Date.now() });
        
        // Sprint 16: Load presence
        setUserPresence(data.sessionState.userPresence || {});
        
        // Sprint 17: Load comments
        setComments(data.sessionState.comments || []);
        
        // Sprint 18: Load activity log
        setActivityLog(data.sessionState.activityLog || []);
        
        setSessionData(data.sessionState);
      }
    });

    // Listen for user leave
    socket.on('user-left', (data) => {
      setUsers(data.users);
      setSessionMembers(prev => {
        const updated = { ...prev };
        delete updated[data.userId];
        return updated;
      });
      setCursors(prev => {
        const updated = { ...prev };
        delete updated[data.userId];
        return updated;
      });
      setUserPresence(prev => {
        const updated = { ...prev };
        delete updated[data.userId];
        return updated;
      });
    });

    // Listen for cursor updates
    socket.on('cursor-update', (data) => {
      setCursors(prev => ({
        ...prev,
        [data.userId]: { x: data.x, y: data.y }
      }));
    });

    // Listen for stroke events
    socket.on('stroke-created', (stroke) => {
      setStrokes(prev => [...prev, stroke]);
    });

    // Listen for shape events
    socket.on('shape-created', (shape) => {
      setShapes(prev => [...prev, shape]);
    });

    // Listen for text events
    socket.on('text-created', (textBox) => {
      setTextBoxes(prev => [...prev, textBox]);
    });

    socket.on('text-updated', (textBox) => {
      setTextBoxes(prev =>
        prev.map(t => (t.id === textBox.id ? textBox : t))
      );
    });

    socket.on('text-deleted', (id) => {
      setTextBoxes(prev => prev.filter(t => t.id !== id));
    });

    // Sprint 10-11: Undo/Redo events
    socket.on('undo-applied', (data) => {
      setHistoryIndex(data.operationIndex);
      console.log(`[UNDO] Operation index: ${data.operationIndex}`);
    });

    socket.on('redo-applied', (data) => {
      setHistoryIndex(data.operationIndex);
      console.log(`[REDO] Operation index: ${data.operationIndex}`);
    });

    // Sprint 13-14: Camera sync
    socket.on('camera-updated', (newCamera) => {
      setCamera(newCamera);
    });

    // Sprint 17: Comment events
    socket.on('comment-created', (comment) => {
      setComments(prev => [...prev, comment]);
    });

    socket.on('comment-resolved', (commentId) => {
      setComments(prev =>
        prev.map(c => (c.id === commentId ? { ...c, resolved: true } : c))
      );
    });

    // Sprint 18: Role changes
    socket.on('role-updated', (data) => {
      setSessionMembers(prev => ({
        ...prev,
        [data.userId]: { role: data.newRole }
      }));
    });

    // Listen for tool changes
    socket.on('tool-changed', (data) => {
      setMode(data.mode);
    });

    return () => {
      socket.off('user-joined');
      socket.off('user-left');
      socket.off('cursor-update');
      socket.off('stroke-created');
      socket.off('shape-created');
      socket.off('text-created');
      socket.off('text-updated');
      socket.off('text-deleted');
      socket.off('undo-applied');
      socket.off('redo-applied');
      socket.off('camera-updated');
      socket.off('comment-created');
      socket.off('comment-resolved');
      socket.off('role-updated');
      socket.off('tool-changed');
    };
  }, [socket, sessionId]);

  return {
    users,
    sessionMembers,
    cursors,
    strokes,
    shapes,
    textBoxes,
    mode,
    sessionData,
    // Sprint 10-11: Undo/Redo
    history,
    historyIndex,
    // Sprint 13-14: Camera
    camera,
    // Sprint 16: Presence
    userPresence,
    // Sprint 17: Comments
    comments,
    // Sprint 18: Activity log
    activityLog,
    
    // Emitter functions
    moveCursor: (x, y) => socket?.emit('cursor-move', { x, y }),
    drawStroke: (points, color, width) =>
      socket?.emit('stroke-draw', { points, color, width }),
    drawShape: (type, points, color, width) =>
      socket?.emit('shape-draw', { type, points, color, width }),
    addText: (text, x, y, color) =>
      socket?.emit('text-add', { text, x, y, color }),
    updateText: (id, text) => socket?.emit('text-update', { id, text }),
    deleteText: (id) => socket?.emit('text-delete', id),
    changeTool: (mode) => socket?.emit('tool-change', { mode }),
    // Sprint 13-14: Camera control
    updateCamera: (x, y, zoom) => 
      socket?.emit('camera-change', { x, y, zoom, timestamp: Date.now() })
  };
}
