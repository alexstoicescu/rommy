// Post-match analytics. Pure function — given a MatchTape, produces
// derived stats for the After-Action Report. No side effects, no
// external state, so memoizing or recomputing is cheap.

import type { MatchEvent, MatchTape } from "./types";

export interface FortuneRow {
  sessionId: string;
  name: string;
  colorIndex: number;
  drawn: number;     // tiles taken (deck + rupere stack)
  melded: number;    // tiles played to the board (etalare/play_meld/attach)
  factor: number;    // 100 * melded / max(drawn, 1) — "what fraction of intake reached the board"
}

export interface ScorePoint {
  ts: number;
  scores: Record<string, number>;  // session -> meldedScore (or roundScore on the final point)
}

export interface ComputedAnalytics {
  mvp: { sessionId: string; name: string; score: number; colorIndex: number };
  pivot: {
    eventIndex: number;
    ts: number;
    leaderName: string;
    overtaken: string | null;
  } | null;
  fortune: FortuneRow[];
  mostActiveWasher: {
    sessionId: string;
    name: string;
    contribution: number;
    colorIndex: number;
  } | null;
  scoreSeries: ScorePoint[];
  highlights: Array<{ key: string; vars?: Record<string, string | number> }>;
}

const PLAY_TYPES = new Set<MatchEvent["type"]>([
  "etalare",
  "play_meld",
  "attach",
]);

