import { memo } from "react";
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import type { Tile } from "../types/game";
import { SortableTile } from "./SortableTile";
import { TileComponent } from "./TileComponent";
import "./MeldComponent.css";

interface Props {
  id: string;
  tiles: Tile[];
  /**
   * When false, the meld is droppable but its tiles are not sortable —
   * used for server-confirmed melds where moving tiles is a
   * server-authoritative action (`attach_tile`). Joker tiles inside a
   * non-interactive meld register their own droppable for the joker
   * swap (`replace_joker`).
   */
  interactive?: boolean;
}

interface JokerSlotProps {
  meldId: string;
  tile: Tile;
}

function JokerSlot({ meldId, tile }: JokerSlotProps) {
  // Server-confirmed meld ids look like `board-meld:<ownerId>:<idx>`.
  // The joker slot id collapses to `joker-slot:<ownerId>:<idx>:<jokerId>`
  // so the client/server can parse it with a simple split.
  const meldSuffix = meldId.startsWith("board-meld:")
    ? meldId.slice("board-meld:".length)
    : meldId;
  const slotId = `joker-slot:${meldSuffix}:${tile.id}`;
  const { setNodeRef, isOver } = useDroppable({ id: slotId });
  return (
    <div
      ref={setNodeRef}
      className={`joker-slot${isOver ? " joker-slot--over" : ""}`}
      data-slot-id={slotId}
    >
      <TileComponent tile={tile} />
    </div>
  );
}

function MeldComponentImpl({ id, tiles, interactive = true }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id });

  const isDraft = id.startsWith("draft-meld-");
  const className = `meld${isOver ? " meld--over" : ""}${
    interactive ? "" : " meld--confirmed"
  }${isDraft ? " meld--draft" : ""}`;

  if (!interactive) {
    return (
      <div ref={setNodeRef} className={className} data-meld-id={id}>
        {tiles.map((tile) =>
          tile.isJoker ? (
            <JokerSlot key={tile.id} meldId={id} tile={tile} />
          ) : (
            <TileComponent key={tile.id} tile={tile} />
          ),
        )}
      </div>
    );
  }

  return (
    <div ref={setNodeRef} className={className} data-meld-id={id}>
      <SortableContext
        id={id}
        items={tiles.map((t) => t.id)}
        strategy={horizontalListSortingStrategy}
      >
        {tiles.map((tile) => (
          <SortableTile key={tile.id} tile={tile} />
        ))}
      </SortableContext>
    </div>
  );
}

// v3.4.0 — memoized so the meld zone only repaints melds whose tile
// reference array actually changed (server-driven), not on every
// turn-timer tick.
export const MeldComponent = memo(MeldComponentImpl);

export default MeldComponent;
