// Tactical Spatial Rack (v2.9) — slot grid math.
//
// The 2-row × 22-col grid gives every player up to 44 named slots
// (indices 0..43, row-major). Player.handLayout is a sparse map
// of tileId -> slotIndex; tiles in hand without a layout entry are
// auto-placed at the first free slot the next time the room is
// broadcast.
//
// Invariants enforced by every helper here:
//   - Every entry in handLayout maps to a unique slot in [0, SLOTS).
//   - Every layout key corresponds to a tile actually in player.hand.
//   - No tile in player.hand is missing from handLayout (auto-fill).

import type { Player } from "./GameState";
import {
  isValidFormatie,
  isValidSuita,
  type Tile,
} from "./GameRules";

export const HAND_GRID_ROWS = 2;
export const HAND_GRID_COLS = 22;
export const HAND_GRID_SLOTS = HAND_GRID_ROWS * HAND_GRID_COLS;

/** Sort modes mirrored from the client's existing rack-sort options. */
export type HandSortMode = "groups" | "runs";

export function rowOf(slot: number): number {
  return Math.floor(slot / HAND_GRID_COLS);
}

export function colOf(slot: number): number {
  return slot % HAND_GRID_COLS;
}

export function slotAt(row: number, col: number): number {
  return row * HAND_GRID_COLS + col;
}

/** Return a Set of slot indices currently occupied by hand tiles. */
function usedSlots(player: Player): Set<number> {
  const used = new Set<number>();
  for (const slot of Object.values(player.handLayout)) {
    used.add(slot);
  }
  return used;
}

/** Walk slots 0..SLOTS-1 and return the first one not already used. */
export function firstFreeSlot(player: Player): number {
  const used = usedSlots(player);
  for (let i = 0; i < HAND_GRID_SLOTS; i++) {
    if (!used.has(i)) return i;
  }
  // Saturated grid (shouldn't happen — hands are 14-15 tiles).
  return 0;
}

/**
 * Make sure every tile in player.hand has a valid layout entry and
 * every layout entry references a tile that's actually in hand.
 * Used after every mutation as a paranoia step — drops orphans and
 * fills missing positions cheaply (O(hand)).
 */
export function reconcileHandLayout(player: Player): void {
  const handIds = new Set(player.hand.map((t) => t.id));
  // Drop orphan layout entries.
  for (const tid of Object.keys(player.handLayout)) {
    if (!handIds.has(tid)) {
      delete player.handLayout[tid];
    }
  }
  // Fill any tiles missing a slot.
  for (const tile of player.hand) {
    if (player.handLayout[tile.id] == null) {
      player.handLayout[tile.id] = firstFreeSlot(player);
    }
  }
  // Defensive: collapse duplicate slot assignments. Keep the first
  // occurrence per slot, push collisions to fresh free slots.
  const seen = new Map<number, string>();
  for (const tile of player.hand) {
    const slot = player.handLayout[tile.id];
    if (seen.has(slot)) {
      player.handLayout[tile.id] = firstFreeSlot(player);
    } else {
      seen.set(slot, tile.id);
    }
  }
}

/**
 * Add a freshly-acquired tile to the hand and place it at the first
 * free slot. Use this for draws, rupere'd tiles, etc.
 */
export function addTileWithSlot(player: Player, tile: Tile): void {
  player.hand.push(tile);
  player.handLayout[tile.id] = firstFreeSlot(player);
}

/** Remove a tile from hand and free its slot. */
export function removeTileFromHand(player: Player, tileId: string): void {
  player.hand = player.hand.filter((t) => t.id !== tileId);
  delete player.handLayout[tileId];
}

/** Remove a set of tiles in one pass — used by etalare / play_meld. */
export function removeTilesFromHand(
  player: Player,
  tileIds: Iterable<string>,
): void {
  const ids = new Set(tileIds);
  player.hand = player.hand.filter((t) => !ids.has(t.id));
  for (const id of ids) delete player.handLayout[id];
}

