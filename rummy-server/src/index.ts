import express from "express";
import cors from "cors";
import http from "http";
import { Server, Socket } from "socket.io";
import {
  createRoom,
  dealRoom,
  setEloLookup,
  viewForSocket,
  MAX_PLAYERS,
  type Player,
  type Room,
} from "./GameState";
import { EloLedger } from "./EloLedger";
import { computeEloDeltas, type EloSeat } from "./EloEngine";
import {
  addTileWithSlot,
  placeTileAtSlot,
  reconcileHandLayout,
  removeTileFromHand,
  removeTilesFromHand,
  sortHand,
  type HandSortMode,
} from "./HandGrid";
import {
  canInitialMeld,
  calculateFinalScores,
  isValidFormatie,
  isValidSuita,
  reifySuita,
  scoreMeldFinal,
  type Tile,
} from "./GameRules";
import {
  findAttachment,
  pickDiscard,
  tryEtalare,
  tryNewMelds,
} from "./Bot";
import {
  bindSocket,
  createBotSession,
  getSession,
  getSessionBySocket,
  markActive,
  markDisconnected,
  resolveSession,
  type Session,
} from "./SessionStore";
import { MatchRecorder } from "./MatchRecorder";

// Syndicate Reputation Ledger — single shared instance.
const LEDGER_PATH = process.env.LEDGER_PATH ?? "./ledger.json";
const eloLedger = new EloLedger(LEDGER_PATH);
setEloLookup((signatureId) => {
  if (!signatureId) return 1200;
  return eloLedger.get(signatureId).eloScore;
});

const RECONNECT_GRACE_MS = 60_000;
const SCOREBOARD_DURATION_MS = 45_000;
const SCRAMBLE_DURATION_MS = 10_000;
const HYPE_TICK_MS = 100;
const HYPE_INPUT_CAP = 200;        // cap each velocity event so a stuck high value can't dominate
const HYPE_GAIN = 0.045;           // pool -> level scaling factor
const HYPE_DECAY = 1.6;            // -level / tick when no input arrives

const scoreboardTimers = new Map<string, NodeJS.Timeout>();
const scrambleTimers = new Map<string, NodeJS.Timeout>();
const hypeTickers = new Map<string, NodeJS.Timeout>();

/**
 * Enter the 10-second collaborative scramble phase before any deal.
 * Clients use scrambleSeed to render the same 106-tile messy cluster
 * and broadcast cursor positions to each other; the server is purely
 * the timer. When it fires we deal and transition to 'playing'.
 */
function beginScramble(room: Room): void {
  const prior = scrambleTimers.get(room.id);
  if (prior) clearTimeout(prior);
  stopHypeTicker(room);
  // Reset per-round residue but DON'T deal yet — dealRoom is what flips
  // gameStarted on. During scramble the room is in a pre-game phase.
  room.board = {};
  room.discardPile = [];
  room.drawPile = [];
  room.gameStarted = false;
  room.currentTurn = null;
  room.phase = "scrambling";
  room.scrambleSeed = Math.floor(Math.random() * 0x7fffffff) || 1;
  room.scrambleEndsAt = Date.now() + SCRAMBLE_DURATION_MS;
  room.hypeLevel = 0;
  room.hypePool = 0;
  room.hypeClimaxFired = false;
  // New round = new tape. The recorder spans both the scramble (for
  // hype credit) and the round itself. Sealed at finalizeRound.
  room.recorder = new MatchRecorder();
  room.recorder.record("scramble_start", room);
  console.log(
    `Scramble in ${room.id} (seed=${room.scrambleSeed}, players=${room.players.length})`,
  );
  broadcastRoomUpdate(room);
  broadcastGameState(room);
  startHypeTicker(room);
  const handle = setTimeout(() => {
    scrambleTimers.delete(room.id);
    if (!rooms.has(room.id)) return;
    stopHypeTicker(room);
    if (room.players.length < 2) {
      // Players bailed during the scramble — drop back to lobby.
      room.phase = "lobby";
      room.scrambleEndsAt = null;
      room.scrambleSeed = null;
      broadcastRoomUpdate(room);
      broadcastGameState(room);
      return;
    }
    dealRoom(room);
    // Freeze the starting roster + per-human ELO ratings the moment
    // the deal lands. This snapshot is what drives the True-Human
    // pairwise calc at finalizeRound, regardless of who disconnects
    // mid-round.
    room.recorder?.captureStartingRoster(room, (sigId) =>
      sigId ? eloLedger.get(sigId).eloScore : 1200,
    );
    room.recorder?.record("deal", room);
    startTurnTimer(room);
    broadcastRoomUpdate(room);
    broadcastGameState(room);
    maybeScheduleBotTurn(room);
  }, SCRAMBLE_DURATION_MS);
  scrambleTimers.set(room.id, handle);
}

/**
 * Drain the per-room hypePool into hypeLevel every 100ms during the
 * scramble phase. Broadcasts a compact hype_update so clients can
 * paint the meter without parsing the full PublicRoomView, and fires
 * a one-shot hype_climax the first time the bar tops out.
 */
function startHypeTicker(room: Room): void {
  stopHypeTicker(room);
  const handle = setInterval(() => {
    if (room.phase !== "scrambling") {
      stopHypeTicker(room);
      return;
    }
    const delta = room.hypePool * HYPE_GAIN - HYPE_DECAY;
    room.hypePool = 0;
    room.hypeLevel = Math.max(0, Math.min(100, room.hypeLevel + delta));
    io.to(room.id).emit("hype_update", { hypeLevel: room.hypeLevel });
    if (room.hypeLevel >= 100 && !room.hypeClimaxFired) {
      room.hypeClimaxFired = true;
      io.to(room.id).emit("hype_climax");
    }
  }, HYPE_TICK_MS);
  hypeTickers.set(room.id, handle);
}

function stopHypeTicker(room: Room): void {
  const t = hypeTickers.get(room.id);
  if (t) {
    clearInterval(t);
    hypeTickers.delete(room.id);
  }
}

const PORT = Number(process.env.PORT) || 10_000;
const TURN_DURATION_MS = 120_000;

// Allowed CORS origins: the deployed Vercel frontend, an optional
// override via FRONTEND_URL, and the local Vite dev server. We keep
// localhost in the list so a developer running against the deployed
// backend doesn't get bounced.
const ALLOWED_ORIGINS = [
  "https://rommyvercel.vercel.app",
  process.env.FRONTEND_URL,
  "http://localhost:5173",
].filter((o): o is string => typeof o === "string" && o.length > 0);

const app = express();
app.use(cors({ origin: ALLOWED_ORIGINS }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: ALLOWED_ORIGINS, methods: ["GET", "POST"] },
  pingInterval: 10_000,
  pingTimeout: 20_000,
});

// Auth middleware: every incoming socket gets resolved against the
// SessionStore. The client either passes back the sessionId we minted
// for it last time (handshake.auth.sessionId) or — first visit — gets a
// fresh one. Either way socket.data.session is the canonical record.
//
// The Syndicate Reputation Ledger identity (signatureId + alias) also
// rides on the auth handshake. Every socket event therefore carries
// the alias and signature_id implicitly via socket.data.session — no
// per-event payload duplication required.
io.use((socket, next) => {
  const auth = socket.handshake.auth as
    | { sessionId?: string; signatureId?: string; alias?: string }
    | undefined;
  const session = resolveSession(auth?.sessionId);
  bindSocket(session, socket.id);
  if (auth?.signatureId) {
    session.signatureId = auth.signatureId;
    session.alias = (auth.alias || "").trim() || session.alias || "Anon";
    eloLedger.upsert(session.signatureId, session.alias ?? "Anon");
  }
  (socket.data as { session: Session }).session = session;
  next();
});

