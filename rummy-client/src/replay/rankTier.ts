// Map an ELO rating to its Syndicate Reputation Ledger tier name.
// The label keys are i18n strings (resolved at render time); the
// helper returns a stable key so the consuming component can pick
// the localized string and apply tier-specific styling.
//
// v2.9.6 rebrand: the three ranked tiers were renamed to the
// universal Bronze / Silver / Gold. The `initiate` tier is preserved
// as a sub-Bronze provisional rank for anyone whose rating has fallen
// below 1200 — folding it into Bronze would erase the visual signal
// that they're below the floor.

export type RankTier = "initiate" | "bronze" | "silver" | "gold";

export function tierForElo(elo: number): RankTier {
  if (elo >= 1500) return "gold";
  if (elo >= 1300) return "silver";
  if (elo >= 1200) return "bronze";
  return "initiate";
}

/** i18n key the consumer should pass to t(). */
export function tierLabelKey(tier: RankTier): string {
  switch (tier) {
    case "gold":
      return "rank_tier_gold";
    case "silver":
      return "rank_tier_silver";
    case "bronze":
      return "rank_tier_bronze";
    case "initiate":
    default:
      return "rank_tier_initiate";
  }
}
