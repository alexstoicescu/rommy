import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import type { Tile } from "../types/game";
import { SortableTile } from "./SortableTile";
import "./PlayerRack.css";

interface Props {
  tiles: Tile[];
}

export const RACK_ID = "rack";

export function PlayerRack({ tiles }: Props) {
  const { setNodeRef } = useDroppable({ id: RACK_ID });

  return (
    <div ref={setNodeRef} className="player-rack">
      <SortableContext
        id={RACK_ID}
        items={tiles.map((t) => t.id)}
        strategy={horizontalListSortingStrategy}
      >
        {tiles.map((tile, i) => (
          <SortableTile
            key={tile.id}
            tile={tile}
            style={{ ["--idx" as string]: i }}
          />
        ))}
      </SortableContext>
    </div>
  );
}

export default PlayerRack;
