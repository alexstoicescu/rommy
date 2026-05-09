// Client-side validators — a slim mirror of `rummy-server/src/GameRules.ts`.
// The server remains authoritative; these are used for live UI feedback
// (Etalare button label/state) so the client doesn't have to round-trip
// through the socket to know whether a draft is legal.

import type { Tile } from "./types/game";

const SUITA_MIN = 3;
const SUITA_MAX = 14;
const MIN_VALUE = 1;
const MAX_VALUE = 13;

interface Reified {
  effective: number;
}

function hasValidJokerRatio(meld: Tile[]): boolean {
  const j = meld.filter((t) => t.isJoker).length;
  return meld.length - j >= j * 2;
}

function matchSequence(meld: Tile[], seq: number[]): Reified[] | null {
  const out: Reified[] = [];
  for (let i = 0; i < meld.length; i++) {
    const t = meld[i];
    const expected = seq[i];
    if (t.isJoker) {
      out.push({ effective: expected });
    } else {
      if (t.value !== expected) return null;
      out.push({ effective: expected });
    }
  }
  return out;
}

function reifySuita(meld: Tile[]): Reified[] | null {
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

export function isValidSuita(meld: Tile[]): boolean {
  if (meld.length < SUITA_MIN || meld.length > SUITA_MAX) return false;
  if (!hasValidJokerRatio(meld)) return false;
  const real = meld.filter((t) => !t.isJoker);
  if (real.length === 0) return false;
  const colors = new Set(real.map((t) => t.color));
  if (colors.size > 1) return false;
  return reifySuita(meld) !== null;
}

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

function suitaTilePoints(eff: number, pos: number, len: number): number {
  if (eff === 1) {
    // Ace is positionally weighted. reifySuita only ever lays the "1"
    // at index 0 (low run, e.g. 1-2-3) or index len-1 (high run,
    // preceded by 13, e.g. 12-13-1).
    const isHighEnd = pos === len - 1 && len >= 2;
    if (isHighEnd) return 10; // preceded by 13
    if (pos === 0) return 5; // low end
    return 0; // unreachable in practice
  }
  if (eff >= 2 && eff <= 9) return 5;
  return 10;
}

function formatieTilePoints(setValue: number): number {
  if (setValue === 1) return 25;
  if (setValue >= 2 && setValue <= 9) return 5;
  return 10;
}

export function calculateMeldPoints(meld: Tile[]): number {
  if (isValidSuita(meld)) {
    const r = reifySuita(meld)!;
    let sum = 0;
    for (let i = 0; i < meld.length; i++) {
      // Strict override: Joker is always +50, never the rung it replaces.
      if (meld[i].isJoker) {
        sum += 50;
        continue;
      }
      sum += suitaTilePoints(r[i].effective, i, r.length);
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

export function canInitialMeld(melds: Tile[][]): boolean {
  if (melds.length === 0) return false;
  let total = 0;
  let hasSuita = false;
  for (const m of melds) {
    const isS = isValidSuita(m);
    const isF = !isS && isValidFormatie(m);
    if (!isS && !isF) return false;
    if (isS) hasSuita = true;
    total += calculateMeldPoints(m);
  }
  return hasSuita && total >= 45;
}
