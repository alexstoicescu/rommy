export type TileColor = "red" | "black" | "blue" | "yellow" | "joker";

export interface Tile {
  id: string;
  color: TileColor;
  value: number;
  isJoker: boolean;
}

export interface Player {
  id: string;
  name: string;
  hand: Tile[];
  hasMeldedInitial: boolean;
}

export type Meld = Tile[];

export interface GameState {
  drawPile: Tile[];
  discardPile: Tile[];
  board: Meld[];
  players: Player[];
  currentPlayerIndex: number;
}

export function generateDeck(): Tile[] {
  const colors: TileColor[] = ["red", "black", "blue", "yellow"];
  const tiles: Tile[] = [];

  for (let copy = 0; copy < 2; copy++) {
    for (const color of colors) {
      for (let value = 1; value <= 13; value++) {
        tiles.push({
          id: `${color}-${value}-${copy}`,
          color,
          value,
          isJoker: false,
        });
      }
    }
  }

  tiles.push({ id: "joker-0", color: "red", value: 0, isJoker: true });
  tiles.push({ id: "joker-1", color: "black", value: 0, isJoker: true });

  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }

  return tiles;
}
