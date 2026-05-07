import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Tile } from "../types/game";
import { TileComponent } from "./TileComponent";

interface Props {
  tile: Tile;
  style?: React.CSSProperties;
}

export function SortableTile({ tile, style: outerStyle }: Props) {
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
      <TileComponent tile={tile} />
    </div>
  );
}

export default SortableTile;
