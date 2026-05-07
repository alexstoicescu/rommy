# Rommy — Architecture

## Project Name
Rommy

## Tech Stack
- **Frontend:** React (Vite, TypeScript)
- **Backend:** Node.js / Socket.IO (Planned)

## Current Checkpoint
**7 — Server State & Lobby Completed.**

### Authoritative state (server)
- `rummy-server/src/GameState.ts` owns `Room`, `Player`, deck
  generation (moved off the client), dealing logic, and view
  filtering. The client must not generate decks anymore.
- `Room` holds `players`, `board`, `drawPile`, `discardPile`,
  `currentTurn`, `gameStarted`. A single hardcoded room `rommy-1`
  exists for now; multi-room support comes later.
- Dealing: 15 tiles to player 0 (they discard to start), 14 to
  everyone else, 1 seeds the discard, the rest is the draw pile.

### Socket events
- `join_game { name? }` → server adds the socket to `rommy-1` (max 4,
  rejected if full / game in progress / already joined).
- `room_update` (broadcast) → `{ players, gameStarted }` for the
  lobby UI.
- `start_game` → deals and emits per-player `game_state_update`.
- `game_state_update` (per socket) → that player's `hand` plus the
  public view: `players[]` with `handCount`, `board`, `drawPileCount`,
  full `discardPile`, `currentTurn`, `gameStarted`. **Other players'
  hands are never sent over the wire** to prevent cheating.
- On disconnect the player is dropped; if the room empties it resets.

### Client wiring
- `App.tsx` no longer calls `generateDeck()` locally — initial state
  is empty. `handleJoinGame` / `handleStartGame` emit the lobby
  events. `game_state_update` overwrites local state. The local
  `drawPile` array is intentionally empty since the server only ships
  a count (`drawPileCount`); the `DrawPile` UI uses that count.
- Lobby controls live in the header (Join / Start buttons, player
  list / status line).

---

**6 — Multiplayer Backend Initialization & Rule Engine Completed.**

### Backend (`../rummy-server`)
- Express + Socket.IO server on port `3001`. CORS allowed from
  `http://localhost:5173`.
- `npm run dev` (ts-node) for local development.
- `src/index.ts` logs `User connected: <id>` on every socket connection.
- **`src/GameRules.ts` is the single source of truth** for Romanian
  Rummy validation, derived from the official PDF. Pure functions:
  `calculateMeldPoints`, `isValidSuita`, `isValidFormatie`,
  `canInitialMeld`. The client must not duplicate or override these
  rules — any future validation should round-trip through the server.
- The `Tile` interface is mirrored in both projects. They MUST stay in
  sync; treat the server copy as canonical.

### Client wiring
- `socket.io-client` installed in `rummy-client`. `App.tsx` instantiates
  `socket = io('http://localhost:3001')` at module scope and a
  `useEffect` logs `'Connected to server!'` on `'connect'`. The socket
  is not yet used for game state — UI still mocks state locally.

---

**5 — Draw and Discard Mechanics Completed.**

### Pile State (`App.tsx`)
- `drawPile: Tile[]` and `discardPile: Tile[]` are seeded from
  `generateDeck()`: 14 tiles → `hand`, 1 → `discardPile`, remaining 91 →
  `drawPile`.
- `drawFromDeck` / `drawFromDiscard` pop the top (last) tile of their
  pile and push it onto `hand`. Wired to `onClick` of `DrawPile` /
  `DiscardPile` respectively. The draw pile shows a disabled visual
  state when empty.

### Discard via Drag
- `DiscardPile` registers a `useDroppable` with id `'discard-pile'`.
- `handleDragEnd` checks for `over.id === 'discard-pile'` *before*
  container/meld logic. If the active tile is in `hand`, it is removed
  from the hand and appended to `discardPile`. Drops on the discard
  pile from the board are ignored (only rack tiles can be discarded).

---

**4 — Cross-Container Dragging Completed.**

Multi-container `@dnd-kit` is wired across the **rack**, **existing
melds**, and a **new-meld drop zone**. State lives in `App.tsx` as two
`useState` slices: `hand: Tile[]` (rack) and `board: Tile[][]` (melds).

### Container IDs
- `rack` — the player's hand. `PlayerRack` registers a `useDroppable`
  and a `SortableContext` under this id.
- `meld-<i>` — each existing meld. `MeldComponent` registers both a
  `useDroppable` and a `SortableContext` under its id.
- `board-new-meld` — droppable rendered by `GameBoard`; dropping here
  creates a fresh meld containing just the dragged tile.

### Drag handlers (in `App.tsx`)
- `handleDragOver` — when a tile crosses into a *different* container
  (rack ↔ meld, meld ↔ meld), it is removed from its source array and
  inserted into the destination at the position of the `over` target.
  Empty melds are pruned. Drags over `board-new-meld` are deferred.
- `handleDragEnd` — finalizes the drop. Same-container drops use
  `arrayMove` to reorder. Drops onto `board-new-meld` remove the tile
  from its source and append `[tile]` as a new meld.

`DndContext` uses `closestCorners` collision detection (better suited
to multi-container sortable layouts than `closestCenter`).

### Table Components
- `DrawPile` — face-down stock placeholder.
- `DiscardPile` — renders an optional `Tile` via `TileComponent`, or an
  empty placeholder slot when none is supplied.
- `GameBoard` — large felt-style container that will host melded groups.

`App.tsx` arranges these into the table layout: piles row at top, board
in the middle, `PlayerRack` at the bottom.

## Data Schema Summary
Defined in `src/types/game.ts`:

### `Tile`
Represents a single Romanian Rummy tile.
- `id: string` — unique identifier (e.g. `red-7-0`, `joker-1`).
- `color: TileColor` — one of `"red" | "black" | "blue" | "yellow"`.
- `value: number` — face value 1–13 (0 for jokers).
- `isJoker: boolean` — flag for joker tiles.

### `Player`
Represents a participant in the game.
- `id: string` — unique player id.
- `name: string` — display name.
- `hand: Tile[]` — tiles currently held by the player.
- `hasMeldedInitial: boolean` — whether the player has met the opening meld threshold.

### `GameState`
The full game state shared between clients.
- `drawPile: Tile[]` — face-down stock of tiles to draw from.
- `discardPile: Tile[]` — face-up discard pile.
- `board: Meld[]` — public area of melded tile groups (`Meld = Tile[]`).
- `players: Player[]` — all players in turn order.
- `currentPlayerIndex: number` — index into `players` whose turn it is.

### Helper
- `generateDeck(): Tile[]` — produces a shuffled 106-tile deck (2 copies × 4 colors × 13 values + 2 jokers, Fisher–Yates shuffled).
