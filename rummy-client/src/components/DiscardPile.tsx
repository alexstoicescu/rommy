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
  /**
   * v3.5.0 Lean Mode. When true, only tiles whose horizontal slot
   * intersects the visible scroll viewport (plus a 2-tile buffer
   * each side) are rendered as full slots; the rest become
   * zero-cost placeholders that preserve layout width but skip the
   * <TileComponent> + <button> subtree entirely.
   */
  lean?: boolean;
  onRupere?: (tileId: string) => void;
}

export const DISCARD_PILE_ID = "discard-pile";

// v3.5.0 — overlap distance in CSS (matches discard-pile__slot
// margin-left: -8px). Used by the windowing math to translate
// scrollLeft into a tile index.
const SLOT_OVERLAP_PX = 8;
// Buffer rendered on each side of the visible window so a small
// scroll doesn't immediately reveal an unmounted gap.
const WINDOW_BUFFER = 2;
// Fallback used until the first real .tile measurement lands.
// Mid of the v3.1.0 clamp range. Conservative — if it's wrong by
// a few px the window just over-renders, never under-renders.
const FALLBACK_TILE_W = 50;

export function DiscardPile({
  tiles,
  canRupere,
  locked,
  dragActive,
  lean,
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

  // v3.5.0 — Window-based virtualization. When lean=false (or there
  // are very few tiles) we render everything normally. When lean=true
  // we compute [start, end) from the current scrollLeft + clientWidth
  // and only render full slots inside that window; everything else
  // becomes a placeholder that preserves layout width.
  const [windowRange, setWindowRange] = useState<[number, number]>([
    0,
    tiles.length,
  ]);
  useEffect(() => {
    if (!lean) {
      setWindowRange([0, tiles.length]);
      return;
    }
    const el = scrollerRef.current;
    if (!el) return;
    const measureTileWidth = (): number => {
      const slot = el.querySelector<HTMLElement>(".discard-pile__slot .tile");
      if (slot) {
        const w = slot.getBoundingClientRect().width;
        if (w > 0) return w;
      }
      const ph = el.querySelector<HTMLElement>(".discard-pile__placeholder");
      if (ph) {
        const w = ph.getBoundingClientRect().width;
        if (w > 0) return w;
      }
      return FALLBACK_TILE_W;
    };
    const compute = () => {
      const tileW = measureTileWidth();
      const advance = Math.max(1, tileW - SLOT_OVERLAP_PX);
      const left = el.scrollLeft;
      const right = left + el.clientWidth;
      const startIdx = Math.max(
        0,
        Math.floor(left / advance) - WINDOW_BUFFER,
      );
      const endIdx = Math.min(
        tiles.length,
        Math.ceil(right / advance) + WINDOW_BUFFER,
      );
      setWindowRange([startIdx, endIdx]);
    };
    compute();
    el.addEventListener("scroll", compute, { passive: true });
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", compute);
      ro.disconnect();
    };
  }, [lean, tiles.length]);

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
            // v3.5.0 — when lean mode is on, only tiles inside the
            // computed window get a full slot. Everything else is a
            // zero-cost placeholder. Layout width is preserved by
            // the placeholder so scroll geometry stays correct and
            // the drop target hit area remains stable.
            const inWindow =
              !lean || (i >= windowRange[0] && i < windowRange[1]);
            if (!inWindow) {
              return (
                <div
                  key={tile.id}
                  className={
                    "discard-pile__placeholder" +
                    (i === 0 ? " discard-pile__placeholder--first" : "")
                  }
                  aria-hidden="true"
                />
              );
            }
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
