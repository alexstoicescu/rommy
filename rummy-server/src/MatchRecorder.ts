// Per-room recorder that captures every state-mutating event with a
// timestamp + a full board snapshot. The accumulated tape is sealed
// at finalizeRound and broadcast to clients as a `match_tape` event,
// where it powers both the After-Action Report analytics and the
// replay scrubber.
//
// All identity in the tape is keyed by sessionId (stable across
// reconnects), never by the volatile socket.id.

import type { Tile } from "./GameRules";
import type { Room } from "./GameState";

export type MatchEventType =
  | "scramble_start"
  | "deal"
  | "draw"
  | "rupere"
  | "rupere_undo"
  | "etalare"
  | "play_meld"
  | "attach"
  | "discard"
  | "auto_pass"
  | "finalize";

export interface MatchSnapshot {
  /** sessionId -> meld zones currently on the board. */
  board: Record<string, Tile[][]>;
  /** sessionId -> hand contents (full transparency for replay). */
  hands: Record<string, Tile[]>;
  discardPile: Tile[];
  drawPileCount: number;
  /** sessionId of the player whose turn it currently is. */
  currentTurn: string | null;
  hasDrawn: boolean;
  mustUseTileId: string | null;
  /** sessionId -> running closing-time melded score. */
  meldedScores: Record<string, number>;
  /** Only set on the finalize event — full per-player round scores. */
  roundScores?: Record<string, number>;
}

export interface MatchEvent {
  ts: number;
  type: MatchEventType;
  /** sessionId of the player who performed the action (if any). */
  actor?: string;
  /**
   * Light-weight semantic detail keyed off the event type. Examples:
   *   draw   -> { tileId }
   *   rupere -> { tileId, takenCount }
   *   etalare / play_meld / attach -> { tilesPlaced, pointsAdded }
   *   discard -> { tileId }
   *   finalize -> { winnerSessionId }
   */
  meta?: Record<string, unknown>;
  snapshot: MatchSnapshot;
}

export interface MatchTapePlayer {
  sessionId: string;
  name: string;
  isBot: boolean;
  colorIndex: number;
}

export interface MatchTape {
  roomId: string;
  startedAt: number;
  endedAt: number;
  players: MatchTapePlayer[];
  atu: Tile | null;
  events: MatchEvent[];
  /** sessionId -> total px-traveled velocity contributed during scramble. */
  hypeContrib: Record<string, number>;
  /** sessionId -> final per-round score (post bonuses). */
  finalScores: Record<string, number>;
  /** sessionId -> cumulative globalScore including this round. */
  globalScores: Record<string, number>;
  winnerSessionId: string;
  closingTile: Tile;
}

export class MatchRecorder {
  events: MatchEvent[] = [];
  hypeContrib: Map<string, number> = new Map();
  startedAt: number;

  constructor(startedAt: number = Date.now()) {
    this.startedAt = startedAt;
  }

  record(
    type: MatchEventType,
    room: Room,
    opts: {
      actor?: string;
      meta?: Record<string, unknown>;
      roundScores?: Record<string, number>;
    } = {},
  ): void {
    const snapshot = this.snapshotRoom(room);
    if (opts.roundScores) snapshot.roundScores = opts.roundScores;
    this.events.push({
      ts: Date.now(),
      type,
      actor: opts.actor,
      meta: opts.meta,
      snapshot,
    });
  }

  addHype(sessionId: string, velocity: number): void {
    if (!sessionId || !Number.isFinite(velocity) || velocity <= 0) return;
    this.hypeContrib.set(
      sessionId,
      (this.hypeContrib.get(sessionId) ?? 0) + velocity,
    );
  }

  /** Build a session-keyed snapshot from the current room state. */
  private snapshotRoom(room: Room): MatchSnapshot {
    const hands: Record<string, Tile[]> = {};
    const meldedScores: Record<string, number> = {};
    const board: Record<string, Tile[][]> = {};
    let currentTurnSession: string | null = null;
    for (const p of room.players) {
      hands[p.sessionId] = p.hand.slice();
      meldedScores[p.sessionId] = p.meldedScore;
      const zone = room.board[p.socketId] ?? [];
      board[p.sessionId] = zone.map((m) => m.slice());
      if (room.currentTurn && p.socketId === room.currentTurn) {
        currentTurnSession = p.sessionId;
      }
    }
    return {
      board,
      hands,
      discardPile: room.discardPile.slice(),
      drawPileCount: room.drawPile.length,
      currentTurn: currentTurnSession,
      hasDrawn: room.hasDrawn,
      mustUseTileId: room.mustUseTileId,
      meldedScores,
    };
  }

  /** Seal the tape at the close of a round. */
  finalize(
    room: Room,
    winnerSessionId: string,
    closingTile: Tile,
    finalScores: Record<string, number>,
    globalScores: Record<string, number>,
  ): MatchTape {
    return {
      roomId: room.id,
      startedAt: this.startedAt,
      endedAt: Date.now(),
      players: room.players.map((p) => ({
        sessionId: p.sessionId,
        name: p.name,
        isBot: p.isBot,
        colorIndex: p.colorIndex,
      })),
      atu: room.atu,
      events: this.events,
      hypeContrib: Object.fromEntries(this.hypeContrib),
      finalScores,
      globalScores,
      winnerSessionId,
      closingTile,
    };
  }
}
