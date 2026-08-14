/**
 * useCollabDoc — connects a board to its Yjs document.
 *
 * Owns three things:
 *   1. the HocuspocusProvider (network + server-side SQLite persistence)
 *   2. IndexeddbPersistence  (offline: the board is readable before the socket opens, and
 *      edits made offline reconcile on reconnect)
 *   3. a per-user Y.UndoManager
 *
 * PER-USER UNDO is a deliberate behaviour change. The old server-side undo popped a single
 * shared history stack, so pressing Ctrl+Z could remove a stroke somebody else had just
 * drawn. Scoping the UndoManager to this client's transaction origin means Ctrl+Z undoes
 * *your* last action, which is what every real editor does.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { IndexeddbPersistence } from 'y-indexeddb';
import {
  getElements,
  getComments,
  readElements,
  readComments,
  addStroke,
  addShape,
  addText,
  updateTextBody,
  deleteElement,
  addComment,
  resolveComment,
} from '../collab/doc';

export function useCollabDoc({ url, sessionId, token, userId }) {
  const [elements, setElements] = useState([]);
  const [comments, setComments] = useState([]);
  const [status, setStatus] = useState('disconnected');
  const [synced, setSynced] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [peers, setPeers] = useState([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const ydocRef = useRef(null);
  const providerRef = useRef(null);
  const undoRef = useRef(null);
  // Tag identifying THIS client's transactions, so the UndoManager tracks only our edits.
  const originRef = useRef(null);

  // A reconnect nonce: bumping it tears the provider down and rebuilds it. Needed because a
  // Hocuspocus connection's read-only flag is fixed for its lifetime, so a role change only
  // takes effect on a fresh connection.
  const [reconnectNonce, setReconnectNonce] = useState(0);

  useEffect(() => {
    if (!url || !sessionId || !token) return;

    const ydoc = new Y.Doc();
    const origin = Symbol('local');
    ydocRef.current = ydoc;
    originRef.current = origin;

    // Offline first: hydrate from IndexedDB before the network answers.
    const idb = new IndexeddbPersistence(`collab:${sessionId}`, ydoc);
    idb.on('synced', () => setOfflineReady(true));

    const provider = new HocuspocusProvider({
      url,
      name: sessionId,
      document: ydoc,
      token,
      onAuthenticationFailed: ({ reason }) => setAuthError(reason || 'Authentication failed'),
      onStatus: ({ status: s }) => setStatus(s),
      onSynced: () => setSynced(true),
    });
    providerRef.current = provider;

    const undoManager = new Y.UndoManager(
      [getElements(ydoc), getComments(ydoc)],
      { trackedOrigins: new Set([origin]) }
    );
    undoRef.current = undoManager;

    const refreshUndoState = () => {
      setCanUndo(undoManager.undoStack.length > 0);
      setCanRedo(undoManager.redoStack.length > 0);
    };
    undoManager.on('stack-item-added', refreshUndoState);
    undoManager.on('stack-item-popped', refreshUndoState);

    const readAll = () => {
      setElements(readElements(ydoc));
      setComments(readComments(ydoc));
    };
    readAll();

    // observeDeep so a Y.Text edit inside a text element also triggers a re-read.
    const elementsObserver = () => readAll();
    const commentsObserver = () => readAll();
    getElements(ydoc).observeDeep(elementsObserver);
    getComments(ydoc).observeDeep(commentsObserver);

    // ── Awareness: cursors, camera, drawing state. Never persisted. ────────
    const awareness = provider.awareness;
    awareness?.setLocalStateField('user', { userId });

    const onAwareness = () => {
      const states = [];
      awareness?.getStates().forEach((state, clientId) => {
        if (clientId === awareness.clientID) return;
        if (!state?.user?.userId) return;
        states.push({
          clientId,
          userId: state.user.userId,
          cursor: state.cursor || null,
          camera: state.camera || null,
          isDrawing: !!state.isDrawing,
        });
      });
      setPeers(states);
    };
    awareness?.on('change', onAwareness);
    onAwareness();

    return () => {
      awareness?.off('change', onAwareness);
      getElements(ydoc).unobserveDeep(elementsObserver);
      getComments(ydoc).unobserveDeep(commentsObserver);
      undoManager.off('stack-item-added', refreshUndoState);
      undoManager.off('stack-item-popped', refreshUndoState);
      undoManager.destroy();
      provider.destroy();
      idb.destroy();
      ydoc.destroy();
      ydocRef.current = null;
      providerRef.current = null;
      undoRef.current = null;
    };
  }, [url, sessionId, token, userId, reconnectNonce]);

  const api = useMemo(() => {
    const doc = () => ydocRef.current;
    const origin = () => originRef.current;

    return {
      addStroke: (s) => doc() && addStroke(doc(), origin(), { ...s, userId }),
      addShape: (s) => doc() && addShape(doc(), origin(), { ...s, userId }),
      addText: (t) => doc() && addText(doc(), origin(), { ...t, userId }),
      updateText: (id, text) => doc() && updateTextBody(doc(), origin(), id, text),
      deleteElement: (id) => doc() && deleteElement(doc(), origin(), id),
      addComment: (c) => doc() && addComment(doc(), origin(), { ...c, author: userId }),
      resolveComment: (id) => doc() && resolveComment(doc(), origin(), id),

      undo: () => undoRef.current?.undo(),
      redo: () => undoRef.current?.redo(),

      /** Local cursor position, in canvas space. Awareness, not the document. */
      setCursor: (x, y) =>
        providerRef.current?.awareness?.setLocalStateField('cursor', { x, y, t: Date.now() }),
      setCamera: (camera) =>
        providerRef.current?.awareness?.setLocalStateField('camera', camera),
      setDrawing: (isDrawing) =>
        providerRef.current?.awareness?.setLocalStateField('isDrawing', isDrawing),

      /** Force a fresh document connection so a changed role's read-only flag is applied. */
      reconnect: () => setReconnectNonce((n) => n + 1),
    };
  }, [userId]);

  return {
    elements,
    comments,
    peers,
    status,
    synced,
    offlineReady,
    authError,
    canUndo,
    canRedo,
    ...api,
  };
}
