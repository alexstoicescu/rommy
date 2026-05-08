import type { Tile } from "../types/game";
import "./TileComponent.css";

interface Props {
  tile: Tile;
}

export function TileComponent({ tile }: Props) {
  if (tile.isJoker) {
    return (
      <div className="tile tile--joker" data-color="joker">
        Joker
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