export function analyzeTape(tape: MatchTape): ComputedAnalytics {
  const playerByName = new Map<string, string>();
  const nameBySession = new Map<string, string>();
  const colorBySession = new Map<string, number>();
  for (const p of tape.players) {
    playerByName.set(p.sessionId, p.name);
    nameBySession.set(p.sessionId, p.name);
    colorBySession.set(p.sessionId, p.colorIndex);
  }

  // === MVP ===
  // The winner of the round (server-supplied). Score is the
  // post-bonus per-round number.
  const mvpName = nameBySession.get(tape.winnerSessionId) ?? "?";
  const mvp = {
    sessionId: tape.winnerSessionId,
    name: mvpName,
    score: tape.finalScores[tape.winnerSessionId] ?? 0,
    colorIndex: colorBySession.get(tape.winnerSessionId) ?? 0,
  };

  // === Score series ===
  // One sample per event with a meldedScores map. Keeps the chart
  // honest at every recorded moment.
  const scoreSeries: ScorePoint[] = tape.events.map((ev) => ({
    ts: ev.ts,
    scores: { ...ev.snapshot.meldedScores },
  }));

  // === Pivot turn ===
  // Walk the tape; at each event, find who's leading by meldedScore.
  // Pivot = first event where the eventual winner becomes (and stays)
  // the leader through the end of the tape. If no one ever overtakes,
  // pivot is null (winner led from the start).
  let pivot: ComputedAnalytics["pivot"] = null;
  {
    let prevLeader: string | null = null;
    let firstWinnerLead: number | null = null;
    let stableSinceIndex: number | null = null;
    tape.events.forEach((ev, i) => {
      const scores = ev.snapshot.meldedScores;
      let topId: string | null = null;
      let topScore = -Infinity;
      for (const [sid, s] of Object.entries(scores)) {
        if (s > topScore) {
          topScore = s;
          topId = sid;
        }
      }
      if (topId === tape.winnerSessionId) {
        if (stableSinceIndex == null) stableSinceIndex = i;
        if (firstWinnerLead == null) {
          firstWinnerLead = i;
        }
      } else {
        stableSinceIndex = null;
      }
      if (
        topId !== tape.winnerSessionId &&
        topId != null &&
        prevLeader === tape.winnerSessionId
      ) {
        // Winner lost the lead; stableSinceIndex is reset above.
      }
      prevLeader = topId;
    });
    if (stableSinceIndex != null) {
      const ev = tape.events[stableSinceIndex];
      const prior = stableSinceIndex > 0
        ? tape.events[stableSinceIndex - 1]
        : null;
      let overtaken: string | null = null;
      if (prior) {
        const ps = prior.snapshot.meldedScores;
        let topId: string | null = null;
        let topScore = -Infinity;
        for (const [sid, s] of Object.entries(ps)) {
          if (s > topScore) {
            topScore = s;
            topId = sid;
          }
        }
        if (topId && topId !== tape.winnerSessionId) {
          overtaken = nameBySession.get(topId) ?? null;
        }
      }
      pivot = {
        eventIndex: stableSinceIndex,
        ts: ev.ts,
        leaderName: mvpName,
        overtaken,
      };
    }
  }

  // === Fortune Factor ===
  // drawn = count of "draw" + "rupere" events (per actor)
  // melded = sum over play events of meta.tilesPlaced
  // factor = 100 * melded / max(drawn, 1)
  const drawn = new Map<string, number>();
  const melded = new Map<string, number>();
  for (const ev of tape.events) {
    if (!ev.actor) continue;
    if (ev.type === "draw") {
      drawn.set(ev.actor, (drawn.get(ev.actor) ?? 0) + 1);
    } else if (ev.type === "rupere") {
      const taken = (ev.meta?.takenCount as number) ?? 1;
      drawn.set(ev.actor, (drawn.get(ev.actor) ?? 0) + taken);
    } else if (PLAY_TYPES.has(ev.type)) {
      const placed = (ev.meta?.tilesPlaced as number) ?? 1;
      melded.set(ev.actor, (melded.get(ev.actor) ?? 0) + placed);
    }
  }
  const fortune: FortuneRow[] = tape.players.map((p) => {
    const d = drawn.get(p.sessionId) ?? 0;
    const m = melded.get(p.sessionId) ?? 0;
    return {
      sessionId: p.sessionId,
      name: p.name,
      colorIndex: p.colorIndex,
      drawn: d,
      melded: m,
      factor: Math.round((100 * m) / Math.max(1, d)),
    };
  });

  // === Most Active Washer (scramble hype) ===
  let mostActiveWasher: ComputedAnalytics["mostActiveWasher"] = null;
  let bestContrib = 0;
  for (const p of tape.players) {
    const c = tape.hypeContrib[p.sessionId] ?? 0;
    if (c > bestContrib) {
      bestContrib = c;
      mostActiveWasher = {
        sessionId: p.sessionId,
        name: p.name,
        contribution: Math.round(c),
        colorIndex: p.colorIndex,
      };
    }
  }

  // === Highlights (i18n keys + interpolation values) ===
  const highlights: ComputedAnalytics["highlights"] = [];
  // Top fortune
  const topFortune = [...fortune].sort((a, b) => b.factor - a.factor)[0];
  if (topFortune && topFortune.factor > 0) {
    highlights.push({
      key: "aar_highlight_fortune",
      vars: { name: topFortune.name, factor: topFortune.factor },
    });
  }
  // Most active washer
  if (mostActiveWasher) {
    highlights.push({
      key: "aar_highlight_washer",
      vars: { name: mostActiveWasher.name },
    });
  }
  // Pivot
  if (pivot && pivot.overtaken) {
    highlights.push({
      key: "aar_highlight_pivot",
      vars: { winner: pivot.leaderName, overtaken: pivot.overtaken },
    });
  } else if (pivot) {
    highlights.push({
      key: "aar_highlight_lead_from_start",
      vars: { winner: pivot.leaderName },
    });
  }
  // Biggest meld
  let biggestMeld = 0;
  let biggestMeldName = "";
  for (const ev of tape.events) {
    if (PLAY_TYPES.has(ev.type) && ev.actor) {
      const pts = (ev.meta?.pointsAdded as number) ?? 0;
      if (pts > biggestMeld) {
        biggestMeld = pts;
        biggestMeldName = nameBySession.get(ev.actor) ?? "";
      }
    }
  }
  if (biggestMeld > 0) {
    highlights.push({
      key: "aar_highlight_biggest_meld",
      vars: { name: biggestMeldName, pts: biggestMeld },
    });
  }

  return {
    mvp,
    pivot,
    fortune,
    mostActiveWasher,
    scoreSeries,
    highlights,
  };
}
