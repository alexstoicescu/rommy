import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "./ScramblePile.css";

interface PeerCursor {
  sessionId: string;
  x: number; // 0..1 relative to container
  y: number; // 0..1 relative to container
  /** Local timestamp the position arrived; used to fade stale cursors. */
  ts: number;
}

interface Props {
  /** Server-provided seed so every client renders the same chaos. */
  seed: number;
  /** Epoch-ms when the scramble ends and the deal fires. */
  endsAt: number;
  /** SocketIO emitter — wired to forward cursor positions up. */
  onCursorMove: (x: number, y: number) => void;
  peers: PeerCursor[];
  /** Local player's color, used to tint their own (silent) cursor. */
  selfColor: string;
}

const TILE_COUNT = 106;
const CLUSTER_W = 520;
const CLUSTER_H = 360;
const TILE_W = 36;
const TILE_H = 52;
const BUMP_RADIUS = 90; // px; cursor influence radius
const BUMP_STRENGTH = 22; // px; cap of additional displacement
const CURSOR_THROTTLE_MS = 33; // ~30Hz
const CURSOR_FADE_MS = 1500;

/** Tiny seeded PRNG (mulberry32). Deterministic across clients. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface TileLayout {
  baseX: number;
  baseY: number;
  baseRot: number;
}

function buildLayout(seed: number): TileLayout[] {
  const rand = mulberry32(seed);
  const out: TileLayout[] = [];
  for (let i = 0; i < TILE_COUNT; i++) {
    // Bias toward the center via two random calls (gaussian-ish).
    const r1 = rand();
    const r2 = rand();
    const x = ((r1 + rand()) / 2) * (CLUSTER_W - TILE_W);
    const y = ((r2 + rand()) / 2) * (CLUSTER_H - TILE_H);
    const rot = (rand() - 0.5) * 60; // -30..30 deg
    out.push({ baseX: x, baseY: y, baseRot: rot });
  }
  return out;
}

export function ScramblePile({
  seed,
  endsAt,
  onCursorMove,
  peers,
  selfColor,
}: Props) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [localCursor, setLocalCursor] = useState<{ x: number; y: number } | null>(null);
  const lastEmitRef = useRef(0);

  const layout = useMemo(() => buildLayout(seed), [seed]);

  // 4Hz "now" tick for the countdown + cursor-fade calculations.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  const secondsLeft = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const ending = endsAt - now <= 800; // last ~0.8s -> glitch class

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    setLocalCursor({ x: px, y: py });
    // Throttle outbound emits.
    const t = performance.now();
    if (t - lastEmitRef.current >= CURSOR_THROTTLE_MS) {
      lastEmitRef.current = t;
      onCursorMove(px, py);
    }
  };

  const handlePointerLeave = () => {
    setLocalCursor(null);
  };

  // Combine local + active peer cursors into px-coords for bump physics.
  const livePeers = peers.filter((p) => now - p.ts < CURSOR_FADE_MS);
  const cursorsPx = useMemo(() => {
    const list: Array<{ x: number; y: number }> = [];
    if (localCursor) {
      list.push({
        x: localCursor.x * CLUSTER_W,
        y: localCursor.y * CLUSTER_H,
      });
    }
    for (const p of livePeers) {
      list.push({ x: p.x * CLUSTER_W, y: p.y * CLUSTER_H });
    }
    return list;
  }, [localCursor, livePeers]);

  return (
    <div
      ref={containerRef}
      className={`scramble${ending ? " scramble--ending" : ""}`}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      role="presentation"
      style={{ width: CLUSTER_W, height: CLUSTER_H }}
    >
      <div className="scramble__hud">
        <span className="scramble__label">{t("scramble_label")}</span>
        <span className="scramble__countdown">
          {t("scramble_countdown", { seconds: secondsLeft })}
        </span>
      </div>

      {layout.map((tile, i) => {
        // Sum bump displacement from every cursor.
        let dx = 0;
        let dy = 0;
        const tileCx = tile.baseX + TILE_W / 2;
        const tileCy = tile.baseY + TILE_H / 2;
        for (const c of cursorsPx) {
          const ox = tileCx - c.x;
          const oy = tileCy - c.y;
          const dist = Math.hypot(ox, oy);
          if (dist >= BUMP_RADIUS || dist === 0) continue;
          const force = (BUMP_RADIUS - dist) / BUMP_RADIUS; // 0..1
          dx += (ox / dist) * force * BUMP_STRENGTH;
          dy += (oy / dist) * force * BUMP_STRENGTH;
        }
        // Cap so multiple overlapping cursors don't fling tiles offscreen.
        const total = Math.hypot(dx, dy);
        if (total > BUMP_STRENGTH) {
          dx = (dx / total) * BUMP_STRENGTH;
          dy = (dy / total) * BUMP_STRENGTH;
        }
        const extraRot = (dx + dy) * 0.4;
        return (
          <div
            key={i}
            className="scramble__tile"
            style={{
              left: tile.baseX,
              top: tile.baseY,
              transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(${(tile.baseRot + extraRot).toFixed(1)}deg)`,
            }}
            aria-hidden="true"
          />
        );
      })}

      {livePeers.map((p) => {
        const age = now - p.ts;
        const alpha = Math.max(0, 1 - age / CURSOR_FADE_MS);
        return (
          <div
            key={p.sessionId}
            className="scramble__cursor scramble__cursor--peer"
            style={{
              left: p.x * CLUSTER_W,
              top: p.y * CLUSTER_H,
              opacity: alpha,
            }}
            aria-hidden="true"
          />
        );
      })}

      {localCursor && (
        <div
          className="scramble__cursor scramble__cursor--self"
          style={{
            left: localCursor.x * CLUSTER_W,
            top: localCursor.y * CLUSTER_H,
            background: selfColor,
            boxShadow: `0 0 12px ${selfColor}`,
          }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

export default ScramblePile;
