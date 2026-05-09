import { useEffect, useRef, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { useTranslation } from "react-i18next";
import type { Tile } from "../types/game";
import { TileComponent } from "./TileComponent";
import "./DiscardPile.css";

// v3.3.0 Fluid Disposal — wheel multiplier. Roughly 1.2× the raw
// deltaY gives a tactile, slightly accelerated feel without
// overshooting on a single notch of a discrete mouse wheel.
const WHEEL_MULTIPLIER = 1.2;

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
  /**
   * v2.9.3 magnetic-target hint. True when the local player is mid-
   * drag AND it's legal for them to discard right now (their turn,
   * post-draw, no rupere obligation pending). Triggers the pulsing
   * magenta target glow + extends the droppable hit area by ~20px.
   */
  dragActive?: boolean;
  onRupere?: (tileId: string) => void;
}

export const DISCARD_PILE_ID = "discard-pile";

export function DiscardPile({
  tiles,
  canRupere,
  locked,
  dragActive,
  onRupere,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: DISCARD_PILE_ID });
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const { t } = useTranslation();
  // v3.3.0 — Horizontal Wheel Navigation. Vertical wheel deltas are
  // redirected into scrollLeft so a regular mouse wheel can pan the
  // pile horizontally. Native horizontal trackpad gestures (deltaX)
  // still bubble through unchanged.
  //
  // The listener is passive (`{ passive: true }`) — we never call
  // preventDefault, which lets the browser keep its compositor-level
  // scroll perf intact even during heavy game ticks. Vertical wheel
  // events have nowhere else to scroll on this surface (every
  // ancestor has overflow:hidden and the meld-zone is a sibling, not
  // an ancestor), so the missing preventDefault is a no-op in
  // practice.
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      el.scrollLeft += e.deltaY * WHEEL_MULTIPLIER;
    };
    el.addEventListener("wheel", onWheel, { passive: true });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  // Compose the dnd-kit droppable ref with our local scroller ref so
  // the same DOM node serves both purposes.
  const composedRef = (node: HTMLDivElement | null) => {
    setNodeRef(node);
    scrollerRef.current = node;
  };

  const lastIdx = tiles.length - 1;
  const interactive = !!canRupere && !locked;

  const containerCls = [
    "discard-pile",
    isOver ? "discard-pile--over" : "",
    locked ? "discard-pile--locked" : "",
    dragActive ? "discard-pile--drag-active" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={composedRef}
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
