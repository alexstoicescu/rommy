import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Tile } from "../types/game";
import { TileComponent } from "./TileComponent";

interface Props {
  tile: Tile;
  style?: React.CSSProperties;
  /** v3.6.0 — pass-through to TileComponent for joker ghost-rank. */
  ghostRank?: number | null;
}

export function SortableTile({ tile, style: outerStyle, ghostRank }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: tile.id });

  const style: React.CSSProperties = {
    ...outerStyle,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: "grab",
    touchAction: "none",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="sortable-tile"
      {...attributes}
      {...listeners}
    >
      <TileComponent tile={tile} ghostRank={ghostRank} />
    </div>
  );
}

export default SortableTile;
