import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  pointerWithin,
  rectIntersection,
  getFirstCollision,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { TileComponent } from "./components/TileComponent";
import { arrayMove } from "@dnd-kit/sortable";
import type { Tile } from "./types/game";
import { PlayerRack, RACK_ID } from "./components/PlayerRack";
import { DrawPile } from "./components/DrawPile";
import { DiscardPile, DISCARD_PILE_ID } from "./components/DiscardPile";
import { GameBoard } from "./components/GameBoard";
import { GameOverModal } from "./components/GameOverModal";
import { Landing } from "./components/Landing";
import {
  playDiscard,
  playDraw,
  playMeld,
  playTick,
  playWin,
} from "./audio";
import "./App.css";

const USERNAME_STORAGE_KEY = "rommy.username";

const NEW_MELD_ID = "board-new-meld";
const DRAFT_PREFIX = "draft-meld-";
const BOARD_PREFIX = "board-meld:";
const JOKER_SLOT_PREFIX = "joker-slot:";

const PLAYER_THEMES = ["#00f2ff", "#ff007f", "#39ff14", "#ffcc00"] as const;

function parseBoardMeldId(id: string): { ownerId: string; meldIndex: number } | null {
  if (!id.startsWith(BOARD_PREFIX)) return null;
  const rest = id.slice(BOARD_PREFIX.length);
  const lastColon = rest.lastIndexOf(":");
  if (lastColon < 0) return null;
  const ownerId = rest.slice(0, lastColon);
  const meldIndex = Number(rest.slice(lastColon + 1));
  if (!ownerId || Number.isNaN(meldIndex)) return null;
  return { ownerId, meldIndex };
}

function parseJokerSlotId(
  id: string,
): { ownerId: string; meldIndex: number; jokerId: string } | null {
  if (!id.startsWith(JOKER_SLOT_PREFIX)) return null;
  // joker-slot:<ownerId>:<meldIdx>:<jokerId>
  const parts = id.slice(JOKER_SLOT_PREFIX.length).split(":");
  if (parts.length < 3) return null;
  const jokerId = parts.pop()!;
  const meldIdxStr = parts.pop()!;
  const ownerId = parts.join(":");
  const meldIndex = Number(meldIdxStr);
  if (!ownerId || Number.isNaN(meldIndex)) return null;
  return { ownerId, meldIndex, jokerId };
}

type SortMode = "none" | "groups" | "runs";

function compareByGroups(a: Tile, b: Tile): number {
  if (a.isJoker !== b.isJoker) return a.isJoker ? 1 : -1;
  if (a.value !== b.value) return a.value - b.value;
  return a.color.localeCompare(b.color);
}

function compareByRuns(a: Tile, b: Tile): number {
  if (a.isJoker !== b.isJoker) return a.isJoker ? 1 : -1;
  if (a.color !== b.color) return a.color.localeCompare(b.color);
  return a.value - b.value;
}

const socket = io(import.meta.env.VITE_SOCKET_URL);

interface LobbyPlayer {
  id: string;
  name: string;
  isBot: boolean;
}

interface GameOverPayload {
  winnerName: string;
  scores: Record<string, number>;
  closingTile: Tile;
}

interface GameStateUpdate {
  hand: Tile[];
  board: Record<string, Tile[][]>;
  drawPileCount: number;
  discardPile: Tile[];
  currentTurn: string | null;
  gameStarted: boolean;
  hasMeldedInitial: boolean;
  hasDrawn: boolean;
  turnEndsAt: number | null;
  mustUseTileId: string | null;
  handCounts: Record<string, number>;
  meldPoints: Record<string, number>;
  players: Array<{
    socketId: string;
    name: string;
    handCount: number;
    hasMeldedInitial: boolean;
    isBot: boolean;
    colorIndex: number;
  }>;
}