// =====================================================================
//  Multi-room registry
// =====================================================================

const rooms = new Map<string, Room>();
const socketToRoom = new Map<string, string>(); // socketId -> roomCode
const turnTimers = new Map<string, NodeJS.Timeout>();

const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no I/L/O/0/1
function generateRoomCode(): string {
  for (let i = 0; i < 50; i++) {
    let code = "";
    for (let j = 0; j < 4; j++) {
      code += ROOM_CODE_ALPHABET[
        Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)
      ];
    }
    if (!rooms.has(code)) return code;
  }
  // Astronomically unlikely fallback.
  return `R${Date.now().toString(36).slice(-3).toUpperCase()}`;
}

function getRoom(socketId: string): Room | null {
  const code = socketToRoom.get(socketId);
  if (!code) return null;
  return rooms.get(code) ?? null;
}

/**
 * Find any room that already seats this session. Used on reconnect to
 * rebind the Player record's socketId to the new live socket.
 */
function findRoomBySession(sessionId: string): Room | null {
  for (const room of rooms.values()) {
    if (room.players.some((p) => p.sessionId === sessionId)) return room;
  }
  return null;
}

function getActiveRoom(socketId: string): Room | null {
  const room = getRoom(socketId);
  if (!room) return null;
  if (!room.gameStarted) return null;
  if (!room.players.some((p) => p.socketId === socketId)) return null;
  return room;
}

// =====================================================================
//  Broadcasts
// =====================================================================

function broadcastGameState(room: Room): void {
  // Belt-and-braces: every player's handLayout is reconciled before
  // the snapshot leaves the server, so any handler that forgets to
  // sync slots can't ship a corrupt view. Cheap (O(handSize)).
  for (const p of room.players) reconcileHandLayout(p);
  for (const p of room.players) {
    if (p.isBot) continue;
    io.to(p.socketId).emit("game_state_update", viewForSocket(room, p.socketId));
  }
}

function broadcastRoomUpdate(room: Room): void {
  const players = room.players.map((p) => ({
    id: p.socketId,
    name: p.name,
    isBot: p.isBot,
  }));
  io.to(room.id).emit("room_update", { code: room.id, players });
}

// =====================================================================
//  Turn flow
// =====================================================================

function stopTurnTimer(room: Room): void {
  const t = turnTimers.get(room.id);
  if (t) {
    clearTimeout(t);
    turnTimers.delete(room.id);
  }
  room.turnEndsAt = null;
}

function startTurnTimer(room: Room): void {
  stopTurnTimer(room);
  if (!room.gameStarted || !room.currentTurn) return;
  const turnSocketId = room.currentTurn;
  room.turnEndsAt = Date.now() + TURN_DURATION_MS;
  const handle = setTimeout(() => {
    if (!room.gameStarted || room.currentTurn !== turnSocketId) return;
    runAutoPass(room);
  }, TURN_DURATION_MS);
  turnTimers.set(room.id, handle);
}

function advanceTurn(room: Room): void {
  // Always: clear the prior timer, reset per-turn flags, advance the
  // index, restart the timer, and broadcast — in that order. The new
  // `turnEndsAt` is set inside startTurnTimer so it must run *before*
  // broadcastGameState or non-active players never see the fresh
  // countdown.
  stopTurnTimer(room);
  room.hasDrawn = false;
  room.mustUseTileId = null;
  room.lastRupere = null;
  // pendingRupereBonusCards should always be empty here (advanceTurn
  // only fires after a valid discard, which the must-use rule blocks
  // until the target is melded). Belt-and-braces: clear it.
  room.pendingRupereBonusCards = [];
  if (room.currentTurn) {
    const idx = room.players.findIndex((p) => p.socketId === room.currentTurn);
    if (idx < 0) {
      room.currentTurn = room.players[0]?.socketId ?? null;
    } else {
      const next = (idx + 1) % room.players.length;
      room.currentTurn = room.players[next].socketId;
    }
  }
  startTurnTimer(room);
  broadcastGameState(room);
}

function runAutoPass(room: Room): void {
  if (!room.currentTurn) return;
  const player = room.players.find((p) => p.socketId === room.currentTurn);
  if (!player) return;
  console.log(
    `Auto-pass: ${player.name} (${player.socketId}) timed out in ${room.id}`,
  );
  // If a Rupere is pending and the target hasn't been melded, return
  // the entire picked stack to the discard pile so the auto-pass
  // doesn't strand bonuses or break must-use bookkeeping.
  if (room.lastRupere && room.lastRupere.playerId === player.socketId) {
    const targetId = room.lastRupere.tiles[0]?.id;
    if (targetId && player.hand.some((t) => t.id === targetId)) {
      removeTileFromHand(player, targetId);
      room.discardPile.splice(
        room.lastRupere.pickIdx,
        0,
        ...room.lastRupere.tiles,
      );
      room.pendingRupereBonusCards = [];
      room.mustUseTileId = null;
      room.lastRupere = null;
    }
  }
  if (!room.hasDrawn && room.drawPile.length > 0) {
    const tile = room.drawPile.shift()!;
    addTileWithSlot(player, tile);
    room.hasDrawn = true;
  }
  if (player.hand.length === 0) {
    advanceTurn(room);
    maybeScheduleBotTurn(room);
    return;
  }
  // Auto-discard the LAST tile in the hand (most recently drawn).
  const tile = player.hand.pop()!;
  delete player.handLayout[tile.id];
  room.discardPile.push(tile);
  room.recorder?.record("auto_pass", room, {
    actor: player.sessionId,
    meta: { tileId: tile.id },
  });
  if (player.hand.length === 0) {
    finalizeRound(room, player.socketId, tile);
    return;
  }
  advanceTurn(room);
  maybeScheduleBotTurn(room);
}

