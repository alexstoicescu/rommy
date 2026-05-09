// Romanian Rummy rules engine — single source of truth.
// Mirrors the client's Tile shape (rummy-client/src/types/game.ts).

export type TileColor = "red" | "black" | "blue" | "yellow" | "joker";

export interface Tile {
  id: string;
  color: TileColor;
  value: number; // 1..13 for real tiles, 0 for jokers
  isJoker: boolean;
}

const MIN_VALUE = 1;
const MAX_VALUE = 13;
const SUITA_MIN = 3;
const SUITA_MAX = 14;

export interface ReifiedTile {
  effective: number; // the value this tile (real or joker) represents
  isJoker: boolean;
}

/**
 * Joly ratio rule: at least 2 real tiles per Joker.
 * realTiles.length >= jokers.length * 2.
 */
function hasValidJokerRatio(meld: Tile[]): boolean {
  const jokers = meld.filter((t) => t.isJoker).length;
  const real = meld.length - jokers;
  return real >= jokers * 2;
}

// =====================================================================
//  Suita (Run)
// =====================================================================

/**
 * A Suita is 3..14 tiles, all the same color, with strictly consecutive
 * values. The "1" tile may sit only at the very low end (1-2-3-...) or
 * at the very high end after K (...-12-13-1). Wrap-around runs like
 * 13-1-2 are strictly invalid.
 */
export function isValidSuita(meld: Tile[]): boolean {
  if (meld.length < SUITA_MIN || meld.length > SUITA_MAX) return false;
  if (!hasValidJokerRatio(meld)) return false;

  const real = meld.filter((t) => !t.isJoker);
  if (real.length === 0) return false;

  const colors = new Set(real.map((t) => t.color));
  if (colors.size > 1) return false;

  return reifySuita(meld) !== null;
}

/**
 * Try to assign a concrete consecutive run of values to the candidate's
 * tiles, in order. Returns the reified sequence (with each tile's
 * effective value), or null if no valid run fits.
 *
 * Two legal shapes:
 *   - Plain in-range run:        start, start+1, ..., start+L-1   (≤13)
 *   - High-1 ending after K:     start, start+1, ..., 13, 1
 * Any wrap-around (e.g. 13, 1, 2) is rejected — only the *final* tile
 * may roll over to 1, and only when the previous tile was 13.
 */
export function reifySuita(meld: Tile[]): ReifiedTile[] | null {
  const L = meld.length;

  for (let start = MIN_VALUE; start <= MAX_VALUE; start++) {
    const end = start + L - 1;

    if (end <= MAX_VALUE) {
      const seq = Array.from({ length: L }, (_, i) => start + i);
      const r = matchSequence(meld, seq);
      if (r) return r;
    }

    if (end === MAX_VALUE + 1 && start >= 2) {
      const seq = Array.from({ length: L }, (_, i) =>
        i === L - 1 ? 1 : start + i,
      );
      const r = matchSequence(meld, seq);
      if (r) return r;
    }
  }

  return null;
}

function matchSequence(meld: Tile[], seq: number[]): ReifiedTile[] | null {
  const out: ReifiedTile[] = [];
  for (let i = 0; i < meld.length; i++) {
    const tile = meld[i];
    const expected = seq[i];
    if (tile.isJoker) {
      out.push({ effective: expected, isJoker: true });
    } else {
      if (tile.value !== expected) return null;
      out.push({ effective: expected, isJoker: false });
    }
  }
  return out;
}

// =====================================================================
//  Formatie (Set)
// =====================================================================

/**
 * A Formatie is exactly 3 or 4 tiles, all the same value, all of
 * distinct colors. Duplicate colors are strictly invalid. Joly ratio
 * applies.
 */
export function isValidFormatie(meld: Tile[]): boolean {
  if (meld.length < 3 || meld.length > 4) return false;
  if (!hasValidJokerRatio(meld)) return false;

  const real = meld.filter((t) => !t.isJoker);
  if (real.length === 0) return false;

  const value = real[0].value;
  if (!real.every((t) => t.value === value)) return false;

  const colors = new Set(real.map((t) => t.color));
  if (colors.size !== real.length) return false;

  return true;
}

// =====================================================================
//  Point calculation
// =====================================================================

