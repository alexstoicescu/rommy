import { useLayoutEffect, useRef } from "react";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { Tile } from "../types/game";
import { TileComponent } from "./TileComponent";
import "./PlayerRack.css";

interface Props {
  tiles: Tile[];
  /** tileId -> slot index (0..43, row-major across 2x22 grid). */
  layout: Record<string, number>;
  /** True while a tile is being dragged — drives the ghost-slot outlines. */
  dragActive?: boolean;
  /** Optional: tile id currently being dragged (so we don't render it twice). */
  draggingId?: string | null;
  /** Selected tile ids (v2.9.4 — visible 15px lift). */
  selectedIds?: Set<string>;
  /** Click handler for tile selection. */
  onTileClick?: (tileId: string) => void;
}

export const RACK_ID = "rack";
export const HAND_GRID_ROWS = 2;
export const HAND_GRID_COLS = 22;
export const HAND_GRID_SLOTS = HAND_GRID_ROWS * HAND_GRID_COLS; // 44

export const slotDroppableId = (idx: number): string => `rack-slot-${idx}`;
export const parseSlotDroppableId = (id: string): number | null => {
  if (!id.startsWith("rack-slot-")) return null;
  const n = Number(id.slice("rack-slot-".length));
  return Number.isInteger(n) ? n : null;
};

/** Single grid cell. Hidden by default; the ghost outline appears
 *  while a drag is in progress (and intensifies when this slot is the
 *  current drop target). */
function RackSlot({
  idx,
  active,
}: {
  idx: number;
  active: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: slotDroppableId(idx) });
  const row = Math.floor(idx / HAND_GRID_COLS) + 1;
  const col = (idx % HAND_GRID_COLS) + 1;
  const cls = [
    "player-rack__slot",
    active ? "player-rack__slot--active" : "",
    isOver ? "player-rack__slot--over" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      ref={setNodeRef}
      className={cls}
      style={{ gridRow: row, gridColumn: col }}
      aria-hidden="true"
    />
  );
}

/** A tile pinned to a specific grid cell. Uses bare useDraggable
 *  rather than useSortable — placement is server-authoritative via
 *  the place_tile_at_slot socket event, not list-style auto-shifting. */
function SlottedTile({
  tile,
  slot,
  hidden,
  selected,
  onClick,
}: {
  tile: Tile;
  slot: number;
  hidden: boolean;
  selected: boolean;
  onClick?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: tile.id });
  const row = Math.floor(slot / HAND_GRID_COLS) + 1;
  const col = (slot % HAND_GRID_COLS) + 1;
  const style: React.CSSProperties = {
    gridRow: row,
    gridColumn: col,
    transform: CSS.Translate.toString(transform),
    opacity: hidden ? 0 : isDragging ? 0.55 : 1,
    cursor: hidden ? "default" : "pointer",
    touchAction: "none",
    pointerEvents: hidden ? "none" : undefined,
  };
  const cls = [
    "sortable-tile",
    "sortable-tile--slot",
    isDragging ? "sortable-tile--dragging" : "",
    selected ? "sortable-tile--selected" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cls}
      data-tile-id={tile.id}
      onClick={(e) => {
        // Suppress click that follows a drag — dnd-kit fires after a
        // drag with no useful semantic.
        if (isDragging) return;
        e.stopPropagation();
        onClick?.();
      }}
      {...attributes}
      {...listeners}
    >
      <TileComponent tile={tile} />
    </div>
  );
}

export function PlayerRack({
  tiles,
  layout,
  dragActive = false,
  draggingId = null,
  selectedIds,
  onTileClick,
}: Props) {
  const { setNodeRef } = useDroppable({ id: RACK_ID });
  const rackContainerRef = useRef<HTMLDivElement | null>(null);
  // FLIP — record the previous bounding rect of every tile so a
  // slot reassignment (drag-drop or sort) animates the move smoothly.
  const prevRectsRef = useRef<Map<string, DOMRect>>(new Map());

  useLayoutEffect(() => {
    const container = rackContainerRef.current;
    if (!container) return;
    const tileEls = container.querySelectorAll<HTMLElement>(
      ".sortable-tile--slot[data-tile-id]",
    );
    const newRects = new Map<string, DOMRect>();
    tileEls.forEach((el) => {
      const id = el.getAttribute("data-tile-id") ?? "";
      if (!id) return;
      const newRect = el.getBoundingClientRect();
      const oldRect = prevRectsRef.current.get(id);
      if (oldRect) {
        const dx = oldRect.left - newRect.left;
        const dy = oldRect.top - newRect.top;
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
          // Cancel any in-flight FLIP so consecutive sorts feel snappy.
          el.getAnimations({ subtree: false }).forEach((a) => a.cancel());
          el.animate(
            [
              { transform: `translate(${dx}px, ${dy}px)` },
              { transform: "translate(0, 0)" },
            ],
            {
              duration: 320,
              easing: "cubic-bezier(0.34, 1.56, 0.64, 1)",
              fill: "both",
              composite: "add",
            },
          );
        }
      }
      newRects.set(id, newRect);
    });
    prevRectsRef.current = newRects;
  });

  // Resolve each tile's slot. If layout is missing an entry (race
  // between server reconcile and broadcast), fall back to position
  // by tile order so we never lose a tile visually.
  const used = new Set<number>();
  const fallback: number[] = [];
  for (let i = 0; i < HAND_GRID_SLOTS; i++) fallback.push(i);
  const slotFor = (tile: Tile): number => {
    const explicit = layout[tile.id];
    if (typeof explicit === "number" && !used.has(explicit)) {
      used.add(explicit);
      return explicit;
    }
    for (const s of fallback) {
      if (!used.has(s)) {
        used.add(s);
        return s;
      }
    }
    return 0;
  };

  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        rackContainerRef.current = el;
      }}
      className="player-rack"
    >
      {Array.from({ length: HAND_GRID_SLOTS }).map((_, i) => (
        <RackSlot key={`slot-${i}`} idx={i} active={dragActive} />
      ))}
      {tiles.map((tile) => (
        <SlottedTile
          key={tile.id}
          tile={tile}
          slot={slotFor(tile)}
          hidden={tile.id === draggingId}
          selected={selectedIds?.has(tile.id) ?? false}
          onClick={
            onTileClick ? () => onTileClick(tile.id) : undefined
          }
        />
      ))}
    </div>
  );
}

export default PlayerRack;
