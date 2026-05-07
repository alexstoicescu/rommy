import type { Tile, TileColor } from "../types/game";
import "./TileComponent.css";

interface Props {
  tile: Tile;
}

const COLOR_MAP: Record<TileColor, string> = {
  red: "red",
  black: "black",
  blue: "blue",
  yellow: "#b8860b",
  joker: "#444", // unused — jokers render via the tile--joker branch
};

export function TileComponent({ tile }: Props) {
  if (tile.isJoker) {
    return <div className="tile tile--joker">Joker</div>;
  }

  return (
    <div className="tile" style={{ color: COLOR_MAP[tile.color] }}>
      {tile.value}
    </div>
  );
}

export default TileComponent;
