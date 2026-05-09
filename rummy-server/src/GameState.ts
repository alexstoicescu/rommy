import { scoreMeldFinal, type Tile, type TileColor } from "./GameRules";
import { getSession } from "./SessionStore";
import type { MatchRecorder } from "./MatchRecorder";

function getConnectionStatus(sessionId: string): "active" | "disconnected" {
  // Bot sessions and any oddball case both report active — the only
  // way a session is "disconnected" is via markDisconnected.
  return getSession(sessionId)?.connectionStatus ?? "active";
}

// Pluggable ELO lookup. index.ts wires the EloLedger in at boot via
// setEloLookup; until then publicView returns the starting rating
// (1200) for everyone. Keeps GameState.ts free of a hard dependency
// on the ledger module.
let eloLookup: (signatureId: string | null) => number = () => 1200;
export function setEloLookup(fn: typeof eloLookup): void {
  eloLookup = fn;
}

export interface Player {
  /**
   * Stable identity (UUID for humans, "bot-<uuid>" for bots).
   * Survives reconnects; the socketId field is the volatile one.
   */
  sessionId: string;
  /** Current socket binding. Updated whenever a session reconnects. */
  socketId: string;
  /**
   * Persistent reputation identity (Syndicate Ledger). Null for bots.
   * Captured at room-join time from the player's session.
   */
  signatureId: string | null;
  name: string;
  hand: Tile[];
  hasMeldedInitial: boolean;
  /** Running tally of points this player has placed on the board (closing-time scoring). */
  meldedScore: number;
  /** True for "Rami" AI players. They get auto-played after a delay. */
  isBot: boolean;
  /** 0..3 — index into the client's PLAYER_THEMES palette. */
  colorIndex: number;
  /** Atu / one-shot bonuses awarded this round, added on top of meldedScore at finalize. */
  bonusPoints: number;
  /**
   * Tactical Spatial Rack (v2.9): tileId -> slot index in the
   * player's 2-row × 22-col hand grid (0..43, row-major). Sparse —
   * unmapped tiles are auto-placed at the first free slot before
   * the next broadcast.
   */
  handLayout: Record<string, number>;
}

export type RoomPhase = "lobby" | "scrambling" | "playing" | "scoreboard";

export interface Room {
  id: string;
  players: Player[];
  /**
   * Lifecycle phase. 'lobby' before the first deal, 'playing' during a
   * round, 'scoreboard' for the 15-second leaderboard pause after a
   * round closes (auto-deals back to 'playing' on timer fire).
   */
  phase: RoomPhase;
  /** Epoch-ms deadline for the scoreboard auto-deal. Null while playing. */
  scoreboardEndsAt: number | null;
  /**
   * Pre-deal scramble phase: a shared 10-second tactile shuffle where
   * everyone sees the same 106 face-down tiles in a messy cluster.
   * scrambleEndsAt is the deal deadline; scrambleSeed seeds the pile
   * layout so every client renders the same chaos.
   */
  scrambleEndsAt: number | null;
  scrambleSeed: number | null;
  /**
   * 0-100 group-momentum gauge that fills during SCRAMBLING as
   * players whisk their cursors through the pile. Reset whenever a
   * fresh scramble starts.
   */
  hypeLevel: number;
  /** Transient — velocity received in the current 100ms tick. */
  hypePool: number;
  /** True once hypeLevel has hit 100 this scramble (so the climax
   *  broadcast fires only once per round). */
  hypeClimaxFired: boolean;
  /**
   * SessionIds of players who have clicked "Ready for Next Round" during
   * the scoreboard phase. When every connected human is in this set the
   * server skips the rest of the timer and deals immediately.
   */
  readyForNext: Set<string>;
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
   * the player realises they cannot meld. Cleared on a successful
   * meld of the target tile (after the bonus is delivered) and on
   * turn advance.
   */
  lastRupere: { tiles: Tile[]; pickIdx: number; playerId: string } | null;
  /**
   * Bonus tiles "above" the rupered target — held by the server until
   * the player actually melds the target tile. Pushed to the player's
   * hand the moment they successfully play the target on the board.
   */
  pendingRupereBonusCards: Tile[];
  /**
   * Tile id of the very first discarded card of the round (the seeded
   * discard). It can never be Rupered.
   */
  firstDiscardTileId: string | null;
  /**
   * The "Atu" trump tile for this round — the very first tile pulled
   * from the shuffled deck before anyone is dealt. Visible to all
   * players. Whoever first holds it earns +50 bonus points.
   */
  atu: Tile | null;
  /** SocketId of the player who first received (and was credited for) the Atu. */
  atuAwardedTo: string | null;
  /**
   * Per-round event log. Created at the start of each scramble and
   * sealed at finalizeRound. Null between rounds. Carries the live
   * MatchTape for the After-Action Report and replay scrubber.
   */
  recorder: MatchRecorder | null;
}

export const MAX_PLAYERS = 4;

