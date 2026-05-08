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
import { AfterActionReport } from "./components/AfterActionReport";
import { ReplayScrubber } from "./components/ReplayScrubber";
import type { MatchTape } from "./replay/types";
import { CheatSheet } from "./components/CheatSheet";
import { Landing } from "./components/Landing";
import { LanguageSwitcher } from "./components/LanguageSwitcher";
import { Leaderboard } from "./components/Leaderboard";
import { ScramblePile } from "./components/ScramblePile";
import { VolumeSlider } from "./components/VolumeSlider";
import { useTranslation } from "react-i18next";
import {
  calculateMeldPoints,
  canInitialMeld,
  isValidFormatie,
  isValidSuita,
} from "./rules";
import {
  playDiscard,
  playDraw,
  playMeld,
  playTick,
  playWin,
  playYourTurn,
  unlockAudio,
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

const SESSION_STORAGE_KEY = "rommy_session_id";

const STORED_SESSION_ID: string | undefined = (() => {
  if (typeof window === "undefined") return undefined;
  try {
    return localStorage.getItem(SESSION_STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
})();

// Syndicate Reputation Ledger identity. Generated on first load and
// persisted to localStorage; exportable so the alias + ELO can move
// across devices. See identity.ts for details.
import { getAlias, getSignatureId, setAlias } from "./identity";
const STORED_SIGNATURE_ID = getSignatureId();

const socket = io(import.meta.env.VITE_SOCKET_URL, {
  auth: {
    sessionId: STORED_SESSION_ID,
    signatureId: STORED_SIGNATURE_ID,
    alias: getAlias() || undefined,
  },
});

// On every connect/reconnect the server tells us which sessionId it
// considers canonical. Persist it so the next page load can re-auth.
socket.on("session_handshake", ({ sessionId }: { sessionId: string }) => {
  try {
    if (localStorage.getItem(SESSION_STORAGE_KEY) !== sessionId) {
      localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    }
  } catch {
    /* localStorage unavailable — fine, server still tracks it in-memory */
  }
  // Make sure subsequent reconnect attempts present the same id.
  socket.auth = { sessionId };
});

interface LobbyPlayer {
  id: string;
  name: string;
  isBot: boolean;
}

interface GameOverPayload {
  winnerName: string;
  scores: Record<string, number>;
  closingTile: Tile;
  /** Epoch-ms when the auto-deal will fire. */
  nextDealAt: number;
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
  phase: "lobby" | "scrambling" | "playing" | "scoreboard";
  scrambleEndsAt: number | null;
  scrambleSeed: number | null;
  scoreboardEndsAt: number | null;
  /** SessionIds that have clicked Ready during the current intermission. */
  readyForNext: string[];
  /** SessionId -> cumulative score across rounds played in this room. */
  globalScores: Record<string, number>;
  handCounts: Record<string, number>;
  meldPoints: Record<string, number>;
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
    eloScore: number;
  }>;
  atu: Tile | null;
  atuAwardedTo: string | null;
}

function App() {
  const { t } = useTranslation();
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
  const [cheatSheetOpen, setCheatSheetOpen] = useState(false);
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
      sessionId: string;
      handCount: number;
      hasMeldedInitial: boolean;
      isBot: boolean;
      colorIndex: number;
      bonusPoints: number;
      connectionStatus: "active" | "disconnected";
      eloScore: number;
    }>
  >([]);
  const [atu, setAtu] = useState<Tile | null>(null);
  const [atuAwardedTo, setAtuAwardedTo] = useState<string | null>(null);
  const lastAtuAnnouncedRef = useRef<string | null>(null);
  const [roomPhase, setRoomPhase] = useState<
    "lobby" | "scrambling" | "playing" | "scoreboard"
  >("lobby");
  const [scrambleEndsAt, setScrambleEndsAt] = useState<number | null>(null);
  const [scrambleSeed, setScrambleSeed] = useState<number | null>(null);
  const [scoreboardEndsAt, setScoreboardEndsAt] = useState<number | null>(null);
  const [readyForNext, setReadyForNext] = useState<string[]>([]);
  const [globalScores, setGlobalScores] = useState<Record<string, number>>({});
  const [peerCursors, setPeerCursors] = useState<
    Map<string, { sessionId: string; x: number; y: number; ts: number }>
  >(new Map());
  const [hypeLevel, setHypeLevel] = useState(0);
  const [hypeClimax, setHypeClimax] = useState(false);
  const hypeClimaxTimerRef = useRef<number | null>(null);
  // Match tape arrives once per round close. Cleared the moment the
  // next round phase changes away from "scoreboard" so the events
  // array (which can run several MB) is freed promptly.
  const [matchTape, setMatchTape] = useState<MatchTape | null>(null);
  const [showReplay, setShowReplay] = useState(false);

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
          ? t("join_err_no_such_room")
          : payload.reason === "bad_code"
            ? t("join_err_bad_code")
            : payload.reason === "room_full"
              ? t("join_err_room_full")
              : payload.reason === "game_in_progress"
                ? t("join_err_game_in_progress")
                : t("join_err_generic", { reason: payload.reason });
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
      setAtu(state.atu);
      setAtuAwardedTo(state.atuAwardedTo);
      setRoomPhase(state.phase);
      setScrambleEndsAt(state.scrambleEndsAt);
      setScrambleSeed(state.scrambleSeed);
      setScoreboardEndsAt(state.scoreboardEndsAt);
      setReadyForNext(state.readyForNext);
      setGlobalScores(state.globalScores);
      // Drop stale peer cursors when leaving the scramble phase, and
      // wipe the hype meter so the next round starts at zero.
      if (state.phase !== "scrambling") {
        setPeerCursors(new Map());
        setHypeLevel(0);
        setHypeClimax(false);
      }
      // Announce the Atu once per round, the first time we see it awarded.
      if (
        state.gameStarted &&
        state.atu &&
        state.atuAwardedTo &&
        lastAtuAnnouncedRef.current !== state.atuAwardedTo
      ) {
        lastAtuAnnouncedRef.current = state.atuAwardedTo;
        if (state.atuAwardedTo === socket.id) {
          showToast(t("atu_claim_self"));
        } else {
          const name =
            state.players.find((p) => p.socketId === state.atuAwardedTo)
              ?.name ?? "—";
          showToast(t("atu_claim_other", { name }));
        }
      }
      if (!state.gameStarted) lastAtuAnnouncedRef.current = null;
      // A fresh round (or the scramble that precedes it) clears the
      // intermission modal — otherwise it would overlay the scramble UI.
      if (state.phase === "scrambling" || state.gameStarted) {
        setGameOver(null);
      }
      // Drop the previous round's tape and any open replay view as
      // soon as we're no longer in the post-round intermission. This
      // is the main memory-leak guard for the recorder pipeline —
      // the tape can be several MB so we don't want it sticking
      // around across rounds.
      if (state.phase !== "scoreboard") {
        setMatchTape(null);
        setShowReplay(false);
      }
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

    const onPeerCursor = (payload: {
      sessionId: string;
      x: number;
      y: number;
    }) => {
      setPeerCursors((prev) => {
        const next = new Map(prev);
        next.set(payload.sessionId, { ...payload, ts: Date.now() });
        return next;
      });
    };
    const onHypeUpdate = (payload: { hypeLevel: number }) => {
      setHypeLevel(payload.hypeLevel);
    };
    const onHypeClimax = () => {
      setHypeClimax(true);
      if (hypeClimaxTimerRef.current != null) {
        window.clearTimeout(hypeClimaxTimerRef.current);
      }
      hypeClimaxTimerRef.current = window.setTimeout(() => {
        setHypeClimax(false);
        hypeClimaxTimerRef.current = null;
      }, 600);
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
    socket.on("peer_cursor", onPeerCursor);
    socket.on("hype_update", onHypeUpdate);
    socket.on("hype_climax", onHypeClimax);
    const onMatchTape = (tape: MatchTape) => setMatchTape(tape);
    socket.on("match_tape", onMatchTape);
    return () => {
      socket.off("peer_cursor", onPeerCursor);
      socket.off("hype_update", onHypeUpdate);
      socket.off("hype_climax", onHypeClimax);
      socket.off("match_tape", onMatchTape);
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

  // "Your turn" chime — fire once each time currentTurn flips to us.
  const prevTurnRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevTurnRef.current;
    prevTurnRef.current = currentTurn;
    if (!gameStarted) return;
    if (currentTurn === socket.id && prev !== socket.id) {
      playYourTurn();
    }
  }, [currentTurn, gameStarted]);

  // Tick warning sound once per second when under 10s remaining — but
  // ONLY for the player whose turn it actually is. Everyone else still
  // sees the visual countdown (the turn-indicator pill keeps rendering
  // turnSecondsRemaining regardless); we just don't blast the audio.
  const lastTickedSecondRef = useRef<number | null>(null);
  useEffect(() => {
    if (turnSecondsRemaining == null) return;
    const myTurn = currentTurn != null && currentTurn === socket.id;
    if (myTurn && turnSecondsRemaining > 0 && turnSecondsRemaining <= 10) {
      if (lastTickedSecondRef.current !== turnSecondsRemaining) {
        lastTickedSecondRef.current = turnSecondsRemaining;
        playTick();
      }
    } else {
      lastTickedSecondRef.current = null;
    }
  }, [turnSecondsRemaining, currentTurn]);

  const persistUsername = (name: string) => {
    setUsername(name);
    try {
      localStorage.setItem(USERNAME_STORAGE_KEY, name);
    } catch {
      /* ignore */
    }
    // Mirror the alias into the Syndicate Ledger storage and refresh
    // socket.auth so future reconnects re-bind with the new alias.
    setAlias(name);
    socket.auth = {
      sessionId:
        (() => {
          try {
            return localStorage.getItem(SESSION_STORAGE_KEY) ?? undefined;
          } catch {
            return undefined;
          }
        })(),
      signatureId: STORED_SIGNATURE_ID,
      alias: name,
    };
  };
  const handleHostGame = (name: string) => {
    unlockAudio();
    setJoinError(null);
    persistUsername(name);
    socket.emit("create_room", { name });
  };
  const handleJoinRoom = (name: string, code: string) => {
    unlockAudio();
    setJoinError(null);
    persistUsername(name);
    socket.emit("join_room", { name, code });
  };
  const handleCheckRoom = (code: string) => {
    socket.emit("check_room", { code });
  };
  const handleStartGame = () => {
    unlockAudio();
    socket.emit("start_game");
  };
  const handleAddBot = () => socket.emit("add_bot");
  const handlePlayAgain = () => {
    socket.emit("restart_game");
    setGameOver(null);
  };
  const handleQuit = () => {
    // Tell the server first so the room evicts us before the socket
    // tears down. Then clear the persistent session id so we come back
    // as a fresh player on next visit, and bounce to the landing.
    try {
      socket.emit("player_leave");
    } catch {
      /* ignore — we're leaving anyway */
    }
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    socket.disconnect();
    // Hard reload so all in-memory React state (including the lazy
    // module-scoped socket and AudioContext) is rebuilt for a clean
    // landing-page session.
    window.location.reload();
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

  // Smart meld-button state — derived from the local draft. The server
  // is still the authority on commit, but this gives the player live
  // feedback while they assemble the meld.
  const meldButton = (() => {
    if (draftMelds.length === 0) {
      return {
        label: t("meld_btn_select"),
        disabled: true,
        active: false,
        onClick: () => {},
      };
    }
    const allMeldsValid = draftMelds.every(
      (m) => isValidSuita(m) || isValidFormatie(m),
    );
    if (!allMeldsValid) {
      return {
        label: t("meld_btn_invalid"),
        disabled: true,
        active: false,
        onClick: () => {},
      };
    }
    if (!hasMelded) {
      if (!canInitialMeld(draftMelds)) {
        const total = draftMelds.reduce(
          (s, m) => s + calculateMeldPoints(m),
          0,
        );
        const hasSuita = draftMelds.some(isValidSuita);
        const label = !hasSuita
          ? t("meld_btn_need_suita")
          : t("meld_btn_not_enough", { total });
        return { label, disabled: true, active: false, onClick: () => {} };
      }
      return {
        label: t("meld_btn_etalare"),
        disabled: false,
        active: true,
        onClick: handleSubmitEtalare,
      };
    }
    return {
      label: t("meld_btn_play_new"),
      disabled: false,
      active: true,
      onClick: handlePlayNewMeld,
    };
  })();
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
        <aside className="sidebar">
          <h1 className="sidebar__brand">Rommy</h1>
          <Leaderboard
            themes={PLAYER_THEMES}
            rows={gamePlayers.map((p) => ({
              sessionId: p.sessionId,
              name: p.name,
              isBot: p.isBot,
              colorIndex: p.colorIndex,
              connectionStatus: p.connectionStatus,
              score: globalScores[p.sessionId] ?? 0,
              eloScore: p.eloScore,
              isLocal: p.socketId === socket.id,
            }))}
          />
          <VolumeSlider />
          {inLobby && !gameStarted && (
            <aside
              className="sidebar-lobby"
              aria-label={t("lobby_title", { count: lobbyPlayers.length })}
            >
              <header className="sidebar-lobby__header">
                <span className="sidebar-lobby__prompt">$</span>
                <span className="sidebar-lobby__title">
                  {t("lobby_title", { count: lobbyPlayers.length })}
                </span>
              </header>
              <ul className="sidebar-lobby__list">
                {lobbyPlayers.map((p) => (
                  <li key={p.id}>
                    {p.name}
                    {p.id === socket.id ? t("lobby_you_suffix") : ""}
                  </li>
                ))}
              </ul>
              <div className="sidebar-lobby__actions">
                <button
                  className="sidebar-lobby__btn"
                  onClick={handleAddBot}
                >
                  {t("lobby_add_bot")}
                </button>
                <button
                  className="sidebar-lobby__btn sidebar-lobby__btn--primary"
                  onClick={handleStartGame}
                  disabled={lobbyPlayers.length < 2}
                >
                  {t("lobby_start_game")}
                </button>
              </div>
            </aside>
          )}
          <button
            className="sidebar__exit"
            onClick={handleQuit}
            aria-label={t("exit_terminal")}
            title={t("exit_terminal")}
          >
            {t("exit_terminal")}
          </button>
        </aside>

        <main className="arena">
          <header className="arena__header">
            <div className="arena__meta">
              {gameStarted &&
                (() => {
                  const me = gamePlayers.find((p) => p.socketId === socket.id);
                  if (!me) return null;
                  const color =
                    PLAYER_THEMES[me.colorIndex % PLAYER_THEMES.length];
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
              <span className="room-count">
                {t("header_players", { count: lobbyPlayers.length })}
              </span>
              <span className="room-code">
                {t("header_room")} <strong>{roomCode}</strong>
              </span>
              <button
                className="header-rules-btn"
                onClick={() => setCheatSheetOpen(true)}
                aria-label={t("rules_header")}
                title={t("rules_header")}
              >
                <span aria-hidden="true">?</span>
                <span className="header-rules-btn__label">
                  {t("rules_header")}
                </span>
              </button>
              <LanguageSwitcher />
            </div>
            {gameStarted && (
              <div className="arena__status">
                {(() => {
                  const myTurn = currentTurn === socket.id;
                  const turnPlayer = gamePlayers.find(
                    (p) => p.socketId === currentTurn,
                  );
                  const turnLabel = myTurn
                    ? t("turn_notification")
                    : t("turn_others", { name: turnPlayer?.name ?? "—" });
                  const lowTime =
                    turnSecondsRemaining != null && turnSecondsRemaining <= 10;
                  const seconds =
                    turnSecondsRemaining != null
                      ? t("turn_seconds_remaining", {
                          seconds: turnSecondsRemaining,
                        })
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
            )}
          </header>

          <div className="arena__board">
            {roomPhase === "scrambling" &&
              scrambleSeed != null &&
              scrambleEndsAt != null && (
                <ScramblePile
                  seed={scrambleSeed}
                  endsAt={scrambleEndsAt}
                  selfColor={localThemeColor}
                  peers={Array.from(peerCursors.values())}
                  onCursorMove={(x, y) =>
                    socket.emit("cursor_move", { x, y })
                  }
                  onVelocity={(velocity) =>
                    socket.emit("scramble_velocity", { velocity })
                  }
                  hypeLevel={hypeLevel}
                  climaxFlash={hypeClimax}
                />
              )}
            {roomPhase !== "scrambling" && (
              <GameBoard
                board={board}
                draftMelds={draftMelds}
                players={gamePlayers}
                themes={[...PLAYER_THEMES]}
                localPlayerId={socket.id ?? ""}
                handCounts={handCounts}
                meldPoints={meldPoints}
                tableHeader={
                  <>
                    {atu && (
                      <div
                        className="atu-slot"
                        title={`${t("atu_label")} — +50`}
                      >
                        <span className="atu-slot__label">
                          {t("atu_label")}
                        </span>
                        <TileComponent tile={atu} />
                        {atuAwardedTo && (
                          <span className="atu-slot__holder">
                            {atuAwardedTo === socket.id
                              ? t("atu_holder_self")
                              : t("atu_holder_other", {
                                  name:
                                    gamePlayers.find(
                                      (p) => p.socketId === atuAwardedTo,
                                    )?.name ?? "—",
                                })}
                          </span>
                        )}
                      </div>
                    )}
                    <DrawPile
                      onClick={drawFromDeck}
                      empty={drawPileCount === 0}
                      disabled={hasDrawn}
                      count={drawPileCount}
                    />
                    <DiscardPile
                      tiles={discardPile}
                      canRupere={isMyTurn && !hasDrawn}
                      onRupere={handleRupere}
                    />
                  </>
                }
              />
            )}
          </div>

          {isMyTurn && (
            <div className="board-actions">
              <button
                className={`etalare-button${meldButton.active ? " etalare-button--active" : " etalare-button--idle"}`}
                onClick={meldButton.onClick}
                disabled={meldButton.disabled}
              >
                {meldButton.label}
              </button>
              {mustUseTileId && (
                <button
                  className="undo-rupere-button"
                  onClick={handleUndoRupere}
                  title={t("meld_btn_undo_title")}
                >
                  {t("meld_btn_undo")}
                </button>
              )}
              <button
                className="end-turn-button"
                onClick={handleEndTurn}
                disabled={!hasDrawn || hand.length === 0}
                title={t("meld_btn_end_turn_title")}
              >
                {t("meld_btn_end_turn")}
              </button>
            </div>
          )}

          <div className="player-console">
            <div className="player-console__bar" role="toolbar">
              <div className="player-console__sorts">
                <button
                  className={`rack-sort${sortMode === "groups" ? " rack-sort--active" : ""}`}
                  onClick={() => setSortMode("groups")}
                >
                  {t("sort_groups")}
                </button>
                <button
                  className={`rack-sort${sortMode === "runs" ? " rack-sort--active" : ""}`}
                  onClick={() => setSortMode("runs")}
                >
                  {t("sort_runs")}
                </button>
                {sortMode !== "none" && (
                  <button
                    className="rack-sort rack-sort--clear"
                    onClick={() => setSortMode("none")}
                  >
                    {t("sort_clear")}
                  </button>
                )}
              </div>
              {gameStarted && (
                <span className="rack-count">
                  {t("rack_count", { count: hand.length })}
                </span>
              )}
            </div>
            <PlayerRack tiles={rackTiles} />
          </div>
        </main>
      </div>

      <DragOverlay>
        {activeTile ? <TileComponent tile={activeTile} /> : null}
      </DragOverlay>

      {isMyTurn && mustUseTileId && (
        <div className="rupere-banner" role="status">
          {t("rupere_banner")}
        </div>
      )}

      {toast && (
        <div className="toast toast--error" role="status">
          {toast}
        </div>
      )}

      {cheatSheetOpen && (
        <>
          <div
            className="cheat-sheet--modal-overlay"
            onClick={() => setCheatSheetOpen(false)}
          />
          <CheatSheet isModal onClose={() => setCheatSheetOpen(false)} />
        </>
      )}

      {gameOver &&
        (() => {
          const mySession =
            gamePlayers.find((p) => p.socketId === socket.id)?.sessionId ?? "";
          const ready = mySession ? readyForNext.includes(mySession) : false;
          // Connected humans = total expected to ready up. Bots are not
          // counted; disconnected humans are not gating the early-out.
          const total = gamePlayers.filter(
            (p) => !p.isBot && p.connectionStatus === "active",
          ).length;
          const expectedSet = new Set(
            gamePlayers
              .filter(
                (p) => !p.isBot && p.connectionStatus === "active",
              )
              .map((p) => p.sessionId),
          );
          const count = readyForNext.filter((s) => expectedSet.has(s)).length;
          const dealAt = scoreboardEndsAt ?? gameOver.nextDealAt;
          // Prefer the AAR overlay when the match_tape has arrived
          // (which it should, milliseconds after game_over). The
          // legacy GameOverModal stays as a fallback in case the tape
          // is missing for any reason.
          if (matchTape) {
            if (showReplay) return null;
            return (
              <AfterActionReport
                tape={matchTape}
                themes={PLAYER_THEMES}
                nextDealAt={dealAt}
                ready={ready}
                readyCount={count}
                readyTotal={total}
                onReady={() => socket.emit("ready_up")}
                onWatchReplay={() => setShowReplay(true)}
                onPlayAgain={handlePlayAgain}
              />
            );
          }
          return (
            <GameOverModal
              winnerName={gameOver.winnerName}
              scores={gameOver.scores}
              closingTile={gameOver.closingTile}
              nextDealAt={dealAt}
              ready={ready}
              readyCount={count}
              readyTotal={total}
              onReady={() => socket.emit("ready_up")}
              onPlayAgain={handlePlayAgain}
            />
          );
        })()}

      {matchTape && showReplay && (
        <ReplayScrubber
          tape={matchTape}
          themes={PLAYER_THEMES}
          onClose={() => setShowReplay(false)}
        />
      )}
    </DndContext>
  );
}

export default App;