/**
 * Per-tile point value within a Suita (Etalare scoring).
 *
 * Standard rungs:
 *   2..9                          = 5
 *   10..13                        = 10
 *
 * The "1" tile is positionally weighted — it can legally appear only
 * at the LOW end of a run (1-2-3...) or at the HIGH end after a 13
 * (...-12-13-1). reifySuita guarantees these are the only possible
 * positions (mid-run "1" is rejected as invalid, never reaches here).
 *
 *   "1" at the low end                = 5    (e.g. 1-2-3)
 *   "1" preceded by 13 (high end)     = 10   (e.g. 12-13-1)  ← Ace High
 *
 * Jokers never call this — they're always 50 via calculateMeldPoints.
 */
function suitaTilePoints(
  effective: number,
  position: number,
  length: number,
): number {
  if (effective === 1) {
    // Position-based scoring for the Ace. reifySuita lays the "1"
    // at index 0 for low runs (start=1) or at index length-1 for
    // high runs (preceded by 13). Anything else is impossible by
    // construction.
    const isHighEnd = position === length - 1 && length >= 2;
    if (isHighEnd) return 10; // preceded by 13
    if (position === 0) return 5; // low end (1-2-3...)
    return 0; // unreachable in practice — defensive only
  }
  if (effective >= 2 && effective <= 9) return 5;
  return 10; // 10..13
}

/**
 * Per-tile point value within a Formatie. "1" sets are scored at 25 per
 * tile per the official rules; all jokers in a set inherit the set's
 * value.
 */
function formatieTilePoints(setValue: number): number {
  if (setValue === 1) return 25;
  if (setValue >= 2 && setValue <= 9) return 5;
  return 10;
}

export function calculateMeldPoints(meld: Tile[]): number {
  if (isValidSuita(meld)) {
    const reified = reifySuita(meld)!;
    let sum = 0;
    for (let i = 0; i < meld.length; i++) {
      // Strict override: a Joker is always +50, regardless of the rung
      // it stands in for. Check tile.isJoker BEFORE deriving any
      // positional/contextual value.
      if (meld[i].isJoker) {
        sum += 50;
        continue;
      }
      sum += suitaTilePoints(reified[i].effective, i, reified.length);
    }
    return sum;
  }
  if (isValidFormatie(meld)) {
    const real = meld.filter((t) => !t.isJoker);
    const setValue = real[0].value;
    let sum = 0;
    for (const tile of meld) {
      if (tile.isJoker) {
        sum += 50;
        continue;
      }
      sum += formatieTilePoints(setValue);
    }
    return sum;
  }
  return 0;
}

// =====================================================================
//  Initial Drop (Etalare)
// =====================================================================

/**
 * Initial drop is legal iff:
 *   - every meld passes isValidSuita OR isValidFormatie;
 *   - at least one meld is a Suita (a run is mandatory);
 *   - the sum of meld points is >= 45.
 */
export function canInitialMeld(melds: Tile[][]): boolean {
  let allValid = true;
  let hasSuita = false;
  let totalPoints = 0;

  for (const meld of melds) {
    const isSuita = isValidSuita(meld);
    const isFormatie = !isSuita && isValidFormatie(meld);
    if (!isSuita && !isFormatie) {
      allValid = false;
      continue;
    }
    if (isSuita) hasSuita = true;
    totalPoints += calculateMeldPoints(meld);
  }

  const isValid =
    allValid && hasSuita && totalPoints >= 45 && melds.length > 0;

  console.log(
    "Etalare Attempt - Total Points:",
    totalPoints,
    "Contains Suita:",
    hasSuita,
    "Valid:",
    isValid,
  );

  return isValid;
}

// =====================================================================
//  End-of-round (Remi Etalat) scoring
// =====================================================================
//
//  These functions price the round AFTER a player closes (Închiderea).
//  They are intentionally *separate* from the Etalare scorer above,
//  because the rules use different values for the "1" tile:
//
//    Etalare:  "1" = 5 (low end of run) or 10 (high end)
//    Closing:  "1" = 25 in every context (set, run, hand)
//
//  Joly (Joker):
//    - On the board → flat 50 (strict override, never inherits the
//      rung/value it replaces). Mirrors the Etalare rule.
//    - In hand at close → 25 (penalty; nothing to inherit).

/**
 * Per-tile score in the final round-end calculation, given the tile's
 * effective value (i.e. the value it represents on the board after
 * reification — for a Joly that's the rung/value it stands in for).
 */
function scoreEffectiveValue(effective: number): number {
  if (effective === 1) return 25;
  if (effective >= 2 && effective <= 9) return 5;
  return 10;
}

