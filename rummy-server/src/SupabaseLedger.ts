// v3.0.0 Hidden Backbone — Supabase-backed Reputation Ledger.
//
// Drop-in replacement for EloLedger. Same in-memory cache shape (so
// callers can keep doing synchronous `get`), but the durable store is
// now Postgres via @supabase/supabase-js with the service role.
//
// Flow on round finalize:
//   1. computeEloDeltas (server, unchanged)
//   2. await ledger.applyDelta(sig, delta) — writes to memory AND
//      Postgres, returns only after the upsert resolves (or after the
//      ephemeral-mode fallback kicks in).
//   3. emit game_over / match_tape — RANK_UPDATE only fires once the
//      durable write has settled.
//
// Ephemeral Mode: if the Supabase client can't be constructed (missing
// env vars) OR the startup hydration fetch errors out, we flip
// `ephemeralMode = true` and serve everything out of the in-memory
// Map. Subsequent writes are still attempted — a transient outage that
// recovers will silently start succeeding again — but we never block
// gameplay on the DB. The boolean is exposed via `isEphemeral()` so
// callers can stamp the match tape / log a banner.
//
// All identity is keyed by signatureId (uuid). profiles.id IS that
// signature, by design — see migrations/20260509120000_hidden_backbone.sql.

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { MatchTape } from "./MatchRecorder";

export interface LedgerEntry {
  signatureId: string;
  alias: string;
  eloScore: number;
  gamesPlayed: number;
  lastSeen: number;
}

const STARTING_ELO = 1200;
const FLOOR_ELO = 100;

// Tier thresholds — v2.9.7 Classic Tier rebrand. Mirrors
// EloEngine.tierForEloServer; kept here too so writes can stamp the
// tier column without a cross-module call.
function tierFor(elo: number): string {
  if (elo >= 1400) return "Gold";
  if (elo >= 1300) return "Silver";
  if (elo >= 1200) return "Bronze";
  return "Initiate";
}

interface ProfileRow {
  id: string;
  alias: string;
  elo: number;
  tier: string;
  updated_at: string;
}

