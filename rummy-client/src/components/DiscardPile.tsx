import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { useTranslation } from "react-i18next";
import type { Tile } from "../types/game";
import { TileComponent } from "./TileComponent";
import "./DiscardPile.css";

interface Props {
  tiles: Tile[];
  /**
   * Whether the local player can currently rupere from the pile.
   * The server enforces the actual rule (turn + !hasDrawn + rule A/B);
   * this is just a UI gate to avoid emitting noise.
   */
  canRupere?: boolean;
  /**
   * Round-1 lockout: while the pile is shorter than the player count
   * the server rejects every Rupere. Reflect that visually so users
   * don't waste clicks.
   */
  locked?: boolean;
  onRupere?: (tileId: string) => void;
}

export const DISCARD_PILE_ID = "discard-pile";

export function DiscardPile({
  tiles,
  canRupere,
  locked,
  onRupere,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: DISCARD_PILE_ID });
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const { t } = useTranslation();

  const lastIdx = tiles.length - 1;
  const interactive = !!canRupere && !locked;

  const containerCls = [
    "discard-pile",
    isOver ? "discard-pile--over" : "",
    locked ? "discard-pile--locked" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={setNodeRef}
      className={containerCls}
      aria-label={t("discard_aria_pile")}
      title={locked ? t("discard_locked_title") : undefined}
    >
      {tiles.length === 0 ? (
        <div className="discard-pile__empty">{t("discard")}</div>
      ) : (
        <div
          className="discard-pile__fan"
          onMouseLeave={() => setHoverIdx(null)}
        >
          {tiles.map((tile, i) => {
            const willTake =
              interactive &&
              hoverIdx != null &&
              i >= hoverIdx &&
              i <= lastIdx;
            const cls = [
              "discard-pile__slot",
              i === 0 ? "discard-pile__slot--first" : "",
              willTake ? "discard-pile__slot--will-take" : "",
              interactive ? "discard-pile__slot--clickable" : "",
              locked ? "discard-pile__slot--locked" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button
                key={tile.id}
                type="button"
                className={cls}
                disabled={!interactive}
                style={{ zIndex: i + 1 }}
                onMouseEnter={() => setHoverIdx(i)}
                onFocus={() => setHoverIdx(i)}
                onClick={() => onRupere?.(tile.id)}
                aria-label={
                  interactive
                    ? t("discard_rupere_aria", { after: lastIdx - i })
                    : locked
                      ? t("discard_locked_aria")
                      : t("discard_tile_aria", { n: i + 1 })
                }
              >
                <TileComponent tile={tile} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default DiscardPile;
