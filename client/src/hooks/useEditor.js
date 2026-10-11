import { useState, useEffect, useCallback, useRef } from 'react';
import { documentApi } from '../services/api/documentApi.js';
import { socketService } from '../services/socket/socketService.js';
import { SOCKET_EVENTS } from '../constants/socketEvents.js';
import { canEdit } from '../constants/roles.js';

export function useEditor(documentId) {
  const [document, setDocument] = useState(null);
  const [collaborators, setCollaborators] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [remoteCursors, setRemoteCursors] = useState({});
  const [saveStatus, setSaveStatus] = useState('saved');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [versions, setVersions] = useState([]);

  const broadcastTimeoutRef = useRef(null);
  const saveTimeoutRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const lastSentContentRef = useRef('');

  const loadDocument = useCallback(async () => {
    if (!documentId) return;
    setLoading(true);
    try {
      const res = await documentApi.get(documentId);
      setDocument(res.data);
      lastSentContentRef.current = res.data.content || '';
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    loadDocument();
  }, [loadDocument]);

  // Socket room connection and real-time listeners
  useEffect(() => {
    if (!documentId || !document?.id) return;

    socketService.joinDocument(documentId);

    const onJoined = (payload) => {
      if (payload.document) {
        setDocument((d) => ({ ...d, ...payload.document }));
        lastSentContentRef.current = payload.document.content || '';
      }
      setCollaborators(payload.collaborators || []);
    };

    const onUpdated = ({ content }) => {
      if (content === undefined || content === null) return;
      lastSentContentRef.current = content;
      // Immediately reflect remote collaborator's edits
      setDocument((d) => (d ? { ...d, content } : d));
    };

    const onPresence = (list) => setCollaborators(list || []);

    const onUserOnline = (user) => {
      setCollaborators((prev) => {
        const exists = prev.some((c) => c.userId === user.userId);
        return exists ? prev.map((c) => (c.userId === user.userId ? user : c)) : [...prev, user];
      });
    };

    const onUserOffline = ({ userId }) => {
      setCollaborators((prev) => prev.filter((c) => c.userId !== userId));
      setRemoteCursors((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      setTypingUsers((prev) => prev.filter((id) => id !== userId));
    };

    const onTyping = ({ typingUsers: users }) => setTypingUsers(users || []);
    const onSaved = () => setSaveStatus('saved');

    const onCursorSync = ({ userId, displayName, color, cursor }) => {
      if (!cursor) return;
      setRemoteCursors((prev) => ({
        ...prev,
        [userId]: { userId, displayName, color, cursor, updatedAt: Date.now() },
      }));
    };

    socketService.on(SOCKET_EVENTS.DOC_JOINED, onJoined);
    socketService.on(SOCKET_EVENTS.DOC_UPDATED, onUpdated);
    socketService.on(SOCKET_EVENTS.PRESENCE_SYNC, onPresence);
    socketService.on(SOCKET_EVENTS.USER_ONLINE, onUserOnline);
    socketService.on(SOCKET_EVENTS.USER_OFFLINE, onUserOffline);
    socketService.on(SOCKET_EVENTS.TYPING_SYNC, onTyping);
    socketService.on(SOCKET_EVENTS.CURSOR_SYNC, onCursorSync);
    socketService.on(SOCKET_EVENTS.DOC_SAVED, onSaved);

    return () => {
      socketService.leaveDocument(documentId);
      socketService.off(SOCKET_EVENTS.DOC_JOINED, onJoined);
      socketService.off(SOCKET_EVENTS.DOC_UPDATED, onUpdated);
      socketService.off(SOCKET_EVENTS.PRESENCE_SYNC, onPresence);
      socketService.off(SOCKET_EVENTS.USER_ONLINE, onUserOnline);
      socketService.off(SOCKET_EVENTS.USER_OFFLINE, onUserOffline);
      socketService.off(SOCKET_EVENTS.TYPING_SYNC, onTyping);
      socketService.off(SOCKET_EVENTS.CURSOR_SYNC, onCursorSync);
      socketService.off(SOCKET_EVENTS.DOC_SAVED, onSaved);
    };
  }, [documentId, document?.id]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (broadcastTimeoutRef.current) clearTimeout(broadcastTimeoutRef.current);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  const updateContent = (html) => {
    if (!canEdit(document?.role)) return;

    // 1. Update local document immediately
    setDocument((d) => (d ? { ...d, content: html } : d));
    setSaveStatus('unsaved');

    // Start typing indicator and auto-stop after 1.2s inactivity
    socketService.startTyping(documentId);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socketService.stopTyping(documentId);
    }, 1200);

    // 2. Fast broadcast to peers (50ms) for instant real-time sync
    if (broadcastTimeoutRef.current) clearTimeout(broadcastTimeoutRef.current);
    broadcastTimeoutRef.current = setTimeout(() => {
      if (html !== lastSentContentRef.current) {
        lastSentContentRef.current = html;
        socketService.sendUpdate(documentId, html, document?.title);
      }
    }, 50);

    // 3. Debounced database save (1.5s) to avoid spamming version history
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      setSaveStatus('saving');
      socketService.saveDocument(documentId, html);
    }, 1500);
  };

  const handleBlur = () => {
    socketService.stopTyping(documentId);
    if (saveTimeoutRef.current && document?.content) {
      clearTimeout(saveTimeoutRef.current);
      setSaveStatus('saving');
      socketService.saveDocument(documentId, document.content);
    }
  };

  const updateCursor = useCallback((cursor) => {
    if (!documentId) return;
    socketService.updateCursor(documentId, cursor);
  }, [documentId]);

  const loadVersions = async () => {
    const res = await documentApi.getVersions(documentId);
    setVersions(res.data || []);
  };

  const restoreVersion = async (versionId) => {
    const res = await documentApi.restoreVersion(documentId, versionId);
    setDocument(res.data);
    lastSentContentRef.current = res.data.content || '';
    socketService.sendUpdate(documentId, res.data.content, res.data.title);
    await loadVersions();
  };

  return {
    document,
    collaborators,
    typingUsers,
    remoteCursors,
    saveStatus,
    loading,
    error,
    versions,
    updateContent,
    updateCursor,
    handleBlur,
    loadVersions,
    restoreVersion,
    setSaveStatus,
    setDocument,
    loadDocument,
  };
}

export default useEditor;
