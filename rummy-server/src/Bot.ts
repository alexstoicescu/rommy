// Minimal greedy "Rami" bot. Plays correct moves but does not look ahead;
// it tries to drop melds, attach what it can, and discards the highest-value
// tile that isn't part of an obvious group.

import {
  canInitialMeld,
  isValidFormatie,
  isValidSuita,
  type Tile,
  type TileColor,
} from "./GameRules";

const COLORS: TileColor[] = ["red", "black", "blue", "yellow"];

/**
 * All maximal same-color consecutive runs of length >=3 in the hand.
 * Jokers are ignored at this layer — bots don't try to wildcard their
 * way into melds (keeps the heuristic predictable).
 */
function findRuns(hand: Tile[]): Tile[][] {
  const out: Tile[][] = [];
  for (const color of COLORS) {
    const sorted = hand
      .filter((t) => !t.isJoker && t.color === color)
      .sort((a, b) => a.value - b.value)
      .filter((t, i, arr) => i === 0 || arr[i - 1].value !== t.value);
    let run: Tile[] = [];
    for (const t of sorted) {
      if (run.length === 0 || t.value === run[run.length - 1].value + 1) {
        run.push(t);
      } else {
        if (run.length >= 3) out.push([...run]);
        run = [t];
      }
    }
    if (run.length >= 3) out.push(run);
  }
  return out;
}

/**
 * Sets at every value where the hand has tiles of >=3 distinct colors.
 */
function findSets(hand: Tile[]): Tile[][] {
  const out: Tile[][] = [];
  for (let v = 1; v <= 13; v++) {
    const byColor = new Map<TileColor, Tile>();
    for (const t of hand) {
      if (!t.isJoker && t.value === v && !byColor.has(t.color)) {
        byColor.set(t.color, t);
      }
    }
    if (byColor.size >= 3) out.push([...byColor.values()]);
  }
  return out;
}

/**
 * Try to assemble a legal Etalare from the bot's hand: a non-overlapping
 * pick of melds that includes at least one Suita and totals >=45 points.
 * Returns null if no such pick is found.
 */
export function tryEtalare(hand: Tile[]): Tile[][] | null {
  const runs = findRuns(hand);
  const sets = findSets(hand);
  const picked: Tile[][] = [];
  const used = new Set<string>();

  // Initial drop requires a Suita, so try runs first.
  for (const m of runs) {
    if (m.some((t) => used.has(t.id))) continue;
    picked.push(m);
    for (const t of m) used.add(t.id);
    if (canInitialMeld(picked)) return picked;
  }
  for (const m of sets) {
    if (m.some((t) => used.has(t.id))) continue;
    picked.push(m);
    for (const t of m) used.add(t.id);
    if (canInitialMeld(picked)) return picked;
  }
  return null;
}

/** Non-overlapping melds the bot can play after Etalare. */
export function tryNewMelds(hand: Tile[]): Tile[][] {
  const out: Tile[][] = [];
  const used = new Set<string>();
  for (const m of [...findRuns(hand), ...findSets(hand)]) {
    if (m.some((t) => used.has(t.id))) continue;
    if (!isValidSuita(m) && !isValidFormatie(m)) continue;
    out.push(m);
    for (const t of m) used.add(t.id);
  }
  return out;
}

/**
 * Find a hand tile + (zone owner, meld index) where the tile attaches.
 * The bot is happy to attach to *any* player's zone.
 */
export function findAttachment(
  hand: Tile[],
  board: Record<string, Tile[][]>,
): { tile: Tile; ownerId: string; meldIndex: number; chosen: Tile[] } | null {
  for (const ownerId of Object.keys(board)) {
    const melds = board[ownerId];
    for (let i = 0; i < melds.length; i++) {
      const meld = melds[i];
      for (const tile of hand) {
        const append = [...meld, tile];
        if (isValidSuita(append) || isValidFormatie(append)) {
          return { tile, ownerId, meldIndex: i, chosen: append };
        }
        const prepend = [tile, ...meld];
        if (isValidSuita(prepend) || isValidFormatie(prepend)) {
          return { tile, ownerId, meldIndex: i, chosen: prepend };
        }
      }
    }
  }
  return null;
}

/**
 * Pick a tile to discard. Avoid jokers; among real tiles, choose the
 * highest-value tile that isn't part of any obvious in-hand meld.
 */
export function pickDiscard(hand: Tile[]): Tile {
  if (hand.length === 0) throw new Error("pickDiscard called on empty hand");

  const inMelds = new Set<string>();
  for (const m of [...findRuns(hand), ...findSets(hand)]) {
    for (const t of m) inMelds.add(t.id);
  }

  const free = hand.filter((t) => !t.isJoker && !inMelds.has(t.id));
  if (free.length > 0) {
    return [...free].sort((a, b) => b.value - a.value)[0];
  }
  // Fall back to highest-value real tile, or anything as last resort.
  const reals = hand.filter((t) => !t.isJoker);
  if (reals.length > 0) return [...reals].sort((a, b) => b.value - a.value)[0];
  return hand[0];
}
