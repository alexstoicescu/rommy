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
  signatureId: string | null;
  name: string;
  isBot: boolean;
  colorIndex: number;
}

export type MatchType = "ranked" | "social";

export interface StartingHuman {
  sessionId: string;
  signatureId: string;
  name: string;
  /** ELO at the moment the round was dealt — frozen per spec so a
   *  mid-round disconnect can't change another player's calculation. */
  startRating: number;
}

export interface MatchTape {
  roomId: string;
  startedAt: number;
  endedAt: number;
  /** Roster as of finalizeRound (post any mid-round evictions). */
  players: MatchTapePlayer[];
  /** Roster captured at deal time — drives ELO regardless of who left. */
  startingPlayers: MatchTapePlayer[];
  atu: Tile | null;
  events: MatchEvent[];
  /** sessionId -> total px-traveled velocity contributed during scramble. */
  hypeContrib: Record<string, number>;
  /** sessionId -> final per-round score (post bonuses). */
  finalScores: Record<string, number>;
  /** sessionId -> cumulative globalScore including this round. */
  globalScores: Record<string, number>;
  /** sessionId -> ELO delta applied this round (signed). 0 if unaffected. */
  eloDeltas: Record<string, number>;
  /** sessionId -> post-update ELO. 1200 for bots / unknown. */
  eloAfter: Record<string, number>;
  /**
   * sessionId -> whether ELO was actually computed for this seat.
   * False for bots and for any human in a Ghost-Bot scenario where
   * the calculation was skipped (solo-vs-bots, etc.).
   */
  eloAffected: Record<string, boolean>;
  /** "ranked" if all starting players were human, else "social". */
  matchType: MatchType;
  /** v3.0.0 — true when ELO writes did not hit Supabase (Ephemeral Mode). */
  ephemeral?: boolean;
  /**
   * v3.7.0 — sessionId of the player who was granted the Atu at deal
   * time. Stable across reconnects. The +50 already lives inside
   * finalScores (via that player's bonusPoints), but this field lets
   * the AAR call out the grant as its own breakdown line and tag the
   * Atu card with "GRANTED TO: <name>".
   */
  atuOwnerSessionId?: string | null;
  /**
   * v3.8.0 — Joker Gambit. True iff the closingTile was a Joker. When
   * true, every entry in finalScores has already been doubled by the
   * scoring engine; the AAR uses the flag to render the 2X STAKES
   * banner + the purple-glow column treatment.
   */
  isJokerWin?: boolean;
  /**
   * v3.8.0 — Score multiplier applied to every player's row. 1 for
   * normal rounds, 2 for Joker Gambit. Stored explicitly (rather
   * than re-derived from isJokerWin) so future rules can introduce
   * 1.5× / 3× without breaking the AAR.
   */
  multiplier?: number;
  winnerSessionId: string;
  closingTile: Tile;
}

export class MatchRecorder {
  events: MatchEvent[] = [];
  hypeContrib: Map<string, number> = new Map();
  startedAt: number;
  /** Roster snapshotted at deal time — frozen for the rest of the
   *  round so disconnects don't change ELO eligibility. */
  startingPlayers: MatchTapePlayer[] = [];
  startingHumans: StartingHuman[] = [];

  constructor(startedAt: number = Date.now()) {
    this.startedAt = startedAt;
  }

  /**
   * Snapshot the deal-time roster. Called from index.ts immediately
   * after dealRoom, before any per-event records. Captures each
   * human's pre-match ELO so the calculation at finalize uses ratings
   * from the moment the round began rather than any concurrent
   * mutation.
   */
  captureStartingRoster(
    room: Room,
    getRating: (signatureId: string | null) => number,
  ): void {
    this.startingPlayers = room.players.map((p) => ({
      sessionId: p.sessionId,
      signatureId: p.signatureId,
      name: p.name,
      isBot: p.isBot,
      colorIndex: p.colorIndex,
    }));
    this.startingHumans = room.players
      .filter((p) => !p.isBot && p.signatureId)
      .map((p) => ({
        sessionId: p.sessionId,
        signatureId: p.signatureId as string,
        name: p.name,
        startRating: getRating(p.signatureId),
      }));
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
        signatureId: p.signatureId,
        name: p.name,
        isBot: p.isBot,
        colorIndex: p.colorIndex,
      })),
      startingPlayers: this.startingPlayers,
      atu: room.atu,
      events: this.events,
      hypeContrib: Object.fromEntries(this.hypeContrib),
      finalScores,
      globalScores,
      eloDeltas: {},
      eloAfter: {},
      eloAffected: {},
      // Default to "ranked"; index.ts overwrites with the correct
      // value after inspecting the starting roster for bots.
      matchType: this.startingPlayers.some((p) => p.isBot)
        ? "social"
        : "ranked",
      winnerSessionId,
      closingTile,
    };
  }
}
