import { useState } from "react";
import "./Landing.css";

interface RoomStatus {
  code: string;
  exists: boolean;
  full: boolean;
  playerCount: number;
  gameStarted: boolean;
}

interface Props {
  initialUsername: string;
  onHost: (name: string) => void;
  onJoin: (name: string, code: string) => void;
  /** Fired whenever the user finishes typing a 4-char code so the
   *  parent can probe room status via the socket. */
  onCheckRoom?: (code: string) => void;
  roomStatus?: RoomStatus | null;
}

export function Landing({
  initialUsername,
  onHost,
  onJoin,
  onCheckRoom,
  roomStatus,
}: Props) {
  const [name, setName] = useState(initialUsername);
  const [code, setCode] = useState("");
  const trimmedName = name.trim();
  const trimmedCode = code.trim().toUpperCase();
  const codeReady = trimmedCode.length === 4;
  const matchesProbed =
    !!roomStatus && roomStatus.code === trimmedCode && codeReady;
  const probedFull = matchesProbed && roomStatus!.full;
  const probedStarted = matchesProbed && roomStatus!.gameStarted;
  const probedMissing = matchesProbed && !roomStatus!.exists;
  const canHost = trimmedName.length > 0;
  // Per Checkpoint 19.1: only enable Join once we've verified via
  // `room_status` that the room exists and is not full / started.
  const canJoin =
    trimmedName.length > 0 &&
    codeReady &&
    matchesProbed &&
    roomStatus!.exists &&
    !roomStatus!.full &&
    !roomStatus!.gameStarted;

  const handleJoin = () => {
    if (!canJoin) return;
    console.log("Landing: Attempting join with", trimmedCode);
    onJoin(trimmedName, trimmedCode);
  };

  return (
    <div className="landing">
      <div className="landing__panel">
        <h1 className="landing__title">ROMMY</h1>
        <p className="landing__subtitle">Romanian Rummy — neon edition</p>

        <label className="landing__label">
          Username
          <input
            className="landing__input"
            type="text"
            maxLength={20}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            autoFocus
          />
        </label>

        <button
          className="landing__btn landing__btn--host"
          disabled={!canHost}
          onClick={() => canHost && onHost(trimmedName)}
        >
          Host Private Game
        </button>

        <div className="landing__divider">— or —</div>

        <label className="landing__label">
          Room Code
          <input
            className="landing__input landing__input--code"
            type="text"
            maxLength={4}
            value={code}
            onChange={(e) => {
              const next = e.target.value.toUpperCase();
              setCode(next);
              if (next.length === 4) onCheckRoom?.(next);
            }}
            placeholder="ABCD"
          />
        </label>
        {matchesProbed && (
          <div className="landing__status">
            {probedMissing && "No room with that code."}
            {probedFull && "Room Full (4/4 players)"}
            {probedStarted &&
              !probedFull &&
              "Game already in progress for that room."}
            {!probedFull &&
              !probedMissing &&
              !probedStarted &&
              `Room found — ${roomStatus!.playerCount}/4 players`}
          </div>
        )}
        <button
          className="landing__btn landing__btn--join"
          disabled={!canJoin}
          onClick={handleJoin}
        >
          {probedFull ? "Room Full" : "Join Game"}
        </button>
      </div>
    </div>
  );
}

export default Landing;
