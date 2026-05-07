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
  // Sort by score descending (winner naturally rises to the top).
  const rows = Object.entries(scores).sort((a, b) => b[1] - a[1]);

  return (
    <div className="game-over-overlay" role="dialog" aria-modal="true">
      <div className="game-over-modal">
        <h2 className="game-over-title">Round Over</h2>
        <p className="game-over-winner">
          <strong>{winnerName}</strong> closed the round
        </p>

        <div className="game-over-closing">
          <span>Closing tile:</span>
          <TileComponent tile={closingTile} />
        </div>

        <table className="game-over-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Round Score</th>
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
          Play Again
        </button>
      </div>
    </div>
  );
}

export default GameOverModal;