export class SupabaseLedger {
  private entries = new Map<string, LedgerEntry>();
  private client: SupabaseClient | null;
  private ephemeral = true;
  private hydrated = false;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      console.warn(
        "[Ledger] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — running in Ephemeral Mode (no persistence).",
      );
      this.client = null;
      return;
    }
    // Service-role client. We disable session persistence because this
    // is a server process — there's no auth handshake to keep around.
    this.client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  /** Best-effort initial hydration. Safe to ignore errors — they just
   *  flip us into Ephemeral Mode. Call once at boot, await the result
   *  if you want hydration to complete before accepting traffic. */
  async hydrate(): Promise<void> {
    if (!this.client) return;
    try {
      const { data, error } = await this.client
        .from("profiles")
        .select("id, alias, elo, tier, updated_at");
      if (error) throw error;
      const rows = (data ?? []) as ProfileRow[];
      for (const r of rows) {
        this.entries.set(r.id, {
          signatureId: r.id,
          alias: r.alias,
          eloScore: r.elo,
          gamesPlayed: 0,
          lastSeen: Date.parse(r.updated_at) || Date.now(),
        });
      }
      this.hydrated = true;
      this.ephemeral = false;
      console.log(`[Ledger] Hydrated ${rows.length} profile(s) from Supabase.`);
    } catch (err) {
      console.warn(
        "[Ledger] Hydration failed — entering Ephemeral Mode:",
        (err as Error)?.message ?? err,
      );
      this.ephemeral = true;
    }
  }

  isEphemeral(): boolean {
    return this.ephemeral;
  }

  /** Get an entry by signatureId, creating an in-memory default if
   *  missing. Synchronous — the cache is the source of truth for reads.
   *  Bots / unknown signatures get a 1200 default that is never written. */
  get(signatureId: string): LedgerEntry {
    if (!signatureId) {
      return {
        signatureId,
        alias: "Anon",
        eloScore: STARTING_ELO,
        gamesPlayed: 0,
        lastSeen: Date.now(),
      };
    }
    const existing = this.entries.get(signatureId);
    if (existing) return existing;
    return {
      signatureId,
      alias: "Anon",
      eloScore: STARTING_ELO,
      gamesPlayed: 0,
      lastSeen: Date.now(),
    };
  }

  /** Touch the ledger on connection. Inserts or updates alias. Async —
   *  awaiting it on the connection handshake is fine; not awaiting is
   *  also fine (write is fire-and-forget on the wire path). */
  async upsert(signatureId: string, alias: string): Promise<LedgerEntry> {
    if (!signatureId) return this.get(signatureId);
    const cleanAlias = (alias || "").trim() || "Anon";
    const existing = this.entries.get(signatureId);
    const entry: LedgerEntry = existing
      ? { ...existing, alias: cleanAlias, lastSeen: Date.now() }
      : {
          signatureId,
          alias: cleanAlias,
          eloScore: STARTING_ELO,
          gamesPlayed: 0,
          lastSeen: Date.now(),
        };
    this.entries.set(signatureId, entry);
    await this.writeProfile(entry).catch((err) => {
      console.warn(
        `[Ledger] upsert write failed (sig=${signatureId.slice(0, 8)}):`,
        (err as Error)?.message ?? err,
      );
    });
    return entry;
  }

  /** Apply a signed delta and bump games-played. Writes both the cache
   *  AND Postgres before resolving — callers `await` this so the wire
   *  RANK_UPDATE only fires once the durable record has settled. */
  async applyDelta(signatureId: string, delta: number): Promise<LedgerEntry> {
    if (!signatureId || !Number.isFinite(delta)) {
      console.warn(
        `[ELO] applyDelta SKIPPED: signatureId=${signatureId || "(empty)"} delta=${delta}`,
      );
      return this.get(signatureId);
    }
    const existing = this.entries.get(signatureId);
    const oldScore = existing?.eloScore ?? STARTING_ELO;
    const newScore = Math.max(FLOOR_ELO, Math.round(oldScore + delta));
    const entry: LedgerEntry = {
      signatureId,
      alias: existing?.alias ?? "Anon",
      eloScore: newScore,
      gamesPlayed: (existing?.gamesPlayed ?? 0) + 1,
      lastSeen: Date.now(),
    };
    this.entries.set(signatureId, entry);
    console.log(
      `[ELO] Updating Signature ${signatureId} from ${oldScore} to ${newScore} (delta=${delta >= 0 ? "+" : ""}${delta})`,
    );
    await this.writeProfile(entry).catch((err) => {
      console.warn(
        `[Ledger] applyDelta write failed (sig=${signatureId.slice(0, 8)}) — ephemeral fallback:`,
        (err as Error)?.message ?? err,
      );
      this.ephemeral = true;
    });
    return entry;
  }

  /** Archive a sealed Match Tape. Best-effort: a failure here flips
   *  ephemeral but does NOT block the round-end broadcast. */
  async archiveMatch(tape: MatchTape): Promise<void> {
    if (!this.client) return;
    try {
      // Find the winner's signatureId. Bots have signatureId=null →
      // null winner_id (FK is nullable). Note: tape.winnerSessionId is
      // a *session* id; we look it up against the starting roster to
      // get the signature.
      const winner =
        tape.startingPlayers.find((p) => p.sessionId === tape.winnerSessionId) ??
        tape.players.find((p) => p.sessionId === tape.winnerSessionId);
      const winnerSig = winner?.signatureId ?? null;
      const { error } = await this.client.from("matches").insert({
        winner_id: winnerSig,
        room_id: tape.roomId,
        match_tape: tape,
      });
      if (error) throw error;
    } catch (err) {
      console.warn(
        `[Ledger] match archive failed (room=${tape.roomId}):`,
        (err as Error)?.message ?? err,
      );
      this.ephemeral = true;
    }
  }

  private async writeProfile(entry: LedgerEntry): Promise<void> {
    if (!this.client) return;
    const row = {
      id: entry.signatureId,
      alias: entry.alias,
      elo: entry.eloScore,
      tier: tierFor(entry.eloScore),
      updated_at: new Date(entry.lastSeen).toISOString(),
    };
    const { error } = await this.client
      .from("profiles")
      .upsert(row, { onConflict: "id" });
    if (error) throw error;
    // First successful write after a failure clears the ephemeral flag.
    if (this.hydrated && this.ephemeral) {
      console.log("[Ledger] Recovered — leaving Ephemeral Mode.");
      this.ephemeral = false;
    }
  }
}
