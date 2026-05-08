import { Trans, useTranslation } from "react-i18next";
import type { Tile } from "../types/game";
import { TileComponent } from "./TileComponent";
import "./GameOverModal.css";

interface Props {
  winnerName: string;
  scores: Record<string, number>;
  closingTile: Tile;
  onPlayAgain: () => void;
}

export function GameOverModal({
  winnerName,
  scores,
  closingTile,
  onPlayAgain,
}: Props) {
  const { t } = useTranslation();
  const rows = Object.entries(scores).sort((a, b) => b[1] - a[1]);

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
            {rows.map(([name, score]) => (
              <tr
                key={name}
                className={name === winnerName ? "row--winner" : ""}
              >
                <td>{name}</td>
                <td>{score}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <button className="game-over-replay" onClick={onPlayAgain}>
          {t("game_over_replay")}
        </button>
      </div>
    </div>
  );
}

export default GameOverModal;
