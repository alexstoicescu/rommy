import { memo } from "react";
import type { Tile } from "../types/game";
import "./TileComponent.css";

interface Props {
  tile: Tile;
}

// v3.4.0 Kinetic Zero — wrapped in React.memo so a parent re-render
// (e.g. turn timer ticks driving an App.tsx state change) doesn't
// propagate through every tile in every meld. Tiles only re-render
// when their `tile` reference changes, which on this codebase only
// happens on real server-state mutations.
function TileComponentImpl({ tile }: Props) {
  if (tile.isJoker) {
    return (
      <div className="tile tile--joker" data-color="joker">
        <span className="tile__joker-glyph">J</span>
        <span className="tile__joker-subtext" aria-hidden="true">
          JOKER
        </span>
        <span className="visually-hidden">Joker</span>
      </div>
    );
  }

  return (
    <div className="tile" data-color={tile.color}>
      {tile.value}
    </div>
  );
}

export const TileComponent = memo(TileComponentImpl);

export default TileComponent;
