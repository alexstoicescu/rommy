import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "./LanguageSwitcher";
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
  const { t } = useTranslation();
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
        <div className="landing__lang">
          <LanguageSwitcher />
        </div>
        <h1 className="landing__title">ROMMY</h1>
        <p className="landing__subtitle">{t("landing_subtitle")}</p>

        <label className="landing__label">
          {t("landing_username")}
          <input
            className="landing__input"
            type="text"
            maxLength={20}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("landing_username_placeholder")}
            autoFocus
          />
        </label>

        <button
          className="landing__btn landing__btn--host"
          disabled={!canHost}
          onClick={() => canHost && onHost(trimmedName)}
        >
          {t("landing_host_btn")}
        </button>

        <div className="landing__divider">{t("landing_or")}</div>

        <label className="landing__label">
          {t("landing_room_code")}
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
            {probedMissing && t("landing_status_no_room")}
            {probedFull && t("landing_status_full")}
            {probedStarted && !probedFull && t("landing_status_started")}
            {!probedFull &&
              !probedMissing &&
              !probedStarted &&
              t("landing_status_found", { count: roomStatus!.playerCount })}
          </div>
        )}
        <button
          className="landing__btn landing__btn--join"
          disabled={!canJoin}
          onClick={handleJoin}
        >
          {probedFull ? t("landing_room_full_btn") : t("landing_join_btn")}
        </button>

        <div className="landing__version">v2.5.0 — THE FRIENDS UPDATE</div>
      </div>
    </div>
  );
}

export default Landing;
