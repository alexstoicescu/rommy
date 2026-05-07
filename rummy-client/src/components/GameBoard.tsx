import { useDroppable } from "@dnd-kit/core";
import type { Tile } from "../types/game";
import { MeldComponent } from "./MeldComponent";
import "./GameBoard.css";

interface BoardPlayer {
  socketId: string;
  name: string;
  hasMeldedInitial: boolean;
  colorIndex: number;
}

interface Props {
  board: Record<string, Tile[][]>;
  draftMelds: Tile[][];
  players: BoardPlayer[];
  themes: string[];
  localPlayerId: string;
  handCounts: Record<string, number>;
  meldPoints: Record<string, number>;
}

const NEW_MELD_ID = "board-new-meld";

export function GameBoard({
  board,
  draftMelds,
  players,
  themes,
  localPlayerId,
  handCounts,
  meldPoints,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: NEW_MELD_ID });

  const meldedPlayers = players.filter((p) => p.hasMeldedInitial);

  return (
    <div className="game-board" aria-label="Game board">
      <div className="game-board__zones">
        {meldedPlayers.length === 0 && (
          <div className="game-board__empty-hint">
            Awaiting the first Etalare…
          </div>
        )}
        {meldedPlayers.map((p) => {
          const color = themes[p.colorIndex % themes.length] ?? themes[0];
          const melds = board[p.socketId] ?? [];
          const isLocal = p.socketId === localPlayerId;
          const points = meldPoints[p.socketId] ?? 0;
          const cards = handCounts[p.socketId] ?? 0;
          const lowCards = !isLocal && cards > 0 && cards <= 3;
          return (
            <div
              key={p.socketId}
              className="player-zone"
              style={{
                borderColor: color,
                boxShadow: `0 0 14px ${color}33, inset 0 0 8px ${color}22`,
                ["--theme-color" as string]: color,
              }}
            >
              <div
                className="player-zone__header"
                style={{ color, borderBottomColor: `${color}55` }}
              >
                <span>{isLocal ? "Your Melds" : `${p.name}'s Melds`}</span>
                <span className="player-zone__stats">
                  <span className="player-zone__points">Points: {points}</span>
                  {!isLocal && (
                    <span className="player-zone__cards">Cards: {cards}</span>
                  )}
                  {lowCards && (
                    <span className="player-zone__warn">
                      ⚠️ {cards} TILES
                    </span>
                  )}
                </span>
              </div>
              <div className="player-zone__melds">
                {melds.length === 0 ? (
                  <div className="player-zone__empty">No melds yet</div>
                ) : (
                  melds.map((tiles, i) => (
                    <MeldComponent
                      key={`board-meld:${p.socketId}:${i}`}
                      id={`board-meld:${p.socketId}:${i}`}
                      tiles={tiles}
                      interactive={false}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}

        {draftMelds.length > 0 && (
          <div className="player-zone player-zone--draft">
            <div className="player-zone__header player-zone__header--draft">
              Drafting (not yet committed)
            </div>
            <div className="player-zone__melds">
              {draftMelds.map((tiles, i) => (
                <MeldComponent
                  key={`draft-meld-${i}`}
                  id={`draft-meld-${i}`}
                  tiles={tiles}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div
        ref={setNodeRef}
        className={`game-board__new-meld${isOver ? " game-board__new-meld--over" : ""}`}
      >
        Drop here to start a new meld
      </div>
    </div>
  );
}

export default GameBoard;
