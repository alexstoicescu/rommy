import type { Tile } from "../types/game";
import "./TileComponent.css";

interface Props {
  tile: Tile;
}

export function TileComponent({ tile }: Props) {
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

export default TileComponent;
