// True-Human pairwise Elo (v2.8.1).
//
// Refactor from v2.8.0: bots are now NEUTRAL OBSTACLES. They take a
// seat at the table, can win the round (and "steal" wins from
// humans), but they neither gain nor lose ELO and their presence
// does not contribute to the human pairing math at all.
//
// The engine therefore only computes deltas between human seats.
// Specifically:
//   - 0 humans    -> empty delta map.
//   - 1 human     -> single zero entry (solo-vs-bots produces no
//                    rating change by spec).
//   - 2+ humans   -> full pairwise deltas at K=32 across the human
//                    seats only. Their relative scores drive
//                    pairwise outcomes (1 / 0.5 / 0).
//
// K-factor: a flat 32 across human pairs. The 25% bot reduction
// from v2.8.0 is gone — bots aren't pair participants anymore.

export interface EloSeat {
  /** Stable identity. For bots use a synthetic id (`bot-<sid>`). */
  signatureId: string;
  rating: number;
  isBot: boolean;
  /** Round score (post bonuses) — drives the pairwise outcome. */
  score: number;
}

const K_BASE = 32;

export function expectedScore(self: number, opp: number): number {
  return 1 / (1 + Math.pow(10, (opp - self) / 400));
}

/**
 * Compute integer deltas keyed by signatureId. Bots are admitted to
 * the seat list (so callers can pass the full table) but excluded
 * from every pair, guaranteeing no ELO change for or because of bots.
 */
export function computeEloDeltas(seats: EloSeat[]): Map<string, number> {
  const deltas = new Map<string, number>();
  for (const s of seats) deltas.set(s.signatureId, 0);
  const humans = seats.filter((s) => !s.isBot);
  // Solo vs bots, or a degenerate 0-human room, produces no ratings.
  if (humans.length < 2) return deltas;
  for (let i = 0; i < humans.length; i++) {
    for (let j = i + 1; j < humans.length; j++) {
      const a = humans[i];
      const b = humans[j];
      const ea = expectedScore(a.rating, b.rating);
      let actualA: number;
      if (a.score > b.score) actualA = 1;
      else if (a.score < b.score) actualA = 0;
      else actualA = 0.5;
      const dA = K_BASE * (actualA - ea);
      const dB = K_BASE * (1 - actualA - (1 - ea));
      deltas.set(a.signatureId, (deltas.get(a.signatureId) ?? 0) + dA);
      deltas.set(b.signatureId, (deltas.get(b.signatureId) ?? 0) + dB);
    }
  }
  for (const [k, v] of deltas) deltas.set(k, Math.round(v));
  return deltas;
}
