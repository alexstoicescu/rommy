import { scoreMeldFinal, type Tile, type TileColor } from "./GameRules";

export interface Player {
  socketId: string;
  name: string;
  hand: Tile[];
  hasMeldedInitial: boolean;
  /** Running tally of points this player has placed on the board (closing-time scoring). */
  meldedScore: number;
  /** True for "Rami" AI players. They get auto-played after a delay. */
  isBot: boolean;
  /** 0..3 — index into the client's PLAYER_THEMES palette. */
  colorIndex: number;
}

export interface Room {
  id: string;
  players: Player[];
  /**
   * Per-player meld zones, keyed by `socketId`. Every meld lives in
   * exactly one zone — the zone owned by the player who first placed
   * it via Etalare or `play_new_meld`. Other players may attach tiles
   * to any zone via `attach_tile`.
   */
  board: Record<string, Tile[][]>;
  drawPile: Tile[];
  discardPile: Tile[];
  currentTurn: string | null; // socketId of player whose turn it is
  gameStarted: boolean;
  /** True once the active player has drawn this turn (gates discard). */
  hasDrawn: boolean;
  /** Epoch-ms deadline for the current turn (auto-pass at expiry). */
  turnEndsAt: number | null;
  /**
   * After a Rupere, the id of the picked ("broken") tile. The active
   * player must place this tile on the board (Etalare or Lipire)
   * before they are allowed to discard. Cleared on turn advance.
   */
  mustUseTileId: string | null;
  /**
   * Snapshot of the tiles taken on this turn's Rupere (in pile order)
   * and the index they were picked from, so the move can be undone if
   * the player realises they cannot meld. Cleared by any meld/attach
   * commit and on turn advance.
   */
  lastRupere: { tiles: Tile[]; pickIdx: number; playerId: string } | null;
}

export const MAX_PLAYERS = 4;

export function createRoom(id: string): Room {
  return {
    id,
    players: [],
    board: {},
    drawPile: [],
    discardPile: [],
    currentTurn: null,
    gameStarted: false,
    hasDrawn: false,
    turnEndsAt: null,
    mustUseTileId: null,
    lastRupere: null,
  };
}

/**
 * Build the official 106-tile Romanian Rummy deck:
 *   - values 1..13 in 4 colors (red, yellow, blue, black) × 2 copies = 104 tiles
 *   - 2 jokers ("Joly")
 * Tile ids are unique per copy (`-a` / `-b`) so dnd-kit never sees
 * duplicate item ids even though two physical tiles have the same
 * value and color. The deck is Fisher–Yates shuffled before return.
 */
export function generateDeck(): Tile[] {
  const colors: TileColor[] = ["red", "yellow", "blue", "black"];
  const tiles: Tile[] = [];
  const copyTags = ["a", "b"] as const;

  for (const copyTag of copyTags) {
    for (const color of colors) {
      for (let value = 1; value <= 13; value++) {
        tiles.push({
          id: `${color}-${value}-${copyTag}`,
          color,
          value,
          isJoker: false,
        });
      }
    }
  }

  tiles.push({ id: "joker-a", color: "joker", value: 0, isJoker: true });
  tiles.push({ id: "joker-b", color: "joker", value: 0, isJoker: true });

  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }

  return tiles;
}

/**
 * Deal a freshly shuffled deck across the room. The first player
 * receives 15 tiles (they go first and end the turn by discarding);
 * the rest receive 14. One tile seeds the discard pile; the rest form
 * the draw pile.
 */
export function dealRoom(room: Room): void {
  const deck = generateDeck();
  let cursor = 0;

  room.players.forEach((player, idx) => {
    const handSize = idx === 0 ? 15 : 14;
    player.hand = deck.slice(cursor, cursor + handSize);
    player.hasMeldedInitial = false;
    player.meldedScore = 0;
    cursor += handSize;
  });

  room.discardPile = [deck[cursor]];
  cursor += 1;
  room.drawPile = deck.slice(cursor);
  // Reset every player's zone — fresh empty arrays keyed by socketId.
  room.board = {};
  for (const p of room.players) room.board[p.socketId] = [];
  room.currentTurn = room.players[0]?.socketId ?? null;
  room.gameStarted = true;
  // First player was dealt 15 tiles — they "skip" the draw step and
  // begin in a state where they can only discard.
  room.hasDrawn = true;
}

/**
 * Public view of a room — what every player can see. Each player
 * additionally gets their own private `hand` (see `viewForSocket`).
 */
export interface PublicRoomView {
  roomId: string;
  players: Array<{
    socketId: string;
    name: string;
    handCount: number;
    hasMeldedInitial: boolean;
    isBot: boolean;
    colorIndex: number;
  }>;
  board: Record<string, Tile[][]>;
  drawPileCount: number;
  discardPile: Tile[];
  currentTurn: string | null;
  gameStarted: boolean;
  hasDrawn: boolean;
  turnEndsAt: number | null;
  mustUseTileId: string | null;
  /** Quick-access map: socketId -> tiles currently held. */
  handCounts: Record<string, number>;
  /** socketId -> closing-time point total of that player's zone. */
  meldPoints: Record<string, number>;
}

export function publicView(room: Room): PublicRoomView {
  const handCounts: Record<string, number> = {};
  const meldPoints: Record<string, number> = {};
  for (const p of room.players) {
    handCounts[p.socketId] = p.hand.length;
    const zone = room.board[p.socketId] ?? [];
    meldPoints[p.socketId] = zone.reduce(
      (sum, meld) => sum + scoreMeldFinal(meld),
      0,
    );
  }
  return {
    roomId: room.id,
    players: room.players.map((p) => ({
      socketId: p.socketId,
      name: p.name,
      handCount: p.hand.length,
      hasMeldedInitial: p.hasMeldedInitial,
      isBot: p.isBot,
      colorIndex: p.colorIndex,
    })),
    board: room.board,
    drawPileCount: room.drawPile.length,
    discardPile: room.discardPile,
    currentTurn: room.currentTurn,
    gameStarted: room.gameStarted,
    hasDrawn: room.hasDrawn,
    turnEndsAt: room.turnEndsAt,
    mustUseTileId: room.mustUseTileId,
    handCounts,
    meldPoints,
  };
}

export interface PlayerView extends PublicRoomView {
  hand: Tile[]; // private to the recipient
  hasMeldedInitial: boolean; // private convenience for the recipient
}

export function viewForSocket(room: Room, socketId: string): PlayerView {
  const me = room.players.find((p) => p.socketId === socketId);
  return {
    ...publicView(room),
    hand: me ? me.hand : [],
    hasMeldedInitial: me ? me.hasMeldedInitial : false,
  };
}
