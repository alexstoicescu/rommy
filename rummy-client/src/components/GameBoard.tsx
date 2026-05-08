import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { useTranslation } from "react-i18next";
import type { Tile } from "../types/game";
import { MeldComponent } from "./MeldComponent";
import "./GameBoard.css";

interface BoardPlayer {
  socketId: string;
  name: string;
  hasMeldedInitial: boolean;
  colorIndex: number;
  connectionStatus?: "active" | "disconnected";
}

interface Props {
  board: Record<string, Tile[][]>;
  draftMelds: Tile[][];
  players: BoardPlayer[];
  themes: string[];
  localPlayerId: string;
  handCounts: Record<string, number>;
  meldPoints: Record<string, number>;
  /** Atu / Draw / Discard ride inside the green table's header strip. */
  tableHeader?: ReactNode;
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
  tableHeader,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: NEW_MELD_ID });
  const { t } = useTranslation();

  const meldedPlayers = players.filter((p) => p.hasMeldedInitial);

  return (
    <div className="game-board" aria-label={t("board_aria")}>
      {tableHeader && (
        <div className="table-header" role="region" aria-label="Dealer">
          {tableHeader}
        </div>
      )}
      <div className="meld-zone game-board__zones">
        {meldedPlayers.length === 0 && (
          <div className="game-board__empty-hint">
            {t("board_empty_hint")}
          </div>
        )}
        {meldedPlayers.map((p) => {
          const color = themes[p.colorIndex % themes.length] ?? themes[0];
          const melds = board[p.socketId] ?? [];
          const isLocal = p.socketId === localPlayerId;
          const points = meldPoints[p.socketId] ?? 0;
          const cards = handCounts[p.socketId] ?? 0;
          const lowCards = !isLocal && cards > 0 && cards <= 3;
          const isOffline = p.connectionStatus === "disconnected";
          return (
            <div
              key={p.socketId}
              className={`player-zone${isOffline ? " player-zone--offline" : ""}`}
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
                <span>
                  {isLocal
                    ? t("board_your_melds")
                    : t("board_others_melds", { name: p.name })}
                </span>
                <span className="player-zone__stats">
                  <span className="player-zone__points">
                    {t("board_points", { points })}
                  </span>
                  {!isLocal && (
                    <span className="player-zone__cards">
                      {t("board_cards", { cards: cards <= 3 ? cards : "3+" })}
                    </span>
                  )}
                  {lowCards && (
                    <span className="player-zone__warn">
                      {t("board_warn", { cards })}
                    </span>
                  )}
                </span>
              </div>
              <div className="player-zone__melds">
                {melds.length === 0 ? (
                  <div className="player-zone__empty">{t("board_no_melds")}</div>
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
              {t("board_drafting")}
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
        {t("board_drop_zone")}
      </div>
    </div>
  );
}

export default GameBoard;
