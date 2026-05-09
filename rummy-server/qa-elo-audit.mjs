// [QA-AUDIT v2.8.1] Ghost-Bot Stress Test harness.
// Self-contained JS port of EloEngine.ts (kept byte-for-byte identical
// to the production logic) so we can exercise the engine without a TS
// compile step. If this drifts from the .ts file the audit is invalid
// — re-port if EloEngine.ts is touched.

const K_BASE = 32;

function expectedScore(self, opp) {
  return 1 / (1 + Math.pow(10, (opp - self) / 400));
}

function computeEloDeltas(seats) {
  const deltas = new Map();
  for (const s of seats) deltas.set(s.signatureId, 0);
  const humans = seats.filter((s) => !s.isBot);
  if (humans.length < 2) return deltas;
  for (let i = 0; i < humans.length; i++) {
    for (let j = i + 1; j < humans.length; j++) {
      const a = humans[i];
      const b = humans[j];
      const ea = expectedScore(a.rating, b.rating);
      let actualA;
      if (a.score > b.score) actualA = 1;
      else if (a.score < b.score) actualA = 0;
      else actualA = 0.5;
      const dA = K_BASE * (actualA - ea);
      const dB = K_BASE * (1 - actualA - (1 - ea));
      console.log(
        `[ELO-TRACE] pair=(${a.signatureId} vs ${b.signatureId}) ` +
          `R_A=${a.rating} R_B=${b.rating} K=${K_BASE} ` +
          `score_A=${a.score} score_B=${b.score} S_A=${actualA} ` +
          `E_A=${ea.toFixed(4)} ΔA=${dA.toFixed(4)} ΔB=${dB.toFixed(4)}`,
      );
      deltas.set(a.signatureId, (deltas.get(a.signatureId) ?? 0) + dA);
      deltas.set(b.signatureId, (deltas.get(b.signatureId) ?? 0) + dB);
    }
  }
  for (const [k, v] of deltas) deltas.set(k, Math.round(v));
  return deltas;
}

const seats = [
  { signatureId: "PLAYER_A", rating: 1200, isBot: false, score: 60 },
  { signatureId: "PLAYER_B", rating: 1200, isBot: false, score: -10 },
  { signatureId: "bot-1", rating: 1200, isBot: true, score: 25 },
  { signatureId: "bot-2", rating: 1200, isBot: true, score: 0 },
];

console.log("\n=== [QA-AUDIT v2.8.1] Ghost-Bot Stress Test ===");
console.log("Seats (round scores already include bonuses):");
for (const s of seats) console.log("  " + JSON.stringify(s));

console.log("\nManual hand-calc for the A-vs-B human pair:");
const E_A = expectedScore(1200, 1200);
console.log(`  E_A = 1 / (1 + 10^((R_B-R_A)/400)) = 1 / (1 + 10^0) = ${E_A}`);
console.log("  S_A = 1   (score_A=60 > score_B=-10 → A wins the pair)");
console.log(`  ΔA  = K * (S_A - E_A) = 32 * (1 - 0.5) = ${32 * (1 - 0.5)}`);
console.log(`  ΔB  = K * (S_B - E_B) = 32 * (0 - 0.5) = ${32 * (0 - 0.5)}`);
console.log("  Bots: skipped — humans.filter excludes them entirely.");

const deltas = computeEloDeltas(seats);
console.log("\nEngine output (computeEloDeltas):");
for (const [k, v] of deltas) console.log(`  ${k.padEnd(10)} => ${v}`);

const ok =
  deltas.get("PLAYER_A") === 16 &&
  deltas.get("PLAYER_B") === -16 &&
  deltas.get("bot-1") === 0 &&
  deltas.get("bot-2") === 0;

console.log("\nVerdict: " + (ok ? "PASS — math matches code" : "FAIL"));
process.exit(ok ? 0 : 1);
