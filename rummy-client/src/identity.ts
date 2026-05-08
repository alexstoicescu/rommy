// LocalIdentity — the client half of the Syndicate Reputation Ledger.
// We track two values in localStorage:
//
//   rommy_signature_id  — UUID minted at first load. Persistent.
//                          Exportable as a copyable string so a player
//                          can transfer their alias + ELO to another
//                          device by importing it there.
//   rommy_alias         — display name. Mirrored from the username
//                          form on the landing page.
//
// The signatureId is distinct from rommy_session_id (the per-browser
// ghost-protocol id) so that clearing the session doesn't cost a
// player their ELO history, and conversely a player can carry their
// reputation across browsers/devices via the export string.

const SIGNATURE_KEY = "rommy_signature_id";
const ALIAS_KEY = "rommy_alias";

function safeRandomUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for older browsers — non-cryptographic but uniqueness
  // probability is fine for this domain.
  return `sig-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Read the persistent signatureId, minting a fresh one (and writing
 * it to localStorage) if this is the first visit. Idempotent and
 * safe to call from module scope.
 */
export function getSignatureId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = window.localStorage.getItem(SIGNATURE_KEY);
    if (!id) {
      id = safeRandomUUID();
      window.localStorage.setItem(SIGNATURE_KEY, id);
    }
    return id;
  } catch {
    // localStorage unavailable (private mode, etc.) — return an
    // ephemeral id so the user can still play this session.
    return safeRandomUUID();
  }
}

export function getAlias(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(ALIAS_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setAlias(alias: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ALIAS_KEY, alias);
  } catch {
    /* ignore */
  }
}

/**
 * Overwrite the local signatureId — used when a player imports an
 * exported identity from another device. Returns the value that's
 * now stored.
 */
export function importSignatureId(newId: string): string {
  if (typeof window === "undefined") return newId;
  try {
    window.localStorage.setItem(SIGNATURE_KEY, newId);
  } catch {
    /* ignore */
  }
  return newId;
}