export function createRoom(id: string): Room {
  return {
    id,
    players: [],
    phase: "lobby",
    scoreboardEndsAt: null,
    scrambleEndsAt: null,
    scrambleSeed: null,
    hypeLevel: 0,
    hypePool: 0,
    hypeClimaxFired: false,
    readyForNext: new Set<string>(),
    board: {},
    drawPile: [],
    discardPile: [],
    currentTurn: null,
    gameStarted: false,
    hasDrawn: false,
    turnEndsAt: null,
    mustUseTileId: null,
    lastRupere: null,
    pendingRupereBonusCards: [],
    firstDiscardTileId: null,
    atu: null,
    atuAwardedTo: null,
    recorder: null,
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
  // generateDeck() returns a freshly Fisher–Yates shuffled 106-tile
  // deck with unique ids per copy.
  const deck = generateDeck();

  // 1. Atu extraction: take the very first tile of the shuffled deck
  //    and SPLICE it out of the dealable array so it cannot end up in
  //    any player's hand. Earlier versions left it in deck[0] and then
  //    started dealing at cursor=0, which is why player 0 always held
  //    the Atu — that was a bug, not the intended rule.
  const [atuTile] = deck.splice(0, 1);
  room.atu = atuTile ?? null;
  // The Atu sits face-up on the table. Nobody is auto-credited for
  // holding it; the +50 bonus rule was an artifact of the deal bug.
  room.atuAwardedTo = null;

  // 2. The deal: player 0 gets 15, every other player gets 14.
  let cursor = 0;
  room.players.forEach((player, idx) => {
    const handSize = idx === 0 ? 15 : 14;
    player.hand = deck.slice(cursor, cursor + handSize);
    player.hasMeldedInitial = false;
    player.meldedScore = 0;
    player.bonusPoints = 0;
    // Populate the tactical rack: lay tiles across the top row
    // (slots 0..N-1) in deal order. Players can rearrange via
    // place_tile_at_slot or sort_hand thereafter.
    player.handLayout = {};
    player.hand.forEach((tile, i) => {
      player.handLayout[tile.id] = i;
    });
    cursor += handSize;
  });

  // 3. Seed the discard pile with the next tile, then the rest is the
  //    draw pile. (e.g. 4-player game: 105 - 15 - 42 - 1 = 47 in draw.)
  room.discardPile = [deck[cursor]];
  room.firstDiscardTileId = deck[cursor].id;
  room.pendingRupereBonusCards = [];
  cursor += 1;
  room.drawPile = deck.slice(cursor);
  // Reset every player's zone — fresh empty arrays keyed by socketId.
  room.board = {};
  for (const p of room.players) room.board[p.socketId] = [];
  room.currentTurn = room.players[0]?.socketId ?? null;
  room.gameStarted = true;
  room.phase = "playing";
  room.scoreboardEndsAt = null;
  room.scrambleEndsAt = null;
  room.scrambleSeed = null;
  room.hypeLevel = 0;
  room.hypePool = 0;
  room.hypeClimaxFired = false;
  room.readyForNext.clear();
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
    sessionId: string;
    name: string;
    handCount: number;
    hasMeldedInitial: boolean;
    isBot: boolean;
    colorIndex: number;
    bonusPoints: number;
    connectionStatus: "active" | "disconnected";
    /** Current Syndicate Ledger ELO. 1200 default for new / unknown. */
    eloScore: number;
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
  /** The Atu trump tile for this round (visible to everyone), or null pre-deal. */
  atu: Tile | null;
  /** SocketId of the player who was awarded the +50 Atu bonus. */
  atuAwardedTo: string | null;
  phase: RoomPhase;
  scoreboardEndsAt: number | null;
  scrambleEndsAt: number | null;
  scrambleSeed: number | null;
  /** Live hype gauge during SCRAMBLING (also pushed via dedicated
   *  hype_update events at 100ms cadence). */
  hypeLevel: number;
  /** SessionIds that have clicked "Ready for Next Round" this intermission. */
  readyForNext: string[];
  /** SessionId -> cumulative score across rounds in this room. */
  globalScores: Record<string, number>;
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
      sessionId: p.sessionId,
      name: p.name,
      handCount: p.hand.length,
      hasMeldedInitial: p.hasMeldedInitial,
      isBot: p.isBot,
      colorIndex: p.colorIndex,
      bonusPoints: p.bonusPoints,
      connectionStatus: getConnectionStatus(p.sessionId),
      eloScore: p.isBot ? 1200 : eloLookup(p.signatureId),
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
    atu: room.atu,
    atuAwardedTo: room.atuAwardedTo,
    phase: room.phase,
    scoreboardEndsAt: room.scoreboardEndsAt,
    scrambleEndsAt: room.scrambleEndsAt,
    scrambleSeed: room.scrambleSeed,
    hypeLevel: room.hypeLevel,
    readyForNext: Array.from(room.readyForNext),
    globalScores: Object.fromEntries(
      room.players.map((p) => [
        p.sessionId,
        getSession(p.sessionId)?.globalScore ?? 0,
      ]),
    ),
  };
}

export interface PlayerView extends PublicRoomView {
  hand: Tile[]; // private to the recipient
  hasMeldedInitial: boolean; // private convenience for the recipient
  /** Tactical Spatial Rack — tileId -> slot index (0..43). */
  handLayout: Record<string, number>;
}

export function viewForSocket(room: Room, socketId: string): PlayerView {
  const me = room.players.find((p) => p.socketId === socketId);
  return {
    ...publicView(room),
    hand: me ? me.hand : [],
    hasMeldedInitial: me ? me.hasMeldedInitial : false,
    handLayout: me ? { ...me.handLayout } : {},
  };
}
