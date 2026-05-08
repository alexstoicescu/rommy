// Syndicate Reputation Ledger — persistent ELO + alias store keyed by
// the client-generated signatureId. Lives as a single JSON file on
// disk; reads are in-memory after startup, writes are debounced and
// atomic (write-to-tmp + rename) to survive crashes mid-write.
//
// Lifetime: a single shared instance is constructed in index.ts at
// boot and survives for the lifetime of the process.

import { promises as fsp } from "node:fs";
import { existsSync, readFileSync } from "node:fs";

export interface LedgerEntry {
  signatureId: string;
  alias: string;
  eloScore: number;
  gamesPlayed: number;
  lastSeen: number;
}

const STARTING_ELO = 1200;
const FLOOR_ELO = 100;
const WRITE_DEBOUNCE_MS = 250;

export class EloLedger {
  private entries = new Map<string, LedgerEntry>();
  private path: string;
  private writeTimer: NodeJS.Timeout | null = null;
  private writeInFlight: Promise<void> | null = null;
  private dirty = false;

  constructor(path: string) {
    this.path = path;
    this.loadSync();
  }

  /** Synchronous startup load — runs once at process boot. */
  private loadSync(): void {
    try {
      if (!existsSync(this.path)) {
        console.log(`EloLedger: starting fresh at ${this.path}`);
        return;
      }
      const raw = readFileSync(this.path, "utf8");
      const obj = JSON.parse(raw) as Record<string, LedgerEntry>;
      let count = 0;
      for (const [id, entry] of Object.entries(obj)) {
        if (!entry || typeof entry !== "object") continue;
        this.entries.set(id, {
          signatureId: id,
          alias: String(entry.alias ?? "Anon"),
          eloScore: Number.isFinite(entry.eloScore)
            ? entry.eloScore
            : STARTING_ELO,
          gamesPlayed: Number.isFinite(entry.gamesPlayed)
            ? entry.gamesPlayed
            : 0,
          lastSeen: Number.isFinite(entry.lastSeen)
            ? entry.lastSeen
            : Date.now(),
        });
        count++;
      }
      console.log(`EloLedger: loaded ${count} entries from ${this.path}`);
    } catch (err) {
      console.warn(`EloLedger: load failed (${this.path}):`, err);
    }
  }

  private scheduleWrite(): void {
    this.dirty = true;
    if (this.writeTimer) return;
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      void this.flush();
    }, WRITE_DEBOUNCE_MS);
  }

  /** Atomic flush: write to .tmp, rename over the canonical path. */
  private async flush(): Promise<void> {
    if (this.writeInFlight) {
      // Coalesce — let the in-flight write complete and reschedule.
      await this.writeInFlight;
      if (this.dirty) this.scheduleWrite();
      return;
    }
    if (!this.dirty) return;
    this.dirty = false;
    const obj = Object.fromEntries(this.entries);
    const tmp = `${this.path}.tmp`;
    this.writeInFlight = (async () => {
      try {
        await fsp.writeFile(tmp, JSON.stringify(obj, null, 2), "utf8");
        await fsp.rename(tmp, this.path);
      } catch (err) {
        console.warn(`EloLedger: flush failed:`, err);
      } finally {
        this.writeInFlight = null;
      }
    })();
    await this.writeInFlight;
  }

  /** Get an entry by signatureId, creating a default if missing. */
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

  /**
   * Touch the ledger on connection — creates a fresh entry at 1200 if
   * the signature isn't known, otherwise updates the alias if the
   * client has changed it.
   */
  upsert(signatureId: string, alias: string): LedgerEntry {
    if (!signatureId) return this.get(signatureId);
    const cleanAlias = (alias || "").trim() || "Anon";
    const existing = this.entries.get(signatureId);
    if (existing) {
      let changed = false;
      if (cleanAlias && existing.alias !== cleanAlias) {
        existing.alias = cleanAlias;
        changed = true;
      }
      existing.lastSeen = Date.now();
      // lastSeen is metadata; only mark dirty if alias actually changed
      // OR the entry's last write was a while ago. Keep it simple — any
      // upsert is dirty so analytics tools can see fresh lastSeen
      // values.
      if (changed) this.scheduleWrite();
      return existing;
    }
    const fresh: LedgerEntry = {
      signatureId,
      alias: cleanAlias,
      eloScore: STARTING_ELO,
      gamesPlayed: 0,
      lastSeen: Date.now(),
    };
    this.entries.set(signatureId, fresh);
    this.scheduleWrite();
    return fresh;
  }

  /** Apply a signed delta and bump games-played. Returns the new entry. */
  applyDelta(signatureId: string, delta: number): LedgerEntry {
    if (!signatureId || !Number.isFinite(delta)) return this.get(signatureId);
    const entry = this.entries.get(signatureId) ?? this.upsert(signatureId, "");
    entry.eloScore = Math.max(FLOOR_ELO, Math.round(entry.eloScore + delta));
    entry.gamesPlayed += 1;
    entry.lastSeen = Date.now();
    this.scheduleWrite();
    return entry;
  }
}