function App() {
  const [hand, setHand] = useState<Tile[]>([]);
  const [board, setBoard] = useState<Record<string, Tile[][]>>({});
  const [draftMelds, setDraftMelds] = useState<Tile[][]>([]);
  const [discardPile, setDiscardPile] = useState<Tile[]>([]);
  const [activeTile, setActiveTile] = useState<Tile | null>(null);
  const prevDiscardLenRef = useRef(0);
  const [username, setUsername] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(USERNAME_STORAGE_KEY) ?? "";
  });
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [roomStatus, setRoomStatus] = useState<{
    code: string;
    exists: boolean;
    full: boolean;
    playerCount: number;
    gameStarted: boolean;
  } | null>(null);
  const [inLobby, setInLobby] = useState(false);
  const [lobbyPlayers, setLobbyPlayers] = useState<LobbyPlayer[]>([]);
  const [gameStarted, setGameStarted] = useState(false);
  const [drawPileCount, setDrawPileCount] = useState(0);
  const [handCounts, setHandCounts] = useState<Record<string, number>>({});
  const [meldPoints, setMeldPoints] = useState<Record<string, number>>({});
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimerRef.current != null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3500);
  };
  const [currentTurn, setCurrentTurn] = useState<string | null>(null);
  const [hasMelded, setHasMelded] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [mustUseTileId, setMustUseTileId] = useState<string | null>(null);
  const [turnEndsAt, setTurnEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [sortMode, setSortMode] = useState<SortMode>("none");
  const [gameOver, setGameOver] = useState<GameOverPayload | null>(null);
  const [gamePlayers, setGamePlayers] = useState<
    Array<{
      socketId: string;
      name: string;
      handCount: number;
      hasMeldedInitial: boolean;
      isBot: boolean;
      colorIndex: number;
    }>
  >([]);

  // Tiles in draftMelds also live in `hand` (server-authoritative). The
  // rack is hand minus whatever the player has staged in draft melds.
  const draftTileIds = useMemo(
    () => new Set(draftMelds.flat().map((t) => t.id)),
    [draftMelds],
  );
  const rackTiles = useMemo(() => {
    const base = hand.filter((t) => !draftTileIds.has(t.id));
    if (sortMode === "groups") return [...base].sort(compareByGroups);
    if (sortMode === "runs") return [...base].sort(compareByRuns);
    return base;
  }, [hand, draftTileIds, sortMode]);

  useEffect(() => {
    const onConnect = () => {
      console.log("Connected to server!");
      // After a reconnect (or initial connect) ask the server for the
      // current authoritative state so the UI snaps back without a
      // page refresh.
      socket.emit("request_sync");
    };
    const onDisconnect = (reason: string) =>
      console.log("Socket disconnected:", reason);
    const onRoomUpdate = (payload: { code: string; players: LobbyPlayer[] }) => {
      setRoomCode(payload.code);
      setLobbyPlayers(payload.players);
      setInLobby(true);
    };
    const onRoomCreated = (payload: { code: string }) => {
      setRoomCode(payload.code);
    };
    const onRoomJoined = (payload: { code: string }) => {
      setRoomCode(payload.code);
    };
    const onRoomStatus = (status: typeof roomStatus) => setRoomStatus(status);
    const onJoinError = (payload: { reason: string }) => {
      const message =
        payload.reason === "no_such_room"
          ? "No room with that code."
          : payload.reason === "bad_code"
            ? "Codes are 4 characters."
            : payload.reason === "room_full"
              ? "That room is full."
              : payload.reason === "game_in_progress"
                ? "That room's game has already started."
                : `Couldn't join (${payload.reason}).`;
      setJoinError(message);
    };
    const onGameState = (state: GameStateUpdate) => {
      // Play the discard "thud" for *everyone* the moment the server
      // confirms a new tile on the pile, not just for the actor.
      if (state.discardPile.length > prevDiscardLenRef.current) {
        playDiscard();
      }
      prevDiscardLenRef.current = state.discardPile.length;
      setHand(state.hand);
      setBoard(state.board);
      setDiscardPile(state.discardPile);
      setDrawPileCount(state.drawPileCount);
      setHandCounts(state.handCounts ?? {});
      setMeldPoints(state.meldPoints ?? {});
      setGameStarted(state.gameStarted);
      setCurrentTurn(state.currentTurn);
      const localPlayer = state.players.find(
        (p) => p.socketId === socket.id,
      );
      setHasMelded(localPlayer ? localPlayer.hasMeldedInitial : false);
      setHasDrawn(state.hasDrawn);
      setMustUseTileId(state.mustUseTileId);
      setTurnEndsAt(state.turnEndsAt);
      setGamePlayers(state.players);
      // A fresh round (gameStarted=true) clears any lingering modal.
      if (state.gameStarted) setGameOver(null);
      // Drop any drafts whose tiles are no longer in our hand (the
      // server has either committed them to the board or they were
      // re-allocated for some other reason).
      const handIds = new Set(state.hand.map((t) => t.id));
      setDraftMelds((prev) =>
        prev
          .map((m) => m.filter((t) => handIds.has(t.id)))
          .filter((m) => m.length > 0),
      );
    };
    const onInvalidMove = (message: string) => {
      showToast(message);
      setDraftMelds([]);
      socket.emit("request_sync");
    };

    const onEtalareSuccess = () => {
      setHasMelded(true);
      playMeld();
    };
    const onGameOver = (payload: GameOverPayload) => {
      setGameOver(payload);
      playWin();
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("room_update", onRoomUpdate);
    socket.on("room_created", onRoomCreated);
    socket.on("room_joined", onRoomJoined);
    socket.on("room_status", onRoomStatus);
    socket.on("join_error", onJoinError);
    socket.on("game_state_update", onGameState);
    socket.on("invalid_move", onInvalidMove);
    socket.on("etalare_success", onEtalareSuccess);
    socket.on("game_over", onGameOver);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("room_update", onRoomUpdate);
      socket.off("room_created", onRoomCreated);
      socket.off("room_joined", onRoomJoined);
      socket.off("room_status", onRoomStatus);
      socket.off("join_error", onJoinError);
      socket.off("game_state_update", onGameState);
      socket.off("invalid_move", onInvalidMove);
      socket.off("etalare_success", onEtalareSuccess);
      socket.off("game_over", onGameOver);
    };
  }, []);

  // Tick once per second so the countdown can re-render.
  useEffect(() => {
    if (turnEndsAt == null) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [turnEndsAt]);

  const turnSecondsRemaining = useMemo(() => {
    if (turnEndsAt == null) return null;
    return Math.max(0, Math.ceil((turnEndsAt - now) / 1000));
  }, [turnEndsAt, now]);

  // Tick warning sound once per second when under 10s remaining.
  const lastTickedSecondRef = useRef<number | null>(null);
  useEffect(() => {
    if (turnSecondsRemaining == null) return;
    if (turnSecondsRemaining > 0 && turnSecondsRemaining <= 10) {
      if (lastTickedSecondRef.current !== turnSecondsRemaining) {
        lastTickedSecondRef.current = turnSecondsRemaining;
        playTick();
      }
    } else {
      lastTickedSecondRef.current = null;
    }
  }, [turnSecondsRemaining]);

  const persistUsername = (name: string) => {
    setUsername(name);
    try {
      localStorage.setItem(USERNAME_STORAGE_KEY, name);
    } catch {
      /* ignore */
    }
  };
  const handleHostGame = (name: string) => {
    setJoinError(null);
    persistUsername(name);
    socket.emit("create_room", { name });
  };
  const handleJoinRoom = (name: string, code: string) => {
    setJoinError(null);
    persistUsername(name);
    socket.emit("join_room", { name, code });
  };
  const handleCheckRoom = (code: string) => {
    socket.emit("check_room", { code });
  };
  const handleStartGame = () => socket.emit("start_game");
  const handleAddBot = () => socket.emit("add_bot");
  const handlePlayAgain = () => {
    socket.emit("restart_game");
    setGameOver(null);
  };
  const handleEndTurn = () => {
    if (!hasDrawn || hand.length === 0) return;
    const last = hand[hand.length - 1];
    if (draftTileIds.has(last.id)) return;
    console.log("End-turn discard:", last.id);
    socket.emit("discard_tile", last.id);
  };
  const handleSubmitEtalare = () => {
    if (draftMelds.length === 0) return;
    socket.emit("submit_etalare", draftMelds);
    setDraftMelds([]);
  };

  const handlePlayNewMeld = () => {
    if (draftMelds.length === 0) return;
    socket.emit("play_new_meld", draftMelds);
    playMeld();
    setDraftMelds([]);
  };

  const sensors = useSensors(useSensor(PointerSensor));

  const collisionDetection: CollisionDetection = useCallback((args) => {
    const pointerCollisions = pointerWithin(args);
    // Joker slots win first — they're nested inside meld droppables and
    // we want a drop on the joker itself to trigger replace_joker, not
    // attach_tile on the parent meld.
    const jokerHit = pointerCollisions.find((c) =>
      String(c.id).startsWith(JOKER_SLOT_PREFIX),
    );
    if (jokerHit) return [jokerHit];
    const newMeldHit = pointerCollisions.find((c) => c.id === NEW_MELD_ID);
    if (newMeldHit) return [newMeldHit];
    if (pointerCollisions.length > 0) {
      const first = getFirstCollision(pointerCollisions);
      if (first != null) return pointerCollisions;
    }
    const intersections = rectIntersection(args);
    if (intersections.length > 0) return intersections;
    return closestCorners(args);
  }, []);

  /**
   * Resolve an over/active id into a logical container id.
   *  - rack            : the player's rack
   *  - board-new-meld  : drop zone for creating a new draft meld
   *  - draft-meld-N    : an in-progress local meld
   *  - board-meld-N    : a server-confirmed meld (drop targets only)
   *  - discard-pile    : the discard pile drop target
   * Tile ids resolve to the container that currently holds them.
   */
  const findContainer = (id: string): string | null => {
    if (
      id === RACK_ID ||
      id === NEW_MELD_ID ||
      id === DISCARD_PILE_ID
    )
      return id;
    if (id.startsWith(DRAFT_PREFIX) || id.startsWith(BOARD_PREFIX)) return id;
    for (let i = 0; i < draftMelds.length; i++) {
      if (draftMelds[i].some((t) => t.id === id)) return `${DRAFT_PREFIX}${i}`;
    }
    if (hand.some((t) => t.id === id)) return RACK_ID;
    return null;
  };

  const findTile = (id: string): Tile | null => {
    const inHand = hand.find((t) => t.id === id);
    if (inHand) return inHand;
    for (const meld of draftMelds) {
      const t = meld.find((x) => x.id === id);
      if (t) return t;
    }
    return null;
  };

  const drawFromDeck = () => {
    socket.emit("draw_tile");
    playDraw();
  };
  const handleRupere = (tileId: string) => {
    socket.emit("rupere_tile", { tileId });
    playDraw();
  };
  const handleUndoRupere = () => {
    socket.emit("undo_rupere");
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveTile(findTile(String(event.active.id)));
  };
  const handleDragCancel = () => setActiveTile(null);

  /**
   * During drag, only mutate local draft state. Cross-container moves
   * targeting `board-meld-*`, `board-new-meld`, or the discard pile are
   * server-authoritative and are deferred to dragEnd.
   */
  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    const activeContainer = findContainer(activeId);
    const overContainer = findContainer(overId);
    if (!activeContainer || !overContainer) return;
    if (activeContainer === overContainer) return;

    const isLocal = (c: string) =>
      c === RACK_ID || c.startsWith(DRAFT_PREFIX);
    if (!isLocal(activeContainer) || !isLocal(overContainer)) return;

    const tile = findTile(activeId);
    if (!tile) return;

    setDraftMelds((prev) => {
      // Remove from source draft (if any).
      let next: Tile[][] = activeContainer.startsWith(DRAFT_PREFIX)
        ? prev.map((m, i) =>
            i === Number(activeContainer.slice(DRAFT_PREFIX.length))
              ? m.filter((t) => t.id !== activeId)
              : m,
          )
        : prev.map((m) => m);

      if (overContainer === RACK_ID) {
        return next.filter((m) => m.length > 0);
      }

      const dstIdx = Number(overContainer.slice(DRAFT_PREFIX.length));
      next = next.map((m, i) => {
        if (i !== dstIdx) return m;
        const insertAt =
          overId === overContainer
            ? m.length
            : (() => {
                const k = m.findIndex((t) => t.id === overId);
                return k >= 0 ? k : m.length;
              })();
        const out = [...m];
        out.splice(insertAt, 0, tile);
        return out;
      });
      return next.filter((m) => m.length > 0);
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTile(null);
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    // Joker swap: dropped onto a joker slot inside a confirmed meld.
    if (overId.startsWith(JOKER_SLOT_PREFIX)) {
      if (draftTileIds.has(activeId)) return;
      if (!hand.some((t) => t.id === activeId)) return;
      const parsed = parseJokerSlotId(overId);
      if (!parsed) return;
      console.log("Attempting joker swap:", {
        activeId,
        jokerId: parsed.jokerId,
        ownerId: parsed.ownerId,
        meldIndex: parsed.meldIndex,
      });
      socket.emit("replace_joker", {
        tileId: activeId,
        jokerId: parsed.jokerId,
        meldIndex: parsed.meldIndex,
        targetPlayerId: parsed.ownerId,
      });
      return;
    }

    // Discard (only valid for tiles still in the rack — not staged).
    if (overId === DISCARD_PILE_ID) {
      if (draftTileIds.has(activeId)) return;
      if (!hand.some((t) => t.id === activeId)) return;
      console.log("Attempting to discard:", activeId);
      socket.emit("discard_tile", activeId);
      // The discard sound now plays for everyone via the
      // game_state_update broadcast — no local emit-time playback.
      return;
    }

    // Attach to a server-confirmed meld in any player's zone.
    if (overId.startsWith(BOARD_PREFIX)) {
      const parsed = parseBoardMeldId(overId);
      if (!parsed) return;
      // Only tiles currently in our hand (and not staged in a draft) can
      // be attached. If a tile was staged we'd need to un-stage first;
      // for simplicity we ignore drags from drafts directly onto board
      // melds.
      if (draftTileIds.has(activeId)) return;
      if (!hand.some((t) => t.id === activeId)) return;
      socket.emit("attach_tile", {
        tileId: activeId,
        meldIndex: parsed.meldIndex,
        targetPlayerId: parsed.ownerId,
      });
      return;
    }

    // Drop in the new-meld zone — promote the tile to a fresh draft.
    if (overId === NEW_MELD_ID) {
      const tile = findTile(activeId);
      if (!tile) return;
      setDraftMelds((prev) => {
        const cleaned = prev
          .map((m) => m.filter((t) => t.id !== activeId))
          .filter((m) => m.length > 0);
        return [...cleaned, [tile]];
      });
      return;
    }

    const activeContainer = findContainer(activeId);
    const overContainer = findContainer(overId);
    if (!activeContainer || !overContainer) return;

    // Reorder within the rack.
    if (
      activeContainer === RACK_ID &&
      overContainer === RACK_ID &&
      activeId !== overId
    ) {
      const oldIdx = hand.findIndex((t) => t.id === activeId);
      const newIdx = hand.findIndex((t) => t.id === overId);
      if (oldIdx >= 0 && newIdx >= 0) setHand(arrayMove(hand, oldIdx, newIdx));
      return;
    }

    // Reorder within a single draft meld.
    if (
      activeContainer === overContainer &&
      activeContainer.startsWith(DRAFT_PREFIX) &&
      activeId !== overId
    ) {
      const idx = Number(activeContainer.slice(DRAFT_PREFIX.length));
      const meld = draftMelds[idx];
      if (!meld) return;
      const oldI = meld.findIndex((t) => t.id === activeId);
      const newI = meld.findIndex((t) => t.id === overId);
      if (oldI >= 0 && newI >= 0) {
        setDraftMelds(
          draftMelds.map((m, i) =>
            i === idx ? arrayMove(m, oldI, newI) : m,
          ),
        );
      }
    }
  };

  const isMyTurn = currentTurn === socket.id;
  const localThemeColor = (() => {
    const me = gamePlayers.find((p) => p.socketId === socket.id);
    if (!me) return PLAYER_THEMES[0];
    return PLAYER_THEMES[me.colorIndex % PLAYER_THEMES.length];
  })();

  if (!roomCode) {
    return (
      <>
        <Landing
          initialUsername={username}
          onHost={handleHostGame}
          onJoin={handleJoinRoom}
          onCheckRoom={handleCheckRoom}
          roomStatus={roomStatus}
        />
        {joinError && (
          <div
            style={{
              position: "fixed",
              top: 16,
              left: "50%",
              transform: "translateX(-50%)",
              background: "#5a1414",
              color: "#fff",
              padding: "8px 16px",
              borderRadius: 8,
              zIndex: 900,
            }}
          >
            {joinError}
          </div>
        )}
      </>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div
        className="app"
        style={{ ["--theme-color" as string]: localThemeColor }}
      >
        <header className="app-header">
          <div className="app-header__title-row">
            <h1>Rommy</h1>
            <span className="room-code">
              Room <strong>{roomCode}</strong>
            </span>
            <span className="room-count">
              Players: {lobbyPlayers.length}/4
            </span>
            {gameStarted &&
              (() => {
                const me = gamePlayers.find((p) => p.socketId === socket.id);
                if (!me) return null;
                const color = PLAYER_THEMES[me.colorIndex % PLAYER_THEMES.length];
                return (
                  <span
                    className="player-tag"
                    style={{
                      color,
                      borderColor: color,
                      boxShadow: `0 0 8px ${color}55`,
                    }}
                  >
                    {me.name}
                  </span>
                );
              })()}
          </div>
          <div className="lobby-controls">
            {inLobby && !gameStarted && (
              <>
                <div className="lobby-panel">
                  <h2>Lobby ({lobbyPlayers.length}/4)</h2>
                  <ul>
                    {lobbyPlayers.map((p) => (
                      <li key={p.id}>
                        {p.name}
                        {p.id === socket.id ? " (you)" : ""}
                      </li>
                    ))}
                  </ul>
                </div>
                <button onClick={handleAddBot}>Add Bot</button>
                <button
                  onClick={handleStartGame}
                  disabled={lobbyPlayers.length < 2}
                >
                  Start Game
                </button>
              </>
            )}
            {gameStarted &&
              (() => {
                const myTurn = currentTurn === socket.id;
                const turnPlayer = gamePlayers.find(
                  (p) => p.socketId === currentTurn,
                );
                const turnLabel = myTurn
                  ? "Your Turn"
                  : `${turnPlayer?.name ?? "—"}'s Turn`;
                const lowTime =
                  turnSecondsRemaining != null && turnSecondsRemaining <= 10;
                const seconds =
                  turnSecondsRemaining != null
                    ? ` (${turnSecondsRemaining}s remaining)`
                    : "";
                return (
                  <span
                    className={`turn-indicator${myTurn ? " turn-indicator--mine" : ""}${lowTime ? " turn-indicator--low" : ""}`}
                  >
                    {turnLabel}
                    {seconds}
                  </span>
                );
              })()}
          </div>
        </header>

        <div className="piles-area">
          <DrawPile
            onClick={drawFromDeck}
            empty={drawPileCount === 0}
            disabled={hasDrawn}
            count={drawPileCount}
          />
          <DiscardPile
            tiles={discardPile}
            canRupere={isMyTurn && !hasDrawn}
            locked={
              gameStarted &&
              gamePlayers.length > 0 &&
              discardPile.length <= gamePlayers.length
            }
            onRupere={handleRupere}
          />
        </div>

        <div className="board-area">
          <GameBoard
            board={board}
            draftMelds={draftMelds}
            players={gamePlayers}
            themes={[...PLAYER_THEMES]}
            localPlayerId={socket.id ?? ""}
            handCounts={handCounts}
            meldPoints={meldPoints}
          />
          {isMyTurn && (
            <div className="board-actions">
              <button
                className="etalare-button"
                onClick={hasMelded ? handlePlayNewMeld : handleSubmitEtalare}
              >
                {hasMelded ? "Play New Meld" : "Etalare"}
              </button>
              {mustUseTileId && (
                <button
                  className="undo-rupere-button"
                  onClick={handleUndoRupere}
                  title="Return the Rupere tile(s) to the discard pile"
                >
                  Undo Pick
                </button>
              )}
              <button
                className="end-turn-button"
                onClick={handleEndTurn}
                disabled={!hasDrawn || hand.length === 0}
                title="Discards your last tile to end the turn"
              >
                End Turn (Discard)
              </button>
            </div>
          )}
        </div>

        <div className="rack-area">
          <div className="rack-controls">
            <button
              className={`rack-sort${sortMode === "groups" ? " rack-sort--active" : ""}`}
              onClick={() => setSortMode("groups")}
            >
              Sort by Groups
            </button>
            <button
              className={`rack-sort${sortMode === "runs" ? " rack-sort--active" : ""}`}
              onClick={() => setSortMode("runs")}
            >
              Sort by Runs
            </button>
            {sortMode !== "none" && (
              <button
                className="rack-sort"
                onClick={() => setSortMode("none")}
              >
                Clear sort
              </button>
            )}
            {gameStarted && (
              <span className="rack-count">Cards: {hand.length}</span>
            )}
          </div>
          <PlayerRack tiles={rackTiles} />
        </div>
      </div>

      <DragOverlay>
        {activeTile ? <TileComponent tile={activeTile} /> : null}
      </DragOverlay>

      {toast && (
        <div className="toast toast--error" role="status">
          {toast}
        </div>
      )}

      {gameOver && (
        <GameOverModal
          winnerName={gameOver.winnerName}
          scores={gameOver.scores}
          closingTile={gameOver.closingTile}
          onPlayAgain={handlePlayAgain}
        />
      )}
    </DndContext>
  );
}

export default App;