function finalizeRound(room: Room, winnerId: string, closingTile: Tile): void {
  const scoreMap = calculateFinalScores(room.players, winnerId, closingTile);
  const scoresByName: Record<string, number> = {};
  const globalScoresByName: Record<string, number> = {};
  const finalScoresBySession: Record<string, number> = {};
  const globalScoresBySession: Record<string, number> = {};
  const winner = room.players.find((p) => p.socketId === winnerId);
  for (const p of room.players) {
    const round = scoreMap[p.socketId] ?? 0;
    scoresByName[p.name] = round;
    finalScoresBySession[p.sessionId] = round;
    // Continuous leaderboard: persist round delta into the session's
    // running global score. Bots accumulate too (so the leaderboard
    // makes sense even when a human is playing solo against Ramis).
    const sess = getSession(p.sessionId);
    if (sess) sess.globalScore += round;
    globalScoresByName[p.name] = sess?.globalScore ?? round;
    globalScoresBySession[p.sessionId] = sess?.globalScore ?? round;
  }

  // === Syndicate Reputation Ledger update — True-Human standard (v2.8.1) ===
  //
  // Bots are NEUTRAL OBSTACLES. They neither give nor take ELO; they
  // can win the round, but their presence is invisible to the rating
  // engine. Pairwise deltas are computed only across the STARTING
  // human roster (frozen at deal time, see captureStartingRoster).
  // That means:
  //   - Solo human vs bots         -> no opponents, all deltas = 0.
  //   - Mixed table (humans+bots)  -> humans calculate among
  //                                   themselves only; bots stay at
  //                                   eloAfter = 1200, eloAffected = false.
  //   - All humans                 -> standard pairwise across the
  //                                   table.
  //
  // Mid-round disconnect handling: a human evicted between deal and
  // finalize is still in startingHumans (snapshot is frozen). Their
  // score for ELO purposes = scoreMap entry if still seated, else
  // -100 forfeit (mirroring the no-meld penalty in the round itself).
  const startingHumans = room.recorder?.startingHumans ?? [];
  const eloSeats: EloSeat[] = startingHumans.map((h) => {
    const stillSeated = room.players.find((p) => p.sessionId === h.sessionId);
    const score = stillSeated ? (scoreMap[stillSeated.socketId] ?? 0) : -100;
    return {
      signatureId: h.signatureId,
      rating: h.startRating,
      isBot: false,
      score,
    };
  });
  const deltaBySig = computeEloDeltas(eloSeats);
  const eloCalculated = startingHumans.length >= 2;
  // Apply deltas to the ledger for every starting human (even ones
  // who disconnected — their forfeit-penalty score still costs them).
  if (eloCalculated) {
    for (const seat of eloSeats) {
      const delta = deltaBySig.get(seat.signatureId) ?? 0;
      eloLedger.applyDelta(seat.signatureId, delta);
    }
  }
  // Determine match type from the starting roster (NOT the finalize
  // roster — a bot could have been auto-removed mid-round).
  const startingHadBots =
    room.recorder?.startingPlayers.some((p) => p.isBot) ?? false;
  const matchType: "ranked" | "social" = startingHadBots ? "social" : "ranked";
  // Build broadcast records keyed by sessionId for everyone currently
  // in the room (departed humans aren't subscribed anyway).
  const eloDeltasBySession: Record<string, number> = {};
  const eloAfterBySession: Record<string, number> = {};
  const eloAffectedBySession: Record<string, boolean> = {};
  for (const p of room.players) {
    if (p.isBot || !p.signatureId) {
      eloDeltasBySession[p.sessionId] = 0;
      eloAfterBySession[p.sessionId] = 1200;
      eloAffectedBySession[p.sessionId] = false;
      continue;
    }
    const wasStarting = startingHumans.some(
      (h) => h.sessionId === p.sessionId,
    );
    if (eloCalculated && wasStarting) {
      const delta = deltaBySig.get(p.signatureId) ?? 0;
      eloDeltasBySession[p.sessionId] = delta;
      eloAfterBySession[p.sessionId] = eloLedger.get(p.signatureId).eloScore;
      eloAffectedBySession[p.sessionId] = true;
    } else {
      eloDeltasBySession[p.sessionId] = 0;
      eloAfterBySession[p.sessionId] = eloLedger.get(p.signatureId).eloScore;
      eloAffectedBySession[p.sessionId] = false;
    }
  }
  stopTurnTimer(room);
  room.gameStarted = false;
  room.currentTurn = null;
  room.phase = "scoreboard";
  room.scoreboardEndsAt = Date.now() + SCOREBOARD_DURATION_MS;
  console.log(
    `Game over in ${room.id}: winner=${winner?.name} closing=${closingTile.isJoker ? "JOKER" : closingTile.value} scores=${JSON.stringify(scoresByName)} totals=${JSON.stringify(globalScoresByName)}`,
  );
  io.to(room.id).emit("game_over", {
    winnerName: winner?.name ?? "?",
    scores: scoresByName,
    globalScores: globalScoresByName,
    closingTile,
    nextDealAt: room.scoreboardEndsAt,
    eloDeltas: eloDeltasBySession,
    eloAfter: eloAfterBySession,
    eloAffected: eloAffectedBySession,
    matchType,
  });
  // Seal the match tape (recorder spans scramble + round) and ship
  // it to clients as a separate event so the After-Action Report
  // can render without the GameOverModal blocking on it.
  if (room.recorder && winner) {
    room.recorder.record("finalize", room, {
      actor: winner.sessionId,
      meta: { closingTile },
      roundScores: finalScoresBySession,
    });
    const tape = room.recorder.finalize(
      room,
      winner.sessionId,
      closingTile,
      finalScoresBySession,
      globalScoresBySession,
    );
    // Decorate the tape with ELO deltas so the AAR can render them
    // without a second round-trip to the server.
    tape.eloDeltas = eloDeltasBySession;
    tape.eloAfter = eloAfterBySession;
    tape.eloAffected = eloAffectedBySession;
    tape.matchType = matchType;
    io.to(room.id).emit("match_tape", tape);
  }
  // Free the recorder so its events array doesn't linger between
  // rounds. A new recorder is created at the next beginScramble.
  room.recorder = null;
  broadcastGameState(room);

  // 45-second pause, then auto-deal a fresh round. The pause can be
  // short-circuited by every connected human clicking "Ready for Next
  // Round" — see endIntermission().
  room.readyForNext.clear();
  const prior = scoreboardTimers.get(room.id);
  if (prior) clearTimeout(prior);
  const handle = setTimeout(() => {
    scoreboardTimers.delete(room.id);
    endIntermission(room);
  }, SCOREBOARD_DURATION_MS);
  scoreboardTimers.set(room.id, handle);
}

/**
 * Tear down the scoreboard phase and either start the next round
 * (via the scramble pipeline) or drop the room back to lobby if it's
 * been thinned out. Safe to call from either the timeout or the
 * "everyone is ready" early-out.
 */
function endIntermission(room: Room): void {
  if (!rooms.has(room.id)) return;
  if (room.phase !== "scoreboard") return;
  const prior = scoreboardTimers.get(room.id);
  if (prior) {
    clearTimeout(prior);
    scoreboardTimers.delete(room.id);
  }
  if (room.players.length < 2) {
    // Not enough seats to start a round — drop back to lobby and let
    // the host re-press Start when more players arrive.
    room.phase = "lobby";
    room.scoreboardEndsAt = null;
    room.readyForNext.clear();
    broadcastRoomUpdate(room);
    broadcastGameState(room);
    return;
  }
  // Run the next round through the scramble phase too, so every deal
  // — first or Nth — gets the same pre-game tactile shuffle.
  room.scoreboardEndsAt = null;
  beginScramble(room);
}

// =====================================================================
//  Bot scheduling
// =====================================================================

/**
 * If the active player has just satisfied a Rupere obligation (the
 * target tile is no longer in their hand), drop the staged bonus
 * tiles into their hand and clear the obligation.
 *
 * Returns true if a redemption happened, so callers can know to send
 * a fresh broadcast.
 */
function maybeRedeemRupereBonus(room: Room, player: Player): boolean {
  if (!room.mustUseTileId) return false;
  if (player.hand.some((t) => t.id === room.mustUseTileId)) return false;
  // Target left the hand — it's now on the board. Deliver the bonus.
  if (room.pendingRupereBonusCards.length > 0) {
    console.log(
      `Rupere bonus delivered to ${player.name}: ${room.pendingRupereBonusCards.length} tile(s) [${room.pendingRupereBonusCards.map((t) => t.id).join(", ")}]`,
    );
    for (const bonusTile of room.pendingRupereBonusCards) {
      addTileWithSlot(player, bonusTile);
    }
    room.pendingRupereBonusCards = [];
  }
  room.mustUseTileId = null;
  room.lastRupere = null;
  return true;
}

