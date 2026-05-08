// In-memory session store. Decouples player identity from the volatile
// socket.id so a client that drops + reconnects is recognised as the
// same player.
//
// Identity boundary: the source of truth for "who is this client" is
// the sessionId (UUID, persisted in localStorage on the client). The
// socket.id only tells us which TCP/websocket they're talking through
// right now and changes on every reconnect.

import { randomUUID } from "node:crypto";

export type ConnectionStatus = "active" | "disconnected";

export interface Session {
  sessionId: string;
  /** Last name the client presented. May be overwritten on join. */
  playerName: string;
  /** Cumulative score across rounds in the current session. */
  globalScore: number;
  connectionStatus: ConnectionStatus;
  /** Whatever socket.id this session is currently bound to (if any). */
  currentSocketId: string | null;
  /**
   * If we're inside the 60-second grace window after a disconnect, this
   * holds the timeout that will evict the session if no reconnect lands.
   * Cleared the moment the client comes back.
   */
  reconnectTimer: NodeJS.Timeout | null;
}

const sessions = new Map<string, Session>();
const socketToSession = new Map<string, string>();

export function getSession(sessionId: string): Session | null {
  return sessions.get(sessionId) ?? null;
}

export function getSessionBySocket(socketId: string): Session | null {
  const sid = socketToSession.get(socketId);
  if (!sid) return null;
  return sessions.get(sid) ?? null;
}

/**
 * Resolve a sessionId from the client. If the supplied id is missing or
 * unknown, mint a fresh one. Either way, the returned Session is the
 * canonical record for that client and can be used immediately.
 */
export function resolveSession(claimedId: string | undefined): Session {
  if (claimedId) {
    const existing = sessions.get(claimedId);
    if (existing) return existing;
  }
  const sessionId = randomUUID();
  const session: Session = {
    sessionId,
    playerName: "",
    globalScore: 0,
    connectionStatus: "active",
    currentSocketId: null,
    reconnectTimer: null,
  };
  sessions.set(sessionId, session);
  return session;
}

export function bindSocket(session: Session, socketId: string): void {
  // Clean up any old socket->session pointer first.
  if (session.currentSocketId && session.currentSocketId !== socketId) {
    socketToSession.delete(session.currentSocketId);
  }
  session.currentSocketId = socketId;
  session.connectionStatus = "active";
  socketToSession.set(socketId, session.sessionId);
}

export function unbindSocket(socketId: string): Session | null {
  const sid = socketToSession.get(socketId);
  if (!sid) return null;
  socketToSession.delete(socketId);
  const session = sessions.get(sid);
  if (!session) return null;
  if (session.currentSocketId === socketId) {
    session.currentSocketId = null;
  }
  return session;
}

export function deleteSession(sessionId: string): void {
  const s = sessions.get(sessionId);
  if (!s) return;
  if (s.reconnectTimer) clearTimeout(s.reconnectTimer);
  if (s.currentSocketId) socketToSession.delete(s.currentSocketId);
  sessions.delete(sessionId);
}

/**
 * Flag a session as disconnected and start its 60-second eviction timer.
 * If the timer fires (no reconnect) the supplied onExpire callback runs
 * with the sessionId so the caller can evict the player from any room.
 */
export function markDisconnected(
  session: Session,
  onExpire: (sessionId: string) => void,
  graceMs: number,
): void {
  session.connectionStatus = "disconnected";
  if (session.reconnectTimer) clearTimeout(session.reconnectTimer);
  session.reconnectTimer = setTimeout(() => {
    session.reconnectTimer = null;
    onExpire(session.sessionId);
  }, graceMs);
}

/** Reverse of markDisconnected — used the moment the client comes back. */
export function markActive(session: Session): void {
  session.connectionStatus = "active";
  if (session.reconnectTimer) {
    clearTimeout(session.reconnectTimer);
    session.reconnectTimer = null;
  }
}

/** For bots: synthetic session with no networking. */
export function createBotSession(name: string): Session {
  const sessionId = `bot-${randomUUID()}`;
  const session: Session = {
    sessionId,
    playerName: name,
    globalScore: 0,
    connectionStatus: "active",
    currentSocketId: null,
    reconnectTimer: null,
  };
  sessions.set(sessionId, session);
  return session;
}
