// Pairwise Elo updater for multi-player rounds. The classic Elo
// formula handles 1-on-1; for a 3-4 player table we do the standard
// sum-of-pairs treatment: each player's delta is the sum of their
// pairwise deltas against every other seat.
//
// Score-by-rank mapping: anyone who scored higher than another seat
// counts as a 1 vs them, lower = 0, equal = 0.5. That preserves
// transitivity and gives the round winner the strongest pull.

export interface EloSeat {
  /** Stable identity. For bots use a synthetic id (`bot-<sid>`). */
  signatureId: string;
  rating: number;
  isBot: boolean;
  /** Round score (post bonuses) — drives the pairwise outcome. */
  score: number;
}

const K_BASE = 32;
const BOT_K_FACTOR = 0.25;

export function expectedScore(self: number, opp: number): number {
  return 1 / (1 + Math.pow(10, (opp - self) / 400));
}

/**
 * Run pairwise updates and return integer deltas keyed by signatureId.
 * Bots are included in the pairing math (they need a rating to compute
 * expected outcomes) but the K-factor for any pair touching a bot is
 * reduced to 25% per the v2.8 spec — wins against bots are worth less,
 * losses against bots also hurt less, keeping the system stable.
 */
export function computeEloDeltas(seats: EloSeat[]): Map<string, number> {
  const deltas = new Map<string, number>();
  for (const s of seats) deltas.set(s.signatureId, 0);
  for (let i = 0; i < seats.length; i++) {
    for (let j = i + 1; j < seats.length; j++) {
      const a = seats[i];
      const b = seats[j];
      const k = a.isBot || b.isBot ? K_BASE * BOT_K_FACTOR : K_BASE;
      const ea = expectedScore(a.rating, b.rating);
      let actualA: number;
      if (a.score > b.score) actualA = 1;
      else if (a.score < b.score) actualA = 0;
      else actualA = 0.5;
      const dA = k * (actualA - ea);
      const dB = k * (1 - actualA - (1 - ea));
      deltas.set(a.signatureId, (deltas.get(a.signatureId) ?? 0) + dA);
      deltas.set(b.signatureId, (deltas.get(b.signatureId) ?? 0) + dB);
    }
  }
  for (const [k, v] of deltas) deltas.set(k, Math.round(v));
  return deltas;
}
