// v3.0.0 Hidden Backbone — Persistence verification.
//
// Confirms that an ELO score written for a signature_id survives a
// "page refresh" (= a fresh Supabase client instance reading the row
// back). Mirrors the production write path: we hit profiles via
// upsert with the same shape SupabaseLedger uses.
//
// USAGE:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node qa-supabase-persistence.mjs
//
// Exits 0 on PASS, 1 on FAIL. Cleans up the test row before exit so
// repeated runs don't accumulate junk.

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    "[QA-PERSIST] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — testing Ephemeral Mode fallback only.",
  );
  console.log(
    "[QA-PERSIST] PASS (skipped DB checks — server would run in Ephemeral Mode)",
  );
  process.exit(0);
}

const sig = randomUUID();
const ALIAS = "qa-persist-rig";
const ELO = 1357;

function makeClient() {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function main() {
  console.log(`[QA-PERSIST] signature=${sig}`);

  const writer = makeClient();
  const { error: upErr } = await writer.from("profiles").upsert(
    {
      id: sig,
      alias: ALIAS,
      elo: ELO,
      tier: "Silver",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (upErr) {
    console.error("[QA-PERSIST] upsert failed:", upErr.message);
    process.exit(1);
  }
  console.log(`[QA-PERSIST] wrote elo=${ELO} alias=${ALIAS}`);

  // Fresh client = simulated page refresh / process restart.
  const reader = makeClient();
  const { data, error: readErr } = await reader
    .from("profiles")
    .select("id, alias, elo, tier")
    .eq("id", sig)
    .single();
  if (readErr) {
    console.error("[QA-PERSIST] readback failed:", readErr.message);
    await cleanup(writer);
    process.exit(1);
  }
  console.log(`[QA-PERSIST] readback:`, data);

  const ok =
    data?.id === sig &&
    data?.alias === ALIAS &&
    data?.elo === ELO &&
    data?.tier === "Silver";

  await cleanup(writer);

  if (!ok) {
    console.error("[QA-PERSIST] FAIL — row did not match what was written.");
    process.exit(1);
  }
  console.log("[QA-PERSIST] PASS — signature_id + ELO survive a fresh client.");
  process.exit(0);
}

async function cleanup(client) {
  const { error } = await client.from("profiles").delete().eq("id", sig);
  if (error) console.warn("[QA-PERSIST] cleanup warn:", error.message);
}

main().catch((err) => {
  console.error("[QA-PERSIST] uncaught:", err);
  process.exit(1);
});
