import { useEffect, useState } from 'react';

export function useSessionState(socket, sessionId) {
  const [users, setUsers] = useState([]);
  const [cursors, setCursors] = useState({});
  const [strokes, setStrokes] = useState([]);
  const [shapes, setShapes] = useState([]);
  const [textBoxes, setTextBoxes] = useState([]);
  const [mode, setMode] = useState('pencil');
  const [sessionData, setSessionData] = useState(null);

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
        setSessionData(data.sessionState);
      }
    });

    // Listen for user leave
    socket.on('user-left', (data) => {
      setUsers(data.users);
      setCursors(prev => {
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
      socket.off('tool-changed');
    };
  }, [socket, sessionId]);

  return {
    users,
    cursors,
    strokes,
    shapes,
    textBoxes,
    mode,
    sessionData,
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
    changeTool: (mode) => socket?.emit('tool-change', { mode })
  };
}
