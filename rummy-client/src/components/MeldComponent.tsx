import { memo, useMemo } from "react";
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import type { Tile } from "../types/game";
import { jokerGhostRanks } from "../rules";
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
  /** v3.6.0 — rank the joker is currently representing in this meld. */
  ghostRank?: number | null;
}

function JokerSlot({ meldId, tile, ghostRank }: JokerSlotProps) {
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
      <TileComponent tile={tile} ghostRank={ghostRank} />
    </div>
  );
}

function MeldComponentImpl({ id, tiles, interactive = true }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id });

  const isDraft = id.startsWith("draft-meld-");
  const className = `meld${isOver ? " meld--over" : ""}${
    interactive ? "" : " meld--confirmed"
  }${isDraft ? " meld--draft" : ""}`;

  // v3.6.0 — Joker ghost-rank. For confirmed (non-interactive) melds
  // the meld is server-validated so we always get a Map back. For
  // draft melds the player may be mid-edit; jokerGhostRanks returns
  // null on invalid drafts and the tile renders the bare "J".
  // Memoized on the tile array reference so we don't reify on every
  // turn-timer tick.
  const ghostByTileId = useMemo(
    () => jokerGhostRanks(tiles) ?? new Map<string, number>(),
    [tiles],
  );

  if (!interactive) {
    return (
      <div ref={setNodeRef} className={className} data-meld-id={id}>
        {tiles.map((tile) =>
          tile.isJoker ? (
            <JokerSlot
              key={tile.id}
              meldId={id}
              tile={tile}
              ghostRank={ghostByTileId.get(tile.id) ?? null}
            />
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
          <SortableTile
            key={tile.id}
            tile={tile}
            ghostRank={
              tile.isJoker ? (ghostByTileId.get(tile.id) ?? null) : null
            }
          />
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
