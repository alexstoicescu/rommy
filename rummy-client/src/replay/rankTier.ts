// Map an ELO rating to its Syndicate Reputation Ledger tier name.
// The label keys are i18n strings (resolved at render time); the
// helper returns a stable key so the consuming component can pick
// the localized string and apply tier-specific styling.

export type RankTier = "initiate" | "street" | "operator" | "elite";

export function tierForElo(elo: number): RankTier {
  if (elo >= 1500) return "elite";
  if (elo >= 1300) return "operator";
  if (elo >= 1200) return "street";
  return "initiate";
}

/** i18n key the consumer should pass to t(). */
export function tierLabelKey(tier: RankTier): string {
  switch (tier) {
    case "elite":
      return "rank_tier_elite";
    case "operator":
      return "rank_tier_operator";
    case "street":
      return "rank_tier_street";
    case "initiate":
    default:
      return "rank_tier_initiate";
  }
}
