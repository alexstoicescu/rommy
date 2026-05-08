import { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import type { Tile } from "../types/game";
import { TileComponent } from "./TileComponent";
import "./GameOverModal.css";

interface Props {
  winnerName: string;
  scores: Record<string, number>;
  closingTile: Tile;
  nextDealAt: number;
  /** True once the local player has clicked Ready (button locks). */
  ready: boolean;
  /** How many connected humans have readied + total expected. */
  readyCount: number;
  readyTotal: number;
  onReady: () => void;
  onPlayAgain: () => void;
}

export function GameOverModal({
  winnerName,
  scores,
  closingTile,
  nextDealAt,
  ready,
  readyCount,
  readyTotal,
  onReady,
  onPlayAgain,
}: Props) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);
  const secondsLeft = Math.max(0, Math.ceil((nextDealAt - now) / 1000));

  // Round-only delta table; cumulative standings live in the persistent
  // left-docked Leaderboard now.
  const rows = Object.entries(scores)
    .map(([name, round]) => ({ name, round }))
    .sort((a, b) => b.round - a.round);

  return (
    <div className="game-over-overlay" role="dialog" aria-modal="true">
      <div className="game-over-modal">
        <h2 className="game-over-title">{t("game_over_title")}</h2>
        <p className="game-over-winner">
          <Trans
            i18nKey="game_over_winner"
            values={{ name: winnerName }}
            components={{ strong: <strong /> }}
          />
        </p>

        <div className="game-over-closing">
          <span>{t("game_over_closing")}</span>
          <TileComponent tile={closingTile} />
        </div>

        <table className="game-over-table">
          <thead>
            <tr>
              <th>{t("game_over_player_col")}</th>
              <th>{t("game_over_score_col")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.name}
                className={r.name === winnerName ? "row--winner" : ""}
              >
                <td>{r.name}</td>
                <td>{r.round}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="game-over-countdown" role="status">
          {t("game_over_next_round_in", { seconds: secondsLeft })}
        </div>

        <button
          className={`game-over-ready${ready ? " game-over-ready--done" : ""}`}
          onClick={onReady}
          disabled={ready}
        >
          {ready ? t("ready_btn_done") : t("ready_btn")}
        </button>
        <div className="game-over-ready-status">
          {t("ready_status", { count: readyCount, total: readyTotal })}
        </div>

        <button className="game-over-replay" onClick={onPlayAgain}>
          {t("game_over_replay")}
        </button>
      </div>
    </div>
  );
}

export default GameOverModal;
