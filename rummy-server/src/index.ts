import express from "express";
import cors from "cors";
import http from "http";
import { Server, Socket } from "socket.io";
import {
  createRoom,
  dealRoom,
  viewForSocket,
  MAX_PLAYERS,
  type Player,
  type Room,
} from "./GameState";
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
  resolveSession,
  type Session,
} from "./SessionStore";

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
io.use((socket, next) => {
  const auth = socket.handshake.auth as { sessionId?: string } | undefined;
  const session = resolveSession(auth?.sessionId);
  bindSocket(session, socket.id);
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
      player.hand = player.hand.filter((t) => t.id !== targetId);
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
    player.hand.push(tile);
    room.hasDrawn = true;
  }
  if (player.hand.length === 0) {
    advanceTurn(room);
    maybeScheduleBotTurn(room);
    return;
  }
  // Auto-discard the LAST tile in the hand (most recently drawn).
  const tile = player.hand.pop()!;
  room.discardPile.push(tile);
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
  const winner = room.players.find((p) => p.socketId === winnerId);
  for (const p of room.players) scoresByName[p.name] = scoreMap[p.socketId] ?? 0;
  room.gameStarted = false;
  room.currentTurn = null;
  stopTurnTimer(room);
  console.log(
    `Game over in ${room.id}: winner=${winner?.name} closing=${closingTile.isJoker ? "JOKER" : closingTile.value} scores=${JSON.stringify(scoresByName)}`,
  );
  io.to(room.id).emit("game_over", {
    winnerName: winner?.name ?? "?",
    scores: scoresByName,
    closingTile,
  });
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
    player.hand.push(...room.pendingRupereBonusCards);
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
    room.players.push({
      sessionId: session.sessionId,
      socketId: socket.id,
      name,
      hand: [],
      hasMeldedInitial: false,
      meldedScore: 0,
      isBot: false,
      colorIndex: nextColorIndex(room),
      bonusPoints: 0,
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
      socketId: botSocketId,
      name: botName,
      hand: [],
      hasMeldedInitial: false,
      meldedScore: 0,
      isBot: true,
      colorIndex,
      bonusPoints: 0,
    });
    console.log(`Bot added to ${room.id}: ${botSocketId}`);
    broadcastRoomUpdate(room);
  });

  socket.on("start_game", () => {
    const room = getRoom(socket.id);
    if (!room) return;
    if (room.gameStarted) {
      socket.emit("start_error", { reason: "already_started" });
      return;
    }
    if (room.players.length < 2) {
      socket.emit("start_error", { reason: "need_more_players" });
      return;
    }
    dealRoom(room);
    console.log(
      `Game started in ${room.id} with ${room.players.length} players`,
    );
    startTurnTimer(room);
    broadcastRoomUpdate(room);
    broadcastGameState(room);
    maybeScheduleBotTurn(room);
  });

  socket.on("restart_game", () => {
    const room = getRoom(socket.id);
    if (!room) return;
    if (room.gameStarted) return;
    if (room.players.length < 2) {
      socket.emit("start_error", { reason: "need_more_players" });
      return;
    }
    room.board = {};
    room.discardPile = [];
    room.drawPile = [];
    dealRoom(room);
    startTurnTimer(room);
    broadcastRoomUpdate(room);
    broadcastGameState(room);
    maybeScheduleBotTurn(room);
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
    player.hand.push(room.drawPile.shift()!);
    room.hasDrawn = true;
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
    player.hand.push(room.discardPile.pop()!);
    room.hasDrawn = true;
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
    room.discardPile.push(tile);
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
    player.hand = player.hand.filter((t) => !seen.has(t.id));
    (room.board[socket.id] ??= []).push(...proposedMelds);
    player.hasMeldedInitial = true;
    for (const meld of proposedMelds) player.meldedScore += scoreMeldFinal(meld);
    maybeRedeemRupereBonus(room, player);
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
    player.hand = player.hand.filter((t) => !seen.has(t.id));
    (room.board[socket.id] ??= []).push(...proposedMelds);
    for (const meld of proposedMelds) player.meldedScore += scoreMeldFinal(meld);
    maybeRedeemRupereBonus(room, player);
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
      targetZone[meldIndex] = chosen;
      player.meldedScore += newS - oldS;
      maybeRedeemRupereBonus(room, player);
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
    // Round 1 lockout: until every player has had a chance to discard
    // once, the pile is too short to support Rupere mechanics.
    if (room.discardPile.length <= room.players.length) {
      socket.emit(
        "error",
        "The discard pile is locked until the first round is complete.",
      );
      return;
    }
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
    player.hand.push(received);
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
    player.hand = player.hand.filter((t) => t.id !== targetTileId);
    room.pendingRupereBonusCards = [];
    room.discardPile.splice(undo.pickIdx, 0, ...undo.tiles);
    room.hasDrawn = false;
    room.mustUseTileId = null;
    room.lastRupere = null;
    console.log(
      `Undo Rupere in ${room.id}: ${player.name} returned ${undo.tiles.length} tile(s) to the discard pile`,
    );
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
      player.hand.splice(handIdx, 1);
      player.hand.push(joker);
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
    const room = getRoom(socket.id);
    socketToRoom.delete(socket.id);
    if (!room) return;
    const before = room.players.length;
    room.players = room.players.filter((p) => p.socketId !== socket.id);
    if (room.players.length === before) return;
    // If only bots remain, the room is dead — drop it.
    const humans = room.players.filter((p) => !p.isBot).length;
    if (humans === 0) {
      stopTurnTimer(room);
      rooms.delete(room.id);
      console.log(`Room ${room.id} closed (no humans left)`);
      return;
    }
    broadcastRoomUpdate(room);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Rommy server listening on http://localhost:${PORT}`);
});
