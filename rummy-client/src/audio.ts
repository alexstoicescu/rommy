// Synth-wave / 80s-flavoured sound engine using the Web Audio API.
// Stacks detuned oscillators through a resonant low-pass for the "neon"
// feel without any sample assets.

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;

// 200-300% boost. Voice envelopes peak at ~0.18 so 2.5x keeps headroom
// before clipping while clearly raising perceived loudness.
const MASTER_GAIN = 2.5;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = MASTER_GAIN;
    masterGain.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function getMaster(): AudioNode | null {
  const c = getCtx();
  if (!c || !masterGain) return null;
  return masterGain;
}

/**
 * Browsers block AudioContexts from starting before a user gesture.
 * Call this from any click handler (e.g. Start Game / Join Room) to
 * guarantee the context is live by the time real sounds need to play.
 */
export function unlockAudio(): void {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") void c.resume();
}

interface VoiceOpts {
  freq: number;
  duration: number;
  type?: OscillatorType;
  detuneCents?: number;
  attack?: number;
  release?: number;
  peak?: number;
  filter?: { startHz: number; endHz: number; q: number };
  freqGlide?: { from: number; to: number; time: number };
  startAt?: number; // offset (s) from "now"
}

function voice(c: AudioContext, opts: VoiceOpts): void {
  const t0 = c.currentTime + (opts.startAt ?? 0);
  const dur = opts.duration;
  const attack = opts.attack ?? 0.005;
  const release = opts.release ?? dur;
  const peak = opts.peak ?? 0.18;
  const type = opts.type ?? "sawtooth";

  // Two detuned oscillators for a fat unison.
  const osc1 = c.createOscillator();
  const osc2 = c.createOscillator();
  osc1.type = type;
  osc2.type = type;
  osc1.detune.setValueAtTime(-(opts.detuneCents ?? 8), t0);
  osc2.detune.setValueAtTime(opts.detuneCents ?? 8, t0);

  if (opts.freqGlide) {
    osc1.frequency.setValueAtTime(opts.freqGlide.from, t0);
    osc2.frequency.setValueAtTime(opts.freqGlide.from, t0);
    osc1.frequency.exponentialRampToValueAtTime(
      Math.max(20, opts.freqGlide.to),
      t0 + opts.freqGlide.time,
    );
    osc2.frequency.exponentialRampToValueAtTime(
      Math.max(20, opts.freqGlide.to),
      t0 + opts.freqGlide.time,
    );
  } else {
    osc1.frequency.setValueAtTime(opts.freq, t0);
    osc2.frequency.setValueAtTime(opts.freq, t0);
  }

  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.setValueAtTime(opts.filter?.q ?? 6, t0);
  filter.frequency.setValueAtTime(opts.filter?.startHz ?? 1800, t0);
  if (opts.filter) {
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(60, opts.filter.endHz),
      t0 + dur,
    );
  }

  const gain = c.createGain();
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + release);

  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(gain);
  // Route through the master gain node (which lifts everything 2.5x)
  // before hitting the destination.
  gain.connect(masterGain ?? c.destination);

  osc1.start(t0);
  osc2.start(t0);
  osc1.stop(t0 + dur + 0.05);
  osc2.stop(t0 + dur + 0.05);
}

export function playDraw(): void {
  const c = getCtx();
  if (!c) return;
  // Quick resonant "zap": pitch glide upward through a sweeping filter.
  voice(c, {
    freq: 220,
    duration: 0.18,
    type: "sawtooth",
    peak: 0.16,
    detuneCents: 12,
    freqGlide: { from: 220, to: 880, time: 0.12 },
    filter: { startHz: 600, endHz: 4500, q: 9 },
  });
}

export function playDiscard(): void {
  const c = getCtx();
  if (!c) return;
  // Low downward thud.
  voice(c, {
    freq: 110,
    duration: 0.22,
    type: "square",
    peak: 0.22,
    detuneCents: 4,
    freqGlide: { from: 200, to: 70, time: 0.1 },
    filter: { startHz: 1500, endHz: 350, q: 4 },
  });
}

export function playMeld(): void {
  const c = getCtx();
  if (!c) return;
  // Lush major chord pad — root + 3rd + 5th, slightly staggered.
  const root = 523.25; // C5
  const third = 659.25; // E5
  const fifth = 783.99; // G5
  const common = {
    duration: 0.65,
    type: "sawtooth" as OscillatorType,
    detuneCents: 14,
    attack: 0.04,
    release: 0.6,
    peak: 0.12,
    filter: { startHz: 600, endHz: 2200, q: 7 },
  };
  voice(c, { ...common, freq: root, startAt: 0 });
  voice(c, { ...common, freq: third, startAt: 0.06 });
  voice(c, { ...common, freq: fifth, startAt: 0.12 });
}

export function playWin(): void {
  const c = getCtx();
  if (!c) return;
  // Synth-brass arpeggio over a sustained pad.
  const arp = [392.0, 523.25, 659.25, 783.99, 1046.5]; // G4..C6
  arp.forEach((f, i) => {
    voice(c, {
      freq: f,
      duration: 0.3,
      type: "sawtooth",
      detuneCents: 18,
      peak: 0.18,
      attack: 0.005,
      release: 0.28,
      filter: { startHz: 1200, endHz: 3500, q: 8 },
      startAt: i * 0.12,
    });
  });
  // Sustained pad chord underneath.
  voice(c, {
    freq: 261.63,
    duration: 1.4,
    type: "sawtooth",
    detuneCents: 22,
    peak: 0.09,
    attack: 0.08,
    release: 1.3,
    filter: { startHz: 500, endHz: 1800, q: 5 },
  });
}

export function playTick(): void {
  const c = getCtx();
  if (!c) return;
  // Sharp high blip.
  voice(c, {
    freq: 1600,
    duration: 0.05,
    type: "square",
    peak: 0.1,
    detuneCents: 0,
    attack: 0.001,
    release: 0.05,
  });
}

/**
 * "It's your turn" notification — bright two-note chime, deliberately
 * louder (peak 1.0 pre-master, then 2.5x via master gain) so it cuts
 * through whatever the user is doing in another tab.
 */
export function playYourTurn(): void {
  const c = getCtx();
  if (!c) return;
  voice(c, {
    freq: 880, // A5
    duration: 0.18,
    type: "triangle",
    peak: 1.0,
    detuneCents: 6,
    attack: 0.005,
    release: 0.16,
    filter: { startHz: 2000, endHz: 4000, q: 4 },
  });
  voice(c, {
    freq: 1318.5, // E6
    duration: 0.28,
    type: "triangle",
    peak: 1.0,
    detuneCents: 6,
    attack: 0.005,
    release: 0.26,
    filter: { startHz: 2400, endHz: 4500, q: 4 },
    startAt: 0.12,
  });
}
