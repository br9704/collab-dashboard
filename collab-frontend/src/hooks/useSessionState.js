/**
 * useSessionState — the CONTROL PLANE.
 *
 * After Sprint 2 the board itself lives in a Yjs document (see useCollabDoc). What remains
 * on socket.io is what a CRDT cannot own safely or usefully:
 *
 *   sessionMembers  roles — server-authoritative, because a client with document write
 *                   access could otherwise promote itself
 *   users           who is currently connected on the control channel
 *   activityLog     the session console; ephemeral by design and never claimed otherwise
 *
 * THE RULE THAT CAUSED THE ORIGINAL BLOCKER STILL APPLIES:
 * initial state comes from the session-create / session-join ACK, never from the broadcast.
 * The server emits to the room before the ack returns, so a listener registered afterwards
 * can never see it. That race is what left the creator as a viewer with ONLINE (0).
 *
 * And: never call socket.off(event) without the handler — it unhooks every other component
 * listening to the same event.
 */

import { useEffect, useState } from 'react';

export function useSessionState(socket, sessionId, initialSnapshot, clientId) {
  const [users, setUsers] = useState([]);
  const [sessionMembers, setSessionMembers] = useState({});
  const [activityLog, setActivityLog] = useState([]);
  const [sessionData, setSessionData] = useState(null);
  /** userId -> tool currently selected. Ephemeral: which tool someone holds is presence. */
  const [peerTools, setPeerTools] = useState({});
  /** Set when the server tells this client its own role changed and the doc must reconnect. */
  const [docReconnectSignal, setDocReconnectSignal] = useState(0);

  const applyView = (view) => {
    if (!view) return;
    setUsers(view.users || []);
    setSessionMembers(view.sessionMembers || {});
    setActivityLog(view.activityLog || []);
    setSessionData(view);
  };

  // Seed from the ack, before any broadcast can matter.
  useEffect(() => {
    applyView(initialSnapshot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSnapshot]);

  useEffect(() => {
    if (!socket || !sessionId) return;

    const onSessionUpdated = (view) => applyView(view);

    const onActivity = (entry) => {
      if (!entry) return;
      setActivityLog((prev) => [...prev.slice(-199), entry]);
    };

    const onToolChanged = (data) => {
      if (!data?.userId || !data?.mode) return;
      setPeerTools((prev) => ({ ...prev, [data.userId]: data.mode }));
    };

    const onRoleUpdated = (data) => {
      if (!data?.userId || !data?.newRole) return;
      setSessionMembers((prev) => ({
        ...prev,
        [data.userId]: { ...prev[data.userId], role: data.newRole },
      }));
      // Only *our own* role change requires a document reconnect: the read-only flag is
      // fixed for the life of a Hocuspocus connection.
      if (data.userId === clientId && data.requiresDocReconnect) {
        setDocReconnectSignal((n) => n + 1);
      }
    };

    const listeners = [
      ['session-updated', onSessionUpdated],
      ['activity', onActivity],
      ['tool-changed', onToolChanged],
      ['role-updated', onRoleUpdated],
    ];

    listeners.forEach(([event, handler]) => socket.on(event, handler));
    return () => listeners.forEach(([event, handler]) => socket.off(event, handler));
  }, [socket, sessionId]);

  return {
    users,
    sessionMembers,
    activityLog,
    sessionData,
    peerTools,
    docReconnectSignal,

    changeRole: (userId, newRole) => socket?.emit('role-change', { userId, newRole }),
    changeTool: (mode) => socket?.emit('tool-change', { mode }),
  };
}