function maybeScheduleBotTurn(room: Room): void {
  if (!room.gameStarted || !room.currentTurn) return;
  const player = room.players.find((p) => p.socketId === room.currentTurn);
  if (!player || !player.isBot) return;
  const botSocketId = player.socketId;
  const delay = 2_000 + Math.floor(Math.random() * 1_000);
  setTimeout(() => {
    if (!room.gameStarted || room.currentTurn !== botSocketId) return;
    runBotTurn(room, player);
  }, delay);
}

/**
 * Safe-move fallback when the bot's normal logic throws or bails.
 * Pure draw + discard (last tile in hand) + advance — never tries
 * Rupere or anything fancy. Keeps the game flowing no matter what.
 */
function botSafeMove(room: Room, bot: Player): void {
  if (!room.gameStarted) return;
  if (!room.hasDrawn && room.drawPile.length > 0) {
    bot.hand.push(room.drawPile.shift()!);
    room.hasDrawn = true;
  }
  if (bot.hand.length === 0) {
    advanceTurn(room);
    maybeScheduleBotTurn(room);
    return;
  }
  const tile = bot.hand.pop()!;
  room.discardPile.push(tile);
  if (bot.hand.length === 0) {
    finalizeRound(room, bot.socketId, tile);
    return;
  }
  advanceTurn(room);
  maybeScheduleBotTurn(room);
}

function runBotTurn(room: Room, bot: Player): void {
  try {
    runBotTurnInner(room, bot);
  } catch (err) {
    console.error(
      `Bot ${bot.name} threw during turn — falling back to safe move:`,
      err,
    );
    botSafeMove(room, bot);
  }
}

function runBotTurnInner(room: Room, bot: Player): void {
  if (!room.gameStarted) return;

  // Bots only ever draw from the main deck — never the discard pile.
  // The Rupere flow has too many staged-state edge cases that the
  // greedy heuristic isn't equipped to handle, and a misfire would
  // freeze the game on the must-use rule.
  if (!room.hasDrawn && room.drawPile.length > 0) {
    bot.hand.push(room.drawPile.shift()!);
    room.hasDrawn = true;
  }

  if (!bot.hasMeldedInitial) {
    const melds = tryEtalare(bot.hand);
    if (melds) {
      const used = new Set(melds.flat().map((t) => t.id));
      bot.hand = bot.hand.filter((t) => !used.has(t.id));
      (room.board[bot.socketId] ??= []).push(...melds);
      bot.hasMeldedInitial = true;
      for (const m of melds) bot.meldedScore += scoreMeldFinal(m);
      console.log(`Bot ${bot.name} performed Etalare (${melds.length} melds)`);
    }
  } else {
    const melds = tryNewMelds(bot.hand);
    if (melds.length > 0) {
      const used = new Set(melds.flat().map((t) => t.id));
      bot.hand = bot.hand.filter((t) => !used.has(t.id));
      (room.board[bot.socketId] ??= []).push(...melds);
      for (const m of melds) bot.meldedScore += scoreMeldFinal(m);
      console.log(`Bot ${bot.name} played ${melds.length} new meld(s)`);
    }
  }

  if (bot.hasMeldedInitial) {
    for (let i = 0; i < 8; i++) {
      const att = findAttachment(bot.hand, room.board);
      if (!att) break;
      const zone = room.board[att.ownerId];
      const meld = zone[att.meldIndex];
      const oldS = scoreMeldFinal(meld);
      const newS = scoreMeldFinal(att.chosen);
      bot.hand = bot.hand.filter((t) => t.id !== att.tile.id);
      zone[att.meldIndex] = att.chosen;
      bot.meldedScore += newS - oldS;
    }
  }

  if (bot.hand.length === 0) {
    advanceTurn(room);
    maybeScheduleBotTurn(room);
    return;
  }
  const tile = pickDiscard(bot.hand);
  bot.hand = bot.hand.filter((t) => t.id !== tile.id);
  room.discardPile.push(tile);
  if (bot.hand.length === 0) {
    finalizeRound(room, bot.socketId, tile);
    return;
  }
  advanceTurn(room);
  maybeScheduleBotTurn(room);
}

// =====================================================================
//  Connection handler
// =====================================================================