/**
 * Move a tile to a target slot. Implements the v2.9 spec:
 *   - Empty target           -> direct move.
 *   - Occupied + space right -> shift the affected stretch one
 *                                slot to the right within the row.
 *   - Occupied + row full    -> swap (occupant moves to the dragged
 *                                tile's old slot).
 *
 * Returns true on success, false if the operation is rejected
 * (unknown tile, target out of range, etc.).
 */
export function placeTileAtSlot(
  player: Player,
  tileId: string,
  targetSlot: number,
): boolean {
  if (
    !Number.isInteger(targetSlot) ||
    targetSlot < 0 ||
    targetSlot >= HAND_GRID_SLOTS
  ) {
    return false;
  }
  if (!player.hand.some((t) => t.id === tileId)) return false;
  const oldSlot = player.handLayout[tileId];
  if (oldSlot === targetSlot) return true;
  // Temporarily release the dragged tile's slot so we can compute a
  // clean view of which slots are still occupied.
  delete player.handLayout[tileId];
  // Find any tile occupying the target slot.
  let occupantId: string | null = null;
  for (const [tid, idx] of Object.entries(player.handLayout)) {
    if (idx === targetSlot) {
      occupantId = tid;
      break;
    }
  }
  if (occupantId == null) {
    // Target was empty — simple move.
    player.handLayout[tileId] = targetSlot;
    return true;
  }
  // Target is occupied. Walk the row to the right looking for a gap
  // we can shift into.
  const row = rowOf(targetSlot);
  const col = colOf(targetSlot);
  const rowOccupants = new Map<number, string>(); // col -> tileId
  for (const [tid, idx] of Object.entries(player.handLayout)) {
    if (rowOf(idx) === row) {
      rowOccupants.set(colOf(idx), tid);
    }
  }
  let firstEmptyCol = -1;
  for (let c = col; c < HAND_GRID_COLS; c++) {
    if (!rowOccupants.has(c)) {
      firstEmptyCol = c;
      break;
    }
  }
  if (firstEmptyCol > col) {
    // Shift the contiguous run [col .. firstEmptyCol-1] one slot right.
    // Walk RIGHT-to-LEFT so each tile moves into a now-vacated slot.
    for (let c = firstEmptyCol - 1; c >= col; c--) {
      const tid = rowOccupants.get(c);
      if (tid) {
        player.handLayout[tid] = slotAt(row, c + 1);
      }
    }
    player.handLayout[tileId] = targetSlot;
    return true;
  }
  // Row is full from col onward — swap. Occupant takes the dragged
  // tile's old slot. If the dragged tile had no prior slot (shouldn't
  // happen because reconcile fills before placement), fall back to a
  // free slot.
  const fallbackSlot =
    typeof oldSlot === "number" ? oldSlot : firstFreeSlot(player);
  player.handLayout[occupantId] = fallbackSlot;
  player.handLayout[tileId] = targetSlot;
  return true;
}

// === Sort comparators (mirror of rummy-client/src/App.tsx) ===
function compareByGroups(a: Tile, b: Tile): number {
  if (a.isJoker !== b.isJoker) return a.isJoker ? 1 : -1;
  if (a.value !== b.value) return a.value - b.value;
  return a.color.localeCompare(b.color);
}
function compareByRuns(a: Tile, b: Tile): number {
  if (a.isJoker !== b.isJoker) return a.isJoker ? 1 : -1;
  if (a.color !== b.color) return a.color.localeCompare(b.color);
  return a.value - b.value;
}

/**
 * Reset the layout: sort the hand by mode and assign slots 0..N-1
 * in the top row. Per spec, this destroys any custom arrangement.
 */
export function sortHand(player: Player, mode: HandSortMode): void {
  const cmp = mode === "groups" ? compareByGroups : compareByRuns;
  const ordered = [...player.hand].sort(cmp);
  player.handLayout = {};
  ordered.forEach((tile, i) => {
    player.handLayout[tile.id] = i;
  });
}

// Re-export validators used by hand-related callers elsewhere.
export { isValidFormatie, isValidSuita };