/**
 * Score a Tile sitting in a player's hand at the moment of closing.
 * Jokers are penalised at 25 (no rung to inherit).
 *
 * v3.7.0 (refined) — the Atu's 50 points are a player-attached bonus
 * granted at deal time, not an intrinsic property of the card. The
 * card itself scores its normal rank value here.
 */
export function scoreTileFinal(tile: Tile): number {
  if (tile.isJoker) return 25;
  return scoreEffectiveValue(tile.value);
}

/**
 * Score a meld sitting on the board, using the closing-time value
 * table. Returns 0 if the meld isn't a recognisable Suita or Formatie
 * (defensive — every meld committed to the board has been validated).
 *
 * v3.7.0 (refined) — the Atu's 50 points are NOT applied here; they
 * are credited to the original holder via bonusPoints (see
 * dealRoom + calculateFinalScores).
 */
export function scoreMeldFinal(meld: Tile[]): number {
  if (isValidSuita(meld)) {
    const reified = reifySuita(meld)!;
    let sum = 0;
    for (let i = 0; i < meld.length; i++) {
      if (meld[i].isJoker) {
        sum += 50;
        continue;
      }
      sum += scoreEffectiveValue(reified[i].effective);
    }
    return sum;
  }
  if (isValidFormatie(meld)) {
    const real = meld.filter((t) => !t.isJoker);
    const setValue = real[0].value;
    let sum = 0;
    for (const tile of meld) {
      if (tile.isJoker) {
        sum += 50;
        continue;
      }
      sum += scoreEffectiveValue(setValue);
    }
    return sum;
  }
  return 0;
}

/**
 * Minimal player shape used by `calculateFinalScores`. Structurally
 * compatible with `GameState.Player` so the server can pass the live
 * player array directly.
 */
export interface ScoringPlayer {
  socketId: string;
  hand: Tile[];
  hasMeldedInitial: boolean;
  /**
   * Running tally (in closing-time points) of everything this player
   * has placed on the board across this round — set when committing
   * etalare / play_new_meld / attach_tile.
   */
  meldedScore: number;
  /** Round-specific extras (e.g. +50 for receiving the Atu). */
  bonusPoints: number;
}

/**
 * Compute every player's score for the round.
 *
 *  Winner (closer):
 *    base + meldedScore
 *      base = 400 if closingTile is a Joly, else 200
 *      score *= 2 if closingTile is a "1" (and not a Joly)
 *
 *  Other players:
 *    if hasMeldedInitial: meldedScore − sum(hand)
 *    else                : flat -100
 */
export function calculateFinalScores(
  players: ScoringPlayer[],
  winnerId: string,
  closingTile: Tile,
): Record<string, number> {
  const out: Record<string, number> = {};

  // v3.8.0 — Joker Gambit. Closing the round with a Joker doubles
  // every player's final score (winner AND losers, including the
  // Atu +50 bonus, including the -100 forfeit penalty for unmelded
  // losers). NOTE: this multiplier is applied AFTER the existing
  // joker-winner 400 base, so a joker-close winner ends up at
  // (400 + meldedScore) * 2 = 800 + 2*meldedScore. That is a literal
  // reading of the v3.8.0 spec ("multiply the final calculated score
  // for every player by 2"). If the intent is "the new 2x replaces
  // the old 400 base," collapse the base to 200 in the winner branch
  // and the rest of the math still works.
  const isJokerWin = closingTile.isJoker;
  const multiplier = isJokerWin ? 2 : 1;

  for (const player of players) {
    let score: number;
    if (player.socketId === winnerId) {
      const base = closingTile.isJoker ? 400 : 200;
      score = base + player.meldedScore;
      if (!closingTile.isJoker && closingTile.value === 1) {
        score *= 2;
      }
    } else if (!player.hasMeldedInitial) {
      score = -100;
    } else {
      const handSum = player.hand.reduce(
        (sum, t) => sum + scoreTileFinal(t),
        0,
      );
      score = player.meldedScore - handSum;
    }
    // v3.7.0 — bonusPoints carries the Atu owner's +50 grant (set in
    // dealRoom). Attributed to the player who received the Atu at
    // deal time, regardless of where the card ended up.
    // v3.8.0 — joker-close 2x is applied last, AFTER the bonus is
    // folded in, so the Atu bonus correctly becomes +100 in a Joker
    // Gambit round, per spec.
    out[player.socketId] = (score + player.bonusPoints) * multiplier;
  }

  return out;
}
