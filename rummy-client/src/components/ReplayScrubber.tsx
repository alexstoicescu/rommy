import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MatchEvent, MatchTape } from "../replay/types";
import { GameBoard } from "./GameBoard";
import "./ReplayScrubber.css";

interface Props {
  tape: MatchTape;
  themes: readonly string[];
  onClose: () => void;
}

const SPEEDS = [1, 2, 4] as const;
const BASE_TICK_MS = 700;

/**
 * Replay scrubber. Renders the GameBoard at a specific snapshot in
 * the tape and provides Play / Pause / speed / Scrub controls.
 *
 * Memory hygiene:
 *   - Single setInterval keyed on (playing, speed, length). Cleared
 *     in useEffect cleanup so unmount + dependency changes never
 *     leak a timer.
 *   - All rebuilt props (player list, board map) are useMemo'd off
 *     the current event index so React re-renders are stable.
 *   - Closes via onClose() from the parent — when AAR + tape go
 *     null in App.tsx the whole component tree unmounts.
 */
export function ReplayScrubber({ tape, themes, onClose }: Props) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(0);
  const speed = SPEEDS[speedIdx];
  const lastIndex = Math.max(0, tape.events.length - 1);
  const playingRef = useRef(playing);
  playingRef.current = playing;

  // Auto-advance during playback.
  useEffect(() => {
    if (!playing) return;
    const tick = BASE_TICK_MS / speed;
    const id = window.setInterval(() => {
      setIndex((i) => {
        if (i >= lastIndex) {
          // Reached the end — stop playback. We touch playing via
          // setter rather than ref since the cleanup effect below
          // will tear the interval down.
          setPlaying(false);
          return lastIndex;
        }
        return i + 1;
      });
    }, tick);
    return () => window.clearInterval(id);
  }, [playing, speed, lastIndex]);

  const event: MatchEvent | undefined = tape.events[index];

  // Rebuild the GameBoard's expected shape from the session-keyed
  // snapshot. We use sessionId as the identity for `socketId` —
  // GameBoard treats it as an opaque map key.
  const boardProps = useMemo(() => {
    if (!event) {
      return null;
    }
    const snap = event.snapshot;
    const players = tape.players.map((p) => ({
      socketId: p.sessionId,
      name: p.name,
      hasMeldedInitial: (snap.board[p.sessionId] ?? []).length > 0,
      colorIndex: p.colorIndex,
      connectionStatus: "active" as const,
    }));
    const handCounts: Record<string, number> = {};
    for (const p of tape.players) {
      handCounts[p.sessionId] = (snap.hands[p.sessionId] ?? []).length;
    }
    // meldPoints derived from server-provided meldedScores (no need
    // to re-score). It's good enough for the replay overlay since
    // the user only wants to see the board state.
    const meldPoints: Record<string, number> = { ...snap.meldedScores };
    return { snap, players, handCounts, meldPoints };
  }, [event, tape.players]);

  const totalEvents = tape.events.length;
  const ts = event?.ts ?? tape.startedAt;
  const elapsedSec = Math.max(0, Math.round((ts - tape.startedAt) / 1000));

  return (
    <div className="replay" role="dialog" aria-modal="true">
      <div className="replay__shell">
        <header className="replay__bar">
          <button
            className="replay__btn"
            onClick={() => {
              if (index >= lastIndex && !playing) setIndex(0);
              setPlaying((p) => !p);
            }}
          >
            {playing ? "⏸" : "▶"}
          </button>
          <button
            className="replay__btn replay__btn--speed"
            onClick={() => setSpeedIdx((s) => (s + 1) % SPEEDS.length)}
            title={t("replay_speed")}
          >
            {speed}x
          </button>
          <input
            type="range"
            min={0}
            max={lastIndex}
            value={index}
            onChange={(e) => {
              setIndex(Number(e.currentTarget.value));
              if (playing) setPlaying(false);
            }}
            className="replay__scrub"
            aria-label={t("replay_scrub_aria")}
          />
          <span className="replay__counter">
            {index + 1}/{totalEvents}
          </span>
          <span className="replay__elapsed">+{elapsedSec}s</span>
          <button
            className="replay__btn replay__btn--close"
            onClick={onClose}
            aria-label={t("replay_close")}
          >
            ×
          </button>
        </header>

        {boardProps && (
          <div className="replay__stage">
            <GameBoard
              board={boardProps.snap.board}
              draftMelds={[]}
              players={boardProps.players}
              themes={[...themes]}
              localPlayerId=""
              handCounts={boardProps.handCounts}
              meldPoints={boardProps.meldPoints}
            />
            <div className="replay__caption">
              <span className="replay__type">{event?.type}</span>
              {event?.actor && (
                <span className="replay__actor">
                  {tape.players.find((p) => p.sessionId === event.actor)?.name ??
                    "—"}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ReplayScrubber;