io.on("connection", (socket: Socket) => {
  const session = (socket.data as { session: Session }).session;
  console.log(
    `User connected: socket=${socket.id} session=${session.sessionId}`,
  );

  // Tell the client which sessionId it should persist. New clients store
  // this in localStorage so future reconnects can reclaim the session.
  socket.emit("session_handshake", { sessionId: session.sessionId });

  // If this session was already seated in a room (i.e. they're
  // reconnecting), rebind their Player record to the new socket.id and
  // bring the rest of the system back into alignment.
  const existingRoom = findRoomBySession(session.sessionId);
  if (existingRoom) {
    const player = existingRoom.players.find(
      (p) => p.sessionId === session.sessionId,
    );
    if (player) {
      // Migrate state keyed by the old socketId.
      const oldSocketId = player.socketId;
      if (oldSocketId !== socket.id) {
        if (existingRoom.board[oldSocketId] !== undefined) {
          existingRoom.board[socket.id] = existingRoom.board[oldSocketId];
          delete existingRoom.board[oldSocketId];
        }
        if (existingRoom.currentTurn === oldSocketId) {
          existingRoom.currentTurn = socket.id;
        }
        socketToRoom.delete(oldSocketId);
      }
      player.socketId = socket.id;
      socket.join(existingRoom.id);
      socketToRoom.set(socket.id, existingRoom.id);
      // Came back inside the 60-second grace window — clear the eviction
      // timer and let the rest of the room know they're live again.
      markActive(session);
      io.to(existingRoom.id).emit("player_status_change", {
        sessionId: session.sessionId,
        status: "active",
      });
      console.log(
        `Session ${session.sessionId} rebound to room ${existingRoom.id} (socket ${socket.id})`,
      );
      socket.emit("room_joined", { code: existingRoom.id });
      socket.emit(
        "game_state_update",
        viewForSocket(existingRoom, socket.id),
      );
      broadcastRoomUpdate(existingRoom);
    }
  }

  function nextColorIndex(room: Room): number {
    // Pick the lowest unused 0..3 slot so colors stay stable as players
    // come and go.
    const used = new Set(room.players.map((p) => p.colorIndex));
    for (let i = 0; i < 4; i++) if (!used.has(i)) return i;
    return room.players.length % 4;
  }

  function attachToRoom(room: Room, name: string): void {
    session.playerName = name;
    if (session.signatureId && name) {
      // Keep the ledger alias in sync with the in-game display name
      // — joining a room is the natural moment to commit that.
      session.alias = name;
      eloLedger.upsert(session.signatureId, name);
    }
    room.players.push({
      sessionId: session.sessionId,
      signatureId: session.signatureId,
      socketId: socket.id,
      name,
      hand: [],
      hasMeldedInitial: false,
      meldedScore: 0,
      isBot: false,
      colorIndex: nextColorIndex(room),
      bonusPoints: 0,
      handLayout: {},
    });
    socket.join(room.id);
    socketToRoom.set(socket.id, room.id);
  }

  socket.on("create_room", (payload: { name?: string } = {}) => {
    const name = payload.name?.trim() || "Player";
    const code = generateRoomCode();
    const room = createRoom(code);
    rooms.set(code, room);
    attachToRoom(room, name);
    console.log(`Room ${code} created by ${name} (${socket.id})`);
    socket.emit("room_created", { code });
    broadcastRoomUpdate(room);
  });

  socket.on(
    "join_room",
    (payload: { code?: string; name?: string } = {}) => {
      const rawCode = (payload.code ?? "").trim().toUpperCase();
      const requestedName = payload.name?.trim() || "(anon)";
      console.log(
        `Server: Join request for room ${rawCode} from ${requestedName}`,
      );
      if (rawCode.length !== 4) {
        socket.emit("join_error", { reason: "bad_code" });
        return;
      }
      const room = rooms.get(rawCode);
      if (!room) {
        console.log(`  -> rejected: no such room ${rawCode}`);
        socket.emit("join_error", { reason: "no_such_room" });
        return;
      }
      if (room.players.some((p) => p.socketId === socket.id)) {
        socket.emit("join_error", { reason: "already_joined" });
        return;
      }
      if (room.players.length >= MAX_PLAYERS) {
        socket.emit("join_error", { reason: "room_full" });
        return;
      }
      if (room.gameStarted) {
        socket.emit("join_error", { reason: "game_in_progress" });
        return;
      }
      const name = payload.name?.trim() || `Player ${room.players.length + 1}`;
      attachToRoom(room, name);
      console.log(`${name} (${socket.id}) joined room ${room.id}`);
      socket.emit("room_joined", { code: room.id });
      broadcastRoomUpdate(room);
    },
  );

  socket.on("add_bot", () => {
    const room = getRoom(socket.id);
    if (!room) return;
    if (room.gameStarted) {
      socket.emit("join_error", { reason: "game_in_progress" });
      return;
    }
    if (room.players.length >= MAX_PLAYERS) {
      socket.emit("join_error", { reason: "room_full" });
      return;
    }
    const botCount = room.players.filter((p) => p.isBot).length;
    const botSocketId = `bot-${room.id}-${Date.now()}-${botCount + 1}`;
    const botName = `Rami ${botCount + 1}`;
    const botSession = createBotSession(botName);
    const used = new Set(room.players.map((p) => p.colorIndex));
    let colorIndex = 0;
    for (let i = 0; i < 4; i++) {
      if (!used.has(i)) {
        colorIndex = i;
        break;
      }
    }
    room.players.push({
      sessionId: botSession.sessionId,
      signatureId: null, // bots are not part of the persistent ledger
      socketId: botSocketId,
      name: botName,
      hand: [],
      hasMeldedInitial: false,
      meldedScore: 0,
      isBot: true,
      colorIndex,
      bonusPoints: 0,
      handLayout: {},
    });
    console.log(`Bot added to ${room.id}: ${botSocketId}`);
    broadcastRoomUpdate(room);
  });

  socket.on("start_game", () => {
    const room = getRoom(socket.id);
    if (!room) return;
    if (room.gameStarted || room.phase === "scrambling") {
      socket.emit("start_error", { reason: "already_started" });
      return;
    }
    if (room.players.length < 2) {
      socket.emit("start_error", { reason: "need_more_players" });
      return;
    }
    beginScramble(room);
  });

  socket.on("restart_game", () => {
    const room = getRoom(socket.id);
    if (!room) return;
    if (room.gameStarted || room.phase === "scrambling") return;
    if (room.players.length < 2) {
      socket.emit("start_error", { reason: "need_more_players" });
      return;
    }
    beginScramble(room);
  });

  // === Tactical Spatial Rack (v2.9) — slot manipulation events ===
  // place_tile_at_slot drives the drag/drop / shift / swap behavior.
  // sort_hand resets to a clean top-row arrangement by mode.
  socket.on(
    "place_tile_at_slot",
    (payload: { tileId?: string; targetSlot?: number }) => {
      const room = getActiveRoom(socket.id);
      if (!room) return;
      const player = room.players.find((p) => p.socketId === socket.id);
      if (!player) return;
      const tileId = String(payload?.tileId ?? "");
      const targetSlot = Number(payload?.targetSlot);
      if (!tileId || !Number.isFinite(targetSlot)) return;
      // Defensive reconcile so any orphaned entries are cleaned up
      // before we mutate. Cheap (O(handSize)).
      reconcileHandLayout(player);
      const ok = placeTileAtSlot(player, tileId, Math.floor(targetSlot));
      if (!ok) {
        socket.emit("action_error", { reason: "invalid_slot_move" });
        return;
      }
      reconcileHandLayout(player);
      // Only the moving player needs the layout update — opponents
      // don't see the rack. But broadcastGameState is the cheap
      // path that's already wired up.
      broadcastGameState(room);
    },
  );

  socket.on("sort_hand", (payload: { mode?: string }) => {
    const room = getActiveRoom(socket.id);
    if (!room) return;
    const player = room.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    const mode = payload?.mode === "runs" ? "runs" : "groups";
    sortHand(player, mode as HandSortMode);
    broadcastGameState(room);
  });

  // Ready-up override during the 45-second scoreboard intermission.
  // The deal fires early the moment every connected, non-bot session
  // has clicked the button.
  socket.on("ready_up", () => {
    const room = getRoom(socket.id);
    if (!room || room.phase !== "scoreboard") return;
    const sessionForSocket = (socket.data as { session: Session }).session;
    if (!room.players.some((p) => p.sessionId === sessionForSocket.sessionId)) {
      return;
    }
    room.readyForNext.add(sessionForSocket.sessionId);
    const requiredHumans = room.players.filter(
      (p) => !p.isBot && getSession(p.sessionId)?.connectionStatus === "active",
    );
    const everyoneReady =
      requiredHumans.length > 0 &&
      requiredHumans.every((p) => room.readyForNext.has(p.sessionId));
    broadcastGameState(room);
    if (everyoneReady) {
      console.log(
        `Intermission short-circuit in ${room.id}: all ${requiredHumans.length} humans ready`,
      );
      endIntermission(room);
    }
  });

  // Manual abandon — the client clicked "Exit Terminal" on the sidebar.
  // Bypass the 60-second ghost-protocol grace and evict immediately
  // so the rest of the table sees them gone right away. Listens on
  // both event names; player_leave is the v2026 standard, player_quit
  // is kept for any cached client during the rollover.
  const handleVoluntaryLeave = () => {
    const sessionForSocket = (socket.data as { session: Session }).session;
    if (!sessionForSocket) return;
    console.log(
      `Voluntary leave: session=${sessionForSocket.sessionId} socket=${socket.id}`,
    );
    markActive(sessionForSocket);
    evictSession(sessionForSocket.sessionId);
    socketToRoom.delete(socket.id);
  };
  socket.on("player_leave", handleVoluntaryLeave);
  socket.on("player_quit", handleVoluntaryLeave);

  // Cursor relay for the scramble phase. The server is fan-out only;
  // it doesn't validate or store positions. Throttling is the client's
  // job (~30Hz). We tag every broadcast with the sender's sessionId so
  // peers can render stable per-player ghost cursors.
  socket.on("cursor_move", (payload: { x: number; y: number }) => {
    const room = getRoom(socket.id);
    if (!room || room.phase !== "scrambling") return;
    const session = (socket.data as { session: Session }).session;
    socket.to(room.id).emit("peer_cursor", {
      sessionId: session.sessionId,
      x: payload.x,
      y: payload.y,
    });
  });

  // Hype meter — clients drip throttled velocity readings. The 100ms
  // ticker (startHypeTicker) drains the pooled velocity into a
  // shared hypeLevel and broadcasts it to the room.
  socket.on("scramble_velocity", (payload: { velocity: number }) => {
    const room = getRoom(socket.id);
    if (!room || room.phase !== "scrambling") return;
    const v = Number(payload?.velocity);
    if (!Number.isFinite(v) || v <= 0) return;
    const capped = Math.min(v, HYPE_INPUT_CAP);
    room.hypePool += capped;
    // Per-player hype credit feeds the "Most Active Washer" stat in
    // the After-Action Report.
    const session = (socket.data as { session: Session }).session;
    room.recorder?.addHype(session.sessionId, capped);
  });

  socket.on("draw_tile", () => {
    const room = getActiveRoom(socket.id);
    if (!room) return;
    if (socket.id !== room.currentTurn) {
      socket.emit("action_error", { reason: "not_your_turn" });
      return;
    }
    if (room.hasDrawn) {
      socket.emit("action_error", { reason: "already_drawn" });
      return;
    }
    if (room.drawPile.length === 0) {
      socket.emit("action_error", { reason: "draw_pile_empty" });
      return;
    }
    const player = room.players.find((p) => p.socketId === socket.id)!;
    const drawn = room.drawPile.shift()!;
    addTileWithSlot(player, drawn);
    room.hasDrawn = true;
    room.recorder?.record("draw", room, {
      actor: player.sessionId,
      meta: { tileId: drawn.id, source: "deck" },
    });
    broadcastGameState(room);
  });

  socket.on("draw_discard", () => {
    const room = getActiveRoom(socket.id);
    if (!room) return;
    if (socket.id !== room.currentTurn) {
      socket.emit("action_error", { reason: "not_your_turn" });
      return;
    }
    if (room.hasDrawn) {
      socket.emit("action_error", { reason: "already_drawn" });
      return;
    }
    if (room.discardPile.length === 0) {
      socket.emit("action_error", { reason: "discard_pile_empty" });
      return;
    }
    const player = room.players.find((p) => p.socketId === socket.id)!;
    const taken = room.discardPile.pop()!;
    addTileWithSlot(player, taken);
    room.hasDrawn = true;
    room.recorder?.record("draw", room, {
      actor: player.sessionId,
      meta: { tileId: taken.id, source: "discard" },
    });
    broadcastGameState(room);
  });

  socket.on("discard_tile", (tileId: string) => {
    const room = getActiveRoom(socket.id);
    if (!room) return;
    if (socket.id !== room.currentTurn) {
      socket.emit("action_error", { reason: "not_your_turn" });
      return;
    }
    if (!room.hasDrawn) {
      socket.emit("action_error", { reason: "must_draw_first" });
      return;
    }
    const player = room.players.find((p) => p.socketId === socket.id)!;
    // Rupere "must-use" rule: if a tile was broken from the discard
    // pile this turn, it must be on the board before the turn ends.
    if (
      room.mustUseTileId &&
      player.hand.some((t) => t.id === room.mustUseTileId)
    ) {
      socket.emit(
        "invalid_move",
        "You must play the Rupere tile on the board before discarding.",
      );
      io.to(socket.id).emit("game_state_update", viewForSocket(room, socket.id));
      return;
    }
    const idx = player.hand.findIndex((t) => t.id === tileId);
    if (idx < 0) {
      socket.emit("action_error", { reason: "tile_not_in_hand" });
      return;
    }
    const [tile] = player.hand.splice(idx, 1);
    delete player.handLayout[tile.id];
    room.discardPile.push(tile);
    room.recorder?.record("discard", room, {
      actor: player.sessionId,
      meta: { tileId: tile.id },
    });
    if (player.hand.length === 0) {
      finalizeRound(room, socket.id, tile);
      return;
    }
    advanceTurn(room);
    maybeScheduleBotTurn(room);
  });

  socket.on("submit_etalare", (proposedMelds: Tile[][]) => {
    const room = getActiveRoom(socket.id);
    if (!room) return;
    if (socket.id !== room.currentTurn) return;
    const player = room.players.find((p) => p.socketId === socket.id)!;
    const sendInvalid = (msg: string) => {
      socket.emit("invalid_move", msg);
      io.to(socket.id).emit("game_state_update", viewForSocket(room, socket.id));
    };
    if (!Array.isArray(proposedMelds) || proposedMelds.length === 0) {
      sendInvalid("Invalid Etalare. No melds submitted.");
      return;
    }
    const handIds = new Set(player.hand.map((t) => t.id));
    const seen = new Set<string>();
    for (const meld of proposedMelds) {
      if (!Array.isArray(meld)) {
        sendInvalid("Invalid Etalare. Malformed meld.");
        return;
      }
      for (const tile of meld) {
        if (!tile || typeof tile.id !== "string" || !handIds.has(tile.id)) {
          sendInvalid("Invalid Etalare. Tile not in your hand.");
          return;
        }
        if (seen.has(tile.id)) {
          sendInvalid("Invalid Etalare. Duplicate tile.");
          return;
        }
        seen.add(tile.id);
      }
    }
    if (!canInitialMeld(proposedMelds)) {
      sendInvalid("Invalid Etalare. Must be >= 45 points and include a Suita.");
      return;
    }
    // If a Rupere is pending, the Etalare must include the broken tile —
    // otherwise the player would dodge the must-use rule by melding the
    // 45-pt threshold from other tiles and stranding the rupere'd one.
    if (room.mustUseTileId && !seen.has(room.mustUseTileId)) {
      sendInvalid(
        "Your Etalare must include the tile you picked from the discard pile.",
      );
      return;
    }
    removeTilesFromHand(player, seen);
    (room.board[socket.id] ??= []).push(...proposedMelds);
    player.hasMeldedInitial = true;
    let pointsAdded = 0;
    for (const meld of proposedMelds) {
      const pts = scoreMeldFinal(meld);
      player.meldedScore += pts;
      pointsAdded += pts;
    }
    maybeRedeemRupereBonus(room, player);
    room.recorder?.record("etalare", room, {
      actor: player.sessionId,
      meta: { tilesPlaced: seen.size, pointsAdded, meldCount: proposedMelds.length },
    });
    socket.emit("etalare_success");
    broadcastGameState(room);
  });

  socket.on("play_new_meld", (proposedMelds: Tile[][]) => {
    const room = getActiveRoom(socket.id);
    if (!room) return;
    if (socket.id !== room.currentTurn) return;
    const player = room.players.find((p) => p.socketId === socket.id)!;
    const sendInvalid = (msg: string) => {
      socket.emit("invalid_move", msg);
      io.to(socket.id).emit("game_state_update", viewForSocket(room, socket.id));
    };
    if (!player.hasMeldedInitial) {
      sendInvalid("You must complete Etalare before playing new melds.");
      return;
    }
    if (!Array.isArray(proposedMelds) || proposedMelds.length === 0) {
      sendInvalid("No new melds submitted.");
      return;
    }
    const handIds = new Set(player.hand.map((t) => t.id));
    const seen = new Set<string>();
    for (const meld of proposedMelds) {
      if (!Array.isArray(meld)) {
        sendInvalid("Malformed meld.");
        return;
      }
      for (const tile of meld) {
        if (!tile || typeof tile.id !== "string" || !handIds.has(tile.id)) {
          sendInvalid("Tile not in your hand.");
          return;
        }
        if (seen.has(tile.id)) {
          sendInvalid("Duplicate tile.");
          return;
        }
        seen.add(tile.id);
      }
      if (!isValidSuita(meld) && !isValidFormatie(meld)) {
        sendInvalid("Each meld must be a valid Suita or Formatie.");
        return;
      }
    }
    removeTilesFromHand(player, seen);
    (room.board[socket.id] ??= []).push(...proposedMelds);
    let pointsAdded = 0;
    for (const meld of proposedMelds) {
      const pts = scoreMeldFinal(meld);
      player.meldedScore += pts;
      pointsAdded += pts;
    }
    maybeRedeemRupereBonus(room, player);
    room.recorder?.record("play_meld", room, {
      actor: player.sessionId,
      meta: { tilesPlaced: seen.size, pointsAdded, meldCount: proposedMelds.length },
    });
    broadcastGameState(room);
  });

  socket.on(
    "attach_tile",
    (
      payload: {
        tileId: string;
        meldIndex: number;
        targetPlayerId: string;
      },
    ) => {
      const { tileId, meldIndex, targetPlayerId } = payload;
      const room = getActiveRoom(socket.id);
      if (!room) return;
      if (socket.id !== room.currentTurn) return;
      const player = room.players.find((p) => p.socketId === socket.id)!;
      const sendInvalid = (msg: string) => {
        socket.emit("invalid_move", msg);
        io.to(socket.id).emit(
          "game_state_update",
          viewForSocket(room, socket.id),
        );
      };
      if (!player.hasMeldedInitial) {
        sendInvalid("You must complete Etalare before attaching tiles.");
        return;
      }
      const targetZone = room.board[targetPlayerId];
      if (
        !targetZone ||
        typeof meldIndex !== "number" ||
        meldIndex < 0 ||
        meldIndex >= targetZone.length
      ) {
        sendInvalid("Invalid meld target.");
        return;
      }
      const tileIdx = player.hand.findIndex((t) => t.id === tileId);
      if (tileIdx < 0) {
        sendInvalid("Tile not in your hand.");
        return;
      }
      const tile = player.hand[tileIdx];
      const meld = targetZone[meldIndex];
      const tryAppend: Tile[] = [...meld, tile];
      const tryPrepend: Tile[] = [tile, ...meld];
      let chosen: Tile[] | null = null;
      if (isValidSuita(tryAppend) || isValidFormatie(tryAppend)) {
        chosen = tryAppend;
      } else if (isValidSuita(tryPrepend) || isValidFormatie(tryPrepend)) {
        chosen = tryPrepend;
      }
      if (!chosen) {
        sendInvalid("That tile cannot attach to that meld.");
        return;
      }
      const oldS = scoreMeldFinal(meld);
      const newS = scoreMeldFinal(chosen);
      player.hand.splice(tileIdx, 1);
      delete player.handLayout[tile.id];
      targetZone[meldIndex] = chosen;
      const delta = newS - oldS;
      player.meldedScore += delta;
      maybeRedeemRupereBonus(room, player);
      room.recorder?.record("attach", room, {
        actor: player.sessionId,
        meta: { tileId, pointsAdded: delta, target: targetPlayerId },
      });
      broadcastGameState(room);
    },
  );

  socket.on("rupere_tile", ({ tileId }: { tileId: string }) => {
    const room = getActiveRoom(socket.id);
    if (!room) return;
    if (socket.id !== room.currentTurn) {
      socket.emit("action_error", { reason: "not_your_turn" });
      return;
    }
    if (room.hasDrawn) {
      // The starter's first turn arrives with hasDrawn=true (they were
      // dealt 15 tiles and must meld or discard). This guard also
      // covers the normal "you've already drawn this turn" case.
      socket.emit("action_error", { reason: "cannot_rupere_now" });
      return;
    }
    // Per the spec, the *only* universal pile-position rule is the
    // First-Discard Ban (room.firstDiscardTileId, enforced below). No
    // length-based round-1 lockout — pre-Etalare players are gated by
    // the "must form a valid Etalare with the picked tile" check, and
    // post-Etalare players can freely Rupere.
    const player = room.players.find((p) => p.socketId === socket.id)!;
    const pickIdx = room.discardPile.findIndex((t) => t.id === tileId);
    if (pickIdx < 0) {
      socket.emit("action_error", { reason: "tile_not_in_discard" });
      return;
    }
    const lastIdx = room.discardPile.length - 1;
    const targetTile = room.discardPile[pickIdx];

    const sendInvalid = (msg: string) => {
      socket.emit("invalid_move", msg);
      io.to(socket.id).emit("game_state_update", viewForSocket(room, socket.id));
    };

    // First-Discard Ban: the seeded discard tile can never be Rupered.
    if (
      room.firstDiscardTileId &&
      targetTile.id === room.firstDiscardTileId
    ) {
      sendInvalid("Cannot pick the first discarded card.");
      return;
    }

    if (!player.hasMeldedInitial) {
      // Rule A: must be the most recently discarded tile.
      if (pickIdx !== lastIdx) {
        sendInvalid(
          "Before Etalare you may only Rupere the most recent discard.",
        );
        return;
      }
      // And: hand + that tile must permit a valid Etalare *that
      // actually uses the rupered tile*. A pick that just sits in the
      // hand while other tiles assemble the 45 is not a legal Rupere
      // for a pre-Etalare player.
      const candidate = [...player.hand, room.discardPile[pickIdx]];
      const plan = tryEtalare(candidate);
      if (!plan) {
        sendInvalid(
          "That Rupere does not enable a valid Etalare (>=45 with a Suita).",
        );
        return;
      }
      const usesRupered = plan.some((meld) => meld.some((t) => t.id === tileId));
      if (!usesRupered) {
        sendInvalid(
          "The Rupere tile must itself be part of your Etalare melds.",
        );
        return;
      }
    }
    // Rule B (post-Etalare): any tile is fair game.

    // Splice(pickIdx) lifts the target + every tile after it. Per the
    // staged-Rupere protocol the player only *receives* the target
    // immediately. The rest is held until they actually meld the
    // target — anti-cheat against grabbing a fat pile and stalling.
    const takenTiles = room.discardPile.splice(pickIdx);
    const [received, ...bonus] = takenTiles;
    addTileWithSlot(player, received);
    room.pendingRupereBonusCards = bonus;
    room.hasDrawn = true;
    room.mustUseTileId = tileId;
    room.lastRupere = {
      tiles: takenTiles.slice(),
      pickIdx,
      playerId: socket.id,
    };
    console.log(
      `Rupere in ${room.id}: ${player.name} took target ${tileId}, ${bonus.length} tile(s) staged [${bonus.map((t) => t.id).join(", ")}]`,
    );
    room.recorder?.record("rupere", room, {
      actor: player.sessionId,
      meta: { tileId, takenCount: takenTiles.length },
    });
    broadcastGameState(room);
  });

  socket.on("undo_rupere", () => {
    const room = getActiveRoom(socket.id);
    if (!room) return;
    if (socket.id !== room.currentTurn) return;
    const undo = room.lastRupere;
    if (!undo || undo.playerId !== socket.id) {
      socket.emit("action_error", { reason: "no_rupere_to_undo" });
      return;
    }
    const player = room.players.find((p) => p.socketId === socket.id)!;
    // Under the staged Rupere protocol the target tile lives in the
    // player's hand and the rest of the picked stack lives in
    // pendingRupereBonusCards. Undo is only legal while the target is
    // still in hand (i.e. it hasn't been melded yet).
    const targetTileId = undo.tiles[0]?.id;
    if (!targetTileId || !player.hand.some((t) => t.id === targetTileId)) {
      room.lastRupere = null;
      socket.emit("action_error", { reason: "rupere_already_used" });
      return;
    }
    // Remove the target from hand; the bonus tiles are still in
    // pending and will be discarded back along with it.
    removeTileFromHand(player, targetTileId);
    room.pendingRupereBonusCards = [];
    room.discardPile.splice(undo.pickIdx, 0, ...undo.tiles);
    room.hasDrawn = false;
    room.mustUseTileId = null;
    room.lastRupere = null;
    console.log(
      `Undo Rupere in ${room.id}: ${player.name} returned ${undo.tiles.length} tile(s) to the discard pile`,
    );
    room.recorder?.record("rupere_undo", room, {
      actor: player.sessionId,
      meta: { tileCount: undo.tiles.length },
    });
    broadcastGameState(room);
  });

  socket.on(
    "replace_joker",
    (payload: {
      tileId: string;
      jokerId: string;
      meldIndex: number;
      targetPlayerId: string;
    }) => {
      const { tileId, jokerId, meldIndex, targetPlayerId } = payload;
      const room = getActiveRoom(socket.id);
      if (!room) return;
      if (socket.id !== room.currentTurn) return;
      const player = room.players.find((p) => p.socketId === socket.id)!;
      const sendInvalid = (msg: string) => {
        socket.emit("invalid_move", msg);
        io.to(socket.id).emit(
          "game_state_update",
          viewForSocket(room, socket.id),
        );
      };
      if (!player.hasMeldedInitial) {
        sendInvalid("You must Etalare before swapping jokers.");
        return;
      }
      const targetZone = room.board[targetPlayerId];
      if (
        !targetZone ||
        typeof meldIndex !== "number" ||
        meldIndex < 0 ||
        meldIndex >= targetZone.length
      ) {
        sendInvalid("Invalid meld target.");
        return;
      }
      const meld = targetZone[meldIndex];
      const jokerIdx = meld.findIndex((t) => t.id === jokerId && t.isJoker);
      if (jokerIdx < 0) {
        sendInvalid("That tile is not a joker on that meld.");
        return;
      }
      const handIdx = player.hand.findIndex((t) => t.id === tileId);
      if (handIdx < 0) {
        sendInvalid("Replacement tile not in your hand.");
        return;
      }
      const replacement = player.hand[handIdx];
      if (replacement.isJoker) {
        sendInvalid("Cannot replace a joker with another joker.");
        return;
      }
      if (isValidSuita(meld)) {
        const reified = reifySuita(meld)!;
        const expectedValue = reified[jokerIdx].effective;
        const real = meld.find((t) => !t.isJoker);
        if (!real) {
          sendInvalid("Cannot determine joker substitution.");
          return;
        }
        if (
          replacement.value !== expectedValue ||
          replacement.color !== real.color
        ) {
          sendInvalid(
            "Replacement does not match the joker's value/color in this run.",
          );
          return;
        }
      } else if (isValidFormatie(meld)) {
        const real = meld.filter((t) => !t.isJoker);
        const setValue = real[0].value;
        const usedColors = new Set(real.map((t) => t.color));
        if (
          replacement.value !== setValue ||
          usedColors.has(replacement.color)
        ) {
          sendInvalid("Replacement does not match the joker's slot in this set.");
          return;
        }
      } else {
        sendInvalid("Meld is not a valid Suita or Formatie.");
        return;
      }
      const joker = meld[jokerIdx];
      meld[jokerIdx] = replacement;
      // Replacement leaves the hand; the freed Joker arrives in its
      // place. Re-use the replacement's slot for the joker so the
      // player's grid layout doesn't drift on every swap.
      const replacementSlot = player.handLayout[replacement.id];
      player.hand.splice(handIdx, 1);
      delete player.handLayout[replacement.id];
      player.hand.push(joker);
      if (typeof replacementSlot === "number") {
        player.handLayout[joker.id] = replacementSlot;
      } else {
        addTileWithSlot(player, joker);
        // addTileWithSlot pushed again — undo the duplicate push.
        player.hand.pop();
      }
      maybeRedeemRupereBonus(room, player);
      console.log(
        `Joker swap in ${room.id}: ${player.name} replaced ${jokerId} on ${targetPlayerId}/meld-${meldIndex} with ${replacement.id}`,
      );
      broadcastGameState(room);
    },
  );

  socket.on("check_room", (payload: { code?: string } = {}) => {
    const code = (payload.code ?? "").trim().toUpperCase();
    if (code.length !== 4) {
      socket.emit("room_status", {
        code,
        exists: false,
        full: false,
        playerCount: 0,
        gameStarted: false,
      });
      return;
    }
    const room = rooms.get(code);
    if (!room) {
      socket.emit("room_status", {
        code,
        exists: false,
        full: false,
        playerCount: 0,
        gameStarted: false,
      });
      return;
    }
    socket.emit("room_status", {
      code,
      exists: true,
      full: room.players.length >= MAX_PLAYERS,
      playerCount: room.players.length,
      gameStarted: room.gameStarted,
    });
  });

  socket.on("request_sync", () => {
    const room = getRoom(socket.id);
    if (!room) return;
    socket.emit("game_state_update", viewForSocket(room, socket.id));
    broadcastRoomUpdate(room);
  });

  socket.on("disconnect", (reason) => {
    console.log(`User disconnected: ${socket.id} (${reason})`);
    const sessionForSocket = getSessionBySocket(socket.id);
    const room = getRoom(socket.id);
    socketToRoom.delete(socket.id);
    if (!room || !sessionForSocket) return;
    const player = room.players.find(
      (p) => p.sessionId === sessionForSocket.sessionId,
    );
    if (!player) return;
    // Ghost protocol: don't evict the player from the room. Mark them
    // disconnected, broadcast the status, and schedule a 60-second
    // eviction timer that fires if (and only if) they don't reconnect.
    markDisconnected(
      sessionForSocket,
      (sessionId) => evictSession(sessionId),
      RECONNECT_GRACE_MS,
    );
    io.to(room.id).emit("player_status_change", {
      sessionId: sessionForSocket.sessionId,
      status: "disconnected",
    });
    broadcastRoomUpdate(room);
    broadcastGameState(room);
  });
});

