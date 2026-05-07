```
██████╗  ██████╗ ███╗   ███╗███╗   ███╗██╗   ██╗
██╔══██╗██╔═══██╗████╗ ████║████╗ ████║╚██╗ ██╔╝
██████╔╝██║   ██║██╔████╔██║██╔████╔██║ ╚████╔╝
██╔══██╗██║   ██║██║╚██╔╝██║██║╚██╔╝██║  ╚██╔╝
██║  ██║╚██████╔╝██║ ╚═╝ ██║██║ ╚═╝ ██║   ██║
╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚═╝╚═╝     ╚═╝   ╚═╝
```

# Rommy — Romanian Rummy Engine

A professional, server-authoritative **Remi pe Tablă** engine wrapped in a
**synth-wave terminal aesthetic**. The server is the single source of truth
for every rule (Etalare, Lipire, Rupere, Joker swap, closing) and the React
client is purely a window into its state — no client-side rule fudging,
no rule duplication.

---

## Tech Stack

| Layer       | Choice |
| ----------- | ------ |
| Frontend    | **React 18** + **Vite** + **TypeScript** |
| DnD         | **@dnd-kit/core**, **@dnd-kit/sortable** |
| Realtime    | **Socket.IO** (heartbeat: 10s ping / 20s timeout) |
| Backend     | **Node.js** + **Express** + **TypeScript** (`ts-node` dev) |
| Audio       | **Web Audio API** (FM-style synth, no asset files) |

---

## Quickstart

```bash
# 1. Clone
git clone <repo-url> rommy && cd rommy

# 2. Install backend
cd rummy-server && npm install

# 3. Install frontend
cd ../rummy-client && npm install
```

Run them in two terminals:

```bash
# Terminal 1 — backend on :3001
cd rummy-server && npm run dev

# Terminal 2 — frontend on :5173
cd rummy-client && npm run dev
```

Open `http://localhost:5173`, type a username, **Host Private Game** to mint
a 4-character room code, then share it with friends (or click **Add Bot** for
a quick game with `Rami`, the greedy heuristic AI).

---

## Architecture — Flow & Rupere

```
                            ┌─────────────────┐
                            │   DRAW  PILE    │  (90+ tiles, face-down)
                            │   "82 left"     │
                            └────────┬────────┘
                                     │ draw_tile  (1 tile)
                                     ▼
              ┌──────────────────────────────────────────┐
              │              PLAYER  HAND                │
              │   (15 for starter, 14 for everyone else) │
              └─┬─────────────────┬──────────────────┬───┘
                │                 │                  │
   submit_etalare /          attach_tile         discard_tile
   play_new_meld         ╱  replace_joker             │
                ▼       ╱                              ▼
         ┌─────────────╱──────────────┐     ┌────────────────────┐
         │   PLAYER  MELD  ZONES      │     │   DISCARD  PILE    │
         │  (color-coded, per socket) │     │  (fanned, linear)  │
         │  ── A's Suite/Formații     │     │  T₀ T₁ T₂ T₃ T₄    │
         │  ── B's Suite/Formații     │     └────────┬───────────┘
         └────────────────────────────┘              │
                                                     │ rupere_tile(Tᵢ)
                                                     │
                                                     ▼
                                          ╔══════════════════════╗
                                          ║       RUPERE         ║
                                          ║                      ║
                                          ║  Pick tile Tᵢ AND    ║
                                          ║  every tile after it ║
                                          ║      Tᵢ ‥‥ Tₙ        ║
                                          ║          │           ║
                                          ║          ▼           ║
                                          ║   back into HAND     ║
                                          ║                      ║
                                          ║  ⚠ "must-use": Tᵢ    ║
                                          ║   has to land on the ║
                                          ║   board this turn.   ║
                                          ╚══════════════════════╝

   pre-Etalare:  only Tₙ (last tile) AND a valid 45-pt
                  Etalare *that uses Tₙ* must exist.
   post-Etalare: any Tᵢ in the pile is fair game.
   undo_rupere : valid until any meld/attach commits this turn.
```

---

## Core Mechanics

- **Etalare (initial drop, 45-point threshold)**
  Every melds must individually pass `isValidSuita || isValidFormatie`,
  the submission must include **at least one Suita**, and the sum of
  `calculateMeldPoints` must be **≥ 45**. Rejections roll back via
  per-socket `invalid_move` + `game_state_update`.

- **Joker (Joly) ratio**
  `realTiles >= jokers * 2` — enforced in both Suita and Formatie.

- **Joker reification**
  Suita validity is decided by `reifySuita(meld)` which tries every legal
  starting value (including the K → 1 high ending) and assigns each Joly
  the rung it stands in for. The `replace_joker` handler uses the same
  reified value to decide whether a tile from your hand can swap in.

- **Rupere "Take All"**
  `discardPile.splice(pickIdx)` lifts the targeted tile *and every tile
  after it* into the player's hand. The targeted tile becomes
  `room.mustUseTileId` — the player cannot discard until that exact tile
  is on the board. Locked entirely while `discardPile.length ≤ players.length`
  (Round 1 lockout). **Undo Pick** is offered until any meld/attach commits.

- **120s proactive timer sync**
  `advanceTurn` is one call: `stopTurnTimer → reset flags → bump
  currentTurn → startTurnTimer → broadcastGameState`. The fresh
  `turnEndsAt` is computed *before* the broadcast, so every connected
  client receives the new countdown the instant the previous player
  discards — no waiting for a draw to start the timer.

- **Closing (Închiderea) & end-of-round scoring**
  An empty hand after a valid `discard_tile` ends the round. Scoring
  uses a *separate* table from Etalare (the "1" tile is **25** in every
  context here, vs 5/10 during Etalare). Winner: `base + meldedScore`,
  base = 400 if the closing tile is a Joker, else 200; if the closing
  tile is a non-joker "1" the entire winner score is doubled. Losers
  score `meldedScore − sum(hand)` if they melded, otherwise a flat
  **−100**.

- **AI bot — `Rami`**
  Greedy heuristic in `rummy-server/src/Bot.ts`: enumerate runs and sets,
  pick a non-overlapping subset that satisfies `canInitialMeld`, attach
  greedily across **every** zone, discard the highest-value real tile not
  already in any obvious meld. 2–3s "thinking" delay before each move.

---

## Repo Layout

```
rommy/
├── rummy-server/          ← Node + Socket.IO authoritative engine
│   └── src/
│       ├── GameRules.ts   ← Suita/Formatie validators, scoring
│       ├── GameState.ts   ← Room/Player types, deck, dealer, public view
│       ├── Bot.ts         ← Rami's heuristic
│       └── index.ts       ← Socket handlers (rooms, turns, timer, rupere)
├── rummy-client/          ← React + Vite + dnd-kit
│   └── src/
│       ├── App.tsx        ← Lobby → game state machine, drag routing
│       ├── audio.ts       ← Synth-wave Web Audio engine
│       └── components/    ← Landing, Tile, Rack, Board, Modal, …
├── CHANGELOG.md           ← Per-checkpoint engineering notes
└── README.md              ← You are here
```

---

> **Migration Key: v1.0 Stable**
