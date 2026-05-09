/// <reference types="node" />
// Meld scoring unit tests — locks in the Romanian Rummy point rules
// across both scoring contexts:
//
//   ETALARE (initial drop validity / 45-point threshold):
//     2..9                           = 5
//     10..13                         = 10
//     "1" at low end of run (1-2-3)  = 5
//     "1" at high end of run (12-13-1) = 10   <-- v2.8.3 Ace High focus
//     "1" in a set (1-1-1)           = 25 (each)
//     Joker (any role)               = 50
//
//   CLOSING (Închidere — post-meld + hand scoring):
//     "1" is universally 25 (high-run, low-run, hand)
//     Other tiles: same 5/10/50 split as Etalare for run/set context.
//
// Run with: npm test  (uses ts-node).

import {
  calculateMeldPoints,
  scoreMeldFinal,
  scoreTileFinal,
  isValidSuita,
  isValidFormatie,
  reifySuita,
  type Tile,
  type TileColor,
} from "../GameRules";

let passed = 0;
let failed = 0;

function record(ok: boolean, name: string, detail?: string): void {
  if (ok) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

function eq(actual: number, expected: number, name: string): void {
  record(
    actual === expected,
    name,
    actual !== expected ? `expected ${expected}, got ${actual}` : undefined,
  );
}

function tile(
  id: string,
  color: TileColor,
  value: number,
  isJoker = false,
): Tile {
  return { id, color, value, isJoker };
}

// === ETALARE scoring (the Ace High Hotfix focus) ============================
console.log("\nEtalare — calculateMeldPoints");

// High run 12-13-1 — primary spec: the "1" must score 10 here.
{
  const meld: Tile[] = [
    tile("r-12-a", "red", 12),
    tile("r-13-a", "red", 13),
    tile("r-1-a", "red", 1),
  ];
  record(isValidSuita(meld), "12-13-1 is recognized as a valid Suita");
  eq(
    calculateMeldPoints(meld),
    30,
    "12-13-1 = 30 (1 at high end worth 10, NOT 5)",
  );
}

// 4-tile high run 11-12-13-1
{
  const meld: Tile[] = [
    tile("b-11-a", "blue", 11),
    tile("b-12-a", "blue", 12),
    tile("b-13-a", "blue", 13),
    tile("b-1-a", "blue", 1),
  ];
  record(isValidSuita(meld), "11-12-13-1 is a valid Suita");
  eq(calculateMeldPoints(meld), 40, "11-12-13-1 = 40 (1 at high end worth 10)");
}

// Low run 1-2-3 — the "1" must remain 5.
{
  const meld: Tile[] = [
    tile("r-1-a", "red", 1),
    tile("r-2-a", "red", 2),
    tile("r-3-a", "red", 3),
  ];
  record(isValidSuita(meld), "1-2-3 is a valid Suita");
  eq(calculateMeldPoints(meld), 15, "1-2-3 = 15 (1 at low end worth 5)");
}

// Long low run 1-2-3-4-5
{
  const meld: Tile[] = [
    tile("k-1-a", "black", 1),
    tile("k-2-a", "black", 2),
    tile("k-3-a", "black", 3),
    tile("k-4-a", "black", 4),
    tile("k-5-a", "black", 5),
  ];
  eq(calculateMeldPoints(meld), 25, "1-2-3-4-5 = 25 (5*5)");
}

// Mid run, no aces — 5-6-7
{
  const meld: Tile[] = [
    tile("r-5-a", "red", 5),
    tile("r-6-a", "red", 6),
    tile("r-7-a", "red", 7),
  ];
  eq(calculateMeldPoints(meld), 15, "5-6-7 = 15");
}

// High range 10-11-12-13
{
  const meld: Tile[] = [
    tile("y-10-a", "yellow", 10),
    tile("y-11-a", "yellow", 11),
    tile("y-12-a", "yellow", 12),
    tile("y-13-a", "yellow", 13),
  ];
  eq(calculateMeldPoints(meld), 40, "10-11-12-13 = 40 (4*10)");
}

// Joker substituting for a 13 in a high run: 12-Joker-1
{
  const meld: Tile[] = [
    tile("r-12-a", "red", 12),
    tile("j-a", "joker", 0, true),
    tile("r-1-a", "red", 1),
  ];
  record(isValidSuita(meld), "12-Joker-1 is a valid Suita");
  eq(
    calculateMeldPoints(meld),
    70,
    "12-Joker-1 = 70 (12=10 + Joker=50 + 1=10)",
  );
}

// Joker substituting for the high "1": 12-13-Joker
{
  const meld: Tile[] = [
    tile("r-12-a", "red", 12),
    tile("r-13-a", "red", 13),
    tile("j-a", "joker", 0, true),
  ];
  record(isValidSuita(meld), "12-13-Joker is a valid Suita (joker as high 1)");
  eq(
    calculateMeldPoints(meld),
    70,
    "12-13-Joker = 70 (Joker always 50 even at high-1 slot)",
  );
}

// Set 1-1-1
{
  const meld: Tile[] = [
    tile("r-1-a", "red", 1),
    tile("b-1-a", "blue", 1),
    tile("k-1-a", "black", 1),
  ];
  record(isValidFormatie(meld), "1-1-1 is a valid Formatie");
  eq(calculateMeldPoints(meld), 75, "1-1-1 set = 75 (3*25)");
}

// Mid set 7-7-7
{
  const meld: Tile[] = [
    tile("r-7-a", "red", 7),
    tile("b-7-a", "blue", 7),
    tile("k-7-a", "black", 7),
  ];
  eq(calculateMeldPoints(meld), 15, "7-7-7 set = 15 (3*5)");
}

// === CLOSING scoring (Închidere) ============================================
console.log("\nClosing — scoreMeldFinal");

// Closing-time rule: every "1" is 25, regardless of run position.
{
  const meld: Tile[] = [
    tile("y-12-a", "yellow", 12),
    tile("y-13-a", "yellow", 13),
    tile("y-1-a", "yellow", 1),
  ];
  eq(
    scoreMeldFinal(meld),
    45,
    "12-13-1 closing = 45 (12=10 + 13=10 + 1=25)",
  );
}

{
  const meld: Tile[] = [
    tile("r-1-a", "red", 1),
    tile("r-2-a", "red", 2),
    tile("r-3-a", "red", 3),
  ];
  eq(
    scoreMeldFinal(meld),
    35,
    "1-2-3 closing = 35 (1=25 + 2=5 + 3=5)",
  );
}

// === reifySuita ordering ====================================================
console.log("\nreifySuita");

{
  const meld: Tile[] = [
    tile("r-12-a", "red", 12),
    tile("r-13-a", "red", 13),
    tile("r-1-a", "red", 1),
  ];
  const reified = reifySuita(meld);
  record(reified !== null, "12-13-1 reifies (high run)");
  if (reified) {
    eq(reified[0].effective, 12, "  reified[0] = 12");
    eq(reified[1].effective, 13, "  reified[1] = 13");
    eq(reified[2].effective, 1, "  reified[2] = 1 (high end, position 2)");
  }
}

// Wrong order: 1-12-13 should NOT be a valid run.
{
  const meld: Tile[] = [
    tile("r-1-a", "red", 1),
    tile("r-12-a", "red", 12),
    tile("r-13-a", "red", 13),
  ];
  record(
    !isValidSuita(meld),
    "1-12-13 is rejected (wrong order — high 1 must follow 13)",
  );
}

// Wrap-around 13-1-2 must be rejected.
{
  const meld: Tile[] = [
    tile("r-13-a", "red", 13),
    tile("r-1-a", "red", 1),
    tile("r-2-a", "red", 2),
  ];
  record(!isValidSuita(meld), "13-1-2 wrap-around is rejected");
}

// === Wildcard validation regression — v3.6.0 =================================
//
// Recorded after a bug report claimed `3+3+Joker` was being rejected. A
// trace of isValidFormatie + isValidSuita against the existing code
// showed the cases below already validate correctly. These tests are
// here to LOCK IN that behaviour so a future "fix" doesn't regress it.
//
// Mapping from the report's notation:
//   3♠ → black 3,  3♥ → red 3,  3♦ → blue 3
//   5♦ / 7♦       → yellow 5 / yellow 7 (single-suit run)
console.log("\nWildcard validation (v3.6.0)");

const joker = (id: string): Tile => tile(id, "joker", 0, true);

// [3♣ 3♥ J]  3-card set with a joker filling the 4th rank-3 slot.
{
  const meld: Tile[] = [
    tile("k-3", "black", 3),
    tile("r-3", "red", 3),
    joker("j-1"),
  ];
  record(isValidFormatie(meld), "[3♣ 3♥ J] is a valid Formatie");
  record(!isValidSuita(meld), "[3♣ 3♥ J] is NOT a Suita");
}

// [5♦ J 7♦]  3-card run, joker fills the gap at rank 6.
{
  const meld: Tile[] = [
    tile("y-5", "yellow", 5),
    joker("j-2"),
    tile("y-7", "yellow", 7),
  ];
  record(isValidSuita(meld), "[5♦ J 7♦] is a valid Suita (joker = 6)");
  record(!isValidFormatie(meld), "[5♦ J 7♦] is NOT a Formatie");
}

// [3♣ 3♣ J]  same suit twice → must be rejected even with the joker.
{
  const meld: Tile[] = [
    tile("k-3-a", "black", 3),
    tile("k-3-b", "black", 3),
    joker("j-3"),
  ];
  record(
    !isValidFormatie(meld),
    "[3♣ 3♣ J] rejected — duplicate suits not allowed even with a joker",
  );
}

// 4-card set with two jokers must FAIL the joker-ratio guard:
// real=2, jokers=2 → 2 >= 2*2 is false.
{
  const meld: Tile[] = [
    tile("k-3", "black", 3),
    tile("r-3", "red", 3),
    joker("j-4"),
    joker("j-5"),
  ];
  record(
    !isValidFormatie(meld),
    "[3♣ 3♥ J J] rejected — joker ratio (real ≥ 2× jokers) violated",
  );
}

// === Atu Ledger scoring — v3.7.0 =============================================
//
// Rule: any tile whose id matches the round's Atu scores 50, regardless
// of rank/suit/context (hand, set, run). Joker is unaffected — it still
// scores 50 by its own rule. Without the atuId argument, the new
// parameter is no-op (back-compat with pre-v3.7.0 callers).
console.log("\nAtu Ledger scoring (v3.7.0)");

// scoreTileFinal — tile in hand at close
{
  const t = tile("atu-tile", "red", 5); // would normally be 5
  eq(scoreTileFinal(t, "atu-tile"), 50, "scoreTileFinal: 5 in hand IS the Atu → 50");
  eq(scoreTileFinal(t, "different-id"), 5, "scoreTileFinal: 5 in hand, NOT the Atu → 5");
  eq(scoreTileFinal(t), 5, "scoreTileFinal: omitted atuId → no-op (5)");
}

// scoreTileFinal — Ace and Atu
{
  const t = tile("atu-ace", "blue", 1); // would normally be 25 (closing rule)
  eq(
    scoreTileFinal(t, "atu-ace"),
    50,
    "scoreTileFinal: Atu override beats the Ace=25 rule",
  );
  eq(scoreTileFinal(t, "other"), 25, "scoreTileFinal: Ace stays 25 when not Atu");
}

// scoreMeldFinal — Atu inside a Suita
{
  // 5-6-7 yellow, where 6 is the Atu. Normal scoreMeldFinal: 5+5+5=15.
  // With atuId pointing at the 6 tile: 5 + 50 + 5 = 60.
  const meld: Tile[] = [
    tile("y-5", "yellow", 5),
    tile("atu-y-6", "yellow", 6),
    tile("y-7", "yellow", 7),
  ];
  eq(scoreMeldFinal(meld), 15, "5-6-7 normal closing = 15 (no atu)");
  eq(
    scoreMeldFinal(meld, "atu-y-6"),
    60,
    "5-Atu(6)-7 closing = 60 (5 + 50 atu override + 5)",
  );
}

// scoreMeldFinal — Atu inside a Formatie
{
  const meld: Tile[] = [
    tile("k-9", "black", 9),
    tile("atu-r-9", "red", 9),
    tile("b-9", "blue", 9),
  ];
  eq(scoreMeldFinal(meld), 15, "9-9-9 normal closing = 15");
  eq(
    scoreMeldFinal(meld, "atu-r-9"),
    60,
    "9-Atu(9)-9 closing = 60 (5 + 50 + 5; Atu beats rung)",
  );
}

// calculateMeldPoints — Etalare-time Atu beats joker collisions only
// for tile-id matches; a joker that ISN'T the atu still scores 50.
{
  const meld: Tile[] = [
    tile("atu-k-3", "black", 3),
    tile("r-3", "red", 3),
    joker("j-x"),
  ];
  // Without atu: 5 (k-3) + 5 (r-3) + 50 (joker) = 60.
  eq(
    calculateMeldPoints(meld),
    60,
    "Etalare 3-3-J no-atu = 60 (5+5+50 joker)",
  );
  // With atu pointing at the k-3: 50 + 5 + 50 = 105.
  eq(
    calculateMeldPoints(meld, "atu-k-3"),
    105,
    "Etalare Atu(3)-3-J = 105 (50 atu + 5 + 50 joker)",
  );
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