/**
 * Called when a session's 60-second grace timer expires without a
 * reconnect. Removes the player from whatever room seated them and
 * tears the room down if no humans remain.
 */
function evictSession(sessionId: string): void {
  const room = findRoomBySession(sessionId);
  if (!room) return;
  const player = room.players.find((p) => p.sessionId === sessionId);
  if (!player) return;
  console.log(
    `Session ${sessionId} eviction (grace expired): removing ${player.name} from ${room.id}`,
  );
  // If it's their turn, advance first so the table doesn't deadlock.
  const wasTheirTurn = room.currentTurn === player.socketId;
  room.players = room.players.filter((p) => p.sessionId !== sessionId);
  delete room.board[player.socketId];
  if (wasTheirTurn && room.gameStarted && room.players.length > 0) {
    const next = room.players[0];
    room.currentTurn = next.socketId;
    startTurnTimer(room);
  }
  io.to(room.id).emit("player_status_change", {
    sessionId,
    status: "evicted",
  });
  const humans = room.players.filter((p) => !p.isBot).length;
  if (humans === 0) {
    stopTurnTimer(room);
    rooms.delete(room.id);
    console.log(`Room ${room.id} closed (no humans left)`);
    return;
  }
  broadcastRoomUpdate(room);
  broadcastGameState(room);
}

httpServer.listen(PORT, () => {
  console.log(`Rommy server listening on http://localhost:${PORT}`);
});
