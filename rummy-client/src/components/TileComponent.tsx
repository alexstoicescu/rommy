import { memo } from "react";
import type { Tile } from "../types/game";
import "./TileComponent.css";

interface Props {
  tile: Tile;
  /**
   * v3.6.0 — when this joker is sitting in a recognized valid meld,
   * MeldComponent passes down the rank the joker is currently
   * representing. Rendered as a faint ghost glyph behind the "J"
   * so players can see why their meld was accepted. Ignored on
   * non-joker tiles.
   */
  ghostRank?: number | null;
}

// v3.4.0 Kinetic Zero — wrapped in React.memo so a parent re-render
// (e.g. turn timer ticks driving an App.tsx state change) doesn't
// propagate through every tile in every meld. Tiles only re-render
// when their `tile` reference changes, which on this codebase only
// happens on real server-state mutations.
function TileComponentImpl({ tile, ghostRank }: Props) {
  if (tile.isJoker) {
    return (
      <div className="tile tile--joker" data-color="joker">
        {ghostRank != null && (
          <span className="tile__joker-ghost" aria-hidden="true">
            {ghostRank}
          </span>
        )}
        <span className="tile__joker-glyph">J</span>
        <span className="tile__joker-subtext" aria-hidden="true">
          JOKER
        </span>
        <span className="visually-hidden">
          {ghostRank != null ? `Joker as ${ghostRank}` : "Joker"}
        </span>
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
