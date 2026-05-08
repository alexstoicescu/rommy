import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { getSignatureId } from "../identity";
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
  // Export Link button state — "idle" / "ok" / "fail" with a 1.5s
  // auto-revert. The setTimeout is cleaned in the effect cleanup so
  // unmounting the modal mid-flash never leaks the timer.
  const [exportFlash, setExportFlash] = useState<"idle" | "ok" | "fail">(
    "idle",
  );
  const flashTimerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (flashTimerRef.current != null) {
        window.clearTimeout(flashTimerRef.current);
      }
    };
  }, []);
  const handleExport = async () => {
    const sig = getSignatureId();
    if (!sig) {
      setExportFlash("fail");
      return;
    }
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(sig);
        copied = true;
      }
    } catch {
      copied = false;
    }
    if (!copied) {
      // Last-resort fallback for browsers blocking the async API.
      try {
        const ta = document.createElement("textarea");
        ta.value = sig;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        copied = true;
      } catch {
        copied = false;
      }
    }
    setExportFlash(copied ? "ok" : "fail");
    if (flashTimerRef.current != null) {
      window.clearTimeout(flashTimerRef.current);
    }
    flashTimerRef.current = window.setTimeout(() => {
      setExportFlash("idle");
      flashTimerRef.current = null;
    }, 1500);
  };
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

        <button
          type="button"
          className={`landing__export landing__export--${exportFlash}`}
          onClick={handleExport}
          title={t("landing_export_title")}
        >
          {exportFlash === "ok"
            ? t("landing_export_done")
            : exportFlash === "fail"
              ? t("landing_export_fail")
              : t("landing_export_btn")}
        </button>

        <div className="landing__version">v2.8.2 - FINAL AUDIT PASS</div>
      </div>
    </div>
  );
}

export default Landing;
