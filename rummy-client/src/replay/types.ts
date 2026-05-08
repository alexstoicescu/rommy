// Mirror of rummy-server/src/MatchRecorder.ts public shapes. The
// server emits these via the `match_tape` socket event; the client
// stores them only while the After-Action Report or replay scrubber
// is mounted, then releases the reference.
import type { Tile } from "../types/game";

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
  board: Record<string, Tile[][]>;
  hands: Record<string, Tile[]>;
  discardPile: Tile[];
  drawPileCount: number;
  currentTurn: string | null;
  hasDrawn: boolean;
  mustUseTileId: string | null;
  meldedScores: Record<string, number>;
  roundScores?: Record<string, number>;
}

export interface MatchEvent {
  ts: number;
  type: MatchEventType;
  actor?: string;
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

export interface MatchTape {
  roomId: string;
  startedAt: number;
  endedAt: number;
  players: MatchTapePlayer[];
  atu: Tile | null;
  events: MatchEvent[];
  hypeContrib: Record<string, number>;
  finalScores: Record<string, number>;
  globalScores: Record<string, number>;
  /** sessionId -> signed ELO delta this round. */
  eloDeltas: Record<string, number>;
  /** sessionId -> ELO after the round (1200 for bots / unranked). */
  eloAfter: Record<string, number>;
  /** sessionId -> whether ELO was actually computed for this seat. */
  eloAffected: Record<string, boolean>;
  /** Roster captured at deal time (frozen). */
  startingPlayers: MatchTapePlayer[];
  /** "ranked" if all starting players were human, else "social". */
  matchType: MatchType;
  winnerSessionId: string;
  closingTile: Tile;
}
