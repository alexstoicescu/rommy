# Rommy Changelog

## [v3.7.0] - The "Atu Ledger" Update
This patch introduces transparency to the Syndicate's accounting and rebalances the power of the Atu card, turning it into a high-risk, high-reward liability.

⚖️ Scoring: The Atu Protocol
Fixed Liability: The Atu card is now valued at exactly 50 points. Being caught with this card at the end of a round will significantly impact your ELO progression.

Ownership Tracking: The system now identifies the holder of the Atu upon round completion, displaying their name as a "Marked" label on the card UI.

📊 UI/UX: After-Action Report (AAR)
Score Breakdown: Replaced the winner announcement with a comprehensive performance table. Players can now see exactly how their final scores were calculated, including specific Atu penalties.

Identity Tags: Added neon-red ownership overlays for key cards in the end-game summary to increase competitive transparency.

⚙️ Maintenance
Version Sync: Updated the Main Menu to reflect the v3.7.0 build.

Backbone Consistency: Verified that the 50-point penalty is correctly synchronized with the Supabase permanent ledger.

## [v3.6.0] - The "Wildcard Fix" Update
This patch corrects a critical flaw in the Meld Validator, ensuring that Jokers correctly fulfill their role as polymorphic assets within the Syndicate.

🧠 Logic: Wildcard Polymorphism
Set Inheritance: Refactored isValidSet to allow Jokers to mimic any rank. A 3+3+Joker combo is now correctly identified as a valid Three-of-a-Kind.

Run Gap-Filling: Enhanced isValidRun to utilize Jokers as bridges for missing sequential values.

Suit Uniqueness Check: Optimized the validator to ignore Joker suit-identity while strictly enforcing suit uniqueness for the remaining natural cards in a set.

🧪 Quality Assurance
Regression Testing: Implemented five new test cases covering edge-case Joker placements in sets and runs.

Suit Conflict Resolution: Fixed a bug where two identical cards (e.g., 3♥ and 3♥) plus a Joker were erroneously passing; the validator now correctly identifies this as an illegal set.

## [v3.5.0] - The "Lean Circuitry" Update
This update introduces a specialized execution mode for low-memory environments, ensuring the Syndicate remains accessible on legacy hardware and lightweight mobile terminals.

⚙️ Optimization: Memory Management
Lean Mode Toggle: Added a dedicated performance switch located directly beneath the Audio Interface.

Shadow Stripping: Implemented a 'Flat-Focus' profile that removes expensive box-shadows and backdrop filters, reducing GPU memory overhead.

DOM Virtualization: The Discarded Pile now utilizes dynamic unmounting. Only tiles visible in the viewport occupy memory, drastically lowering the DOM node count.

🧠 Logic: Resource Allocation
Texture Purging: Optional disabling of high-fidelity SVG patterns to prioritize RAM for game-state logic.

GC Efficiency: Optimized the lifecycle of socket listeners and event handlers to minimize Garbage Collection "hitches" during long sessions.

Static Freezing: Hard-coded game assets are now immutable, reducing the workload on the browser's reactivity engine.

🎨 UI: Terminal Feedback
Efficiency Palette: Introduced a high-contrast, low-glow visual theme for Lean Mode that maintains legibility without the hardware cost.

## [v3.4.0] - The "Kinetic Zero" Update

⚡ Performance: GPU Authorization

Hardware Acceleration: Shifted all animation calculations to the GPU via translate3d and scale transforms, eliminating CPU-bound layout thrashing.

Compositor Optimization: Implemented will-change hints for active tiles, reducing frame-drop during high-speed meld placements.

⚙️ Logic: Intelligent Culling

Memoized Components: Applied React.memo across the tile hierarchy, reducing unnecessary DOM reconciliations by up to 80% during complex turns.

Stable Callbacks: Refactored event pipelines with useCallback to prevent cascading re-renders in the Player Hand.

🎨 UI: Adaptive Fidelity

Performance Mode: Introduced a toggle to switch between 'High Neon' and 'High Performance', allowing users on legacy hardware to maintain a stable 60 FPS.

## [v3.3.0] - The "Fluid Disposal" Update

⚙️ UX: Natural Navigation

Kinetic Scrolling: Mapped vertical mouse wheel input to the horizontal axis for the Discarded Pile. Browsing history is now a zero-friction experience.

Scroll Multiplier: Tuned the wheel-to-scroll ratio to ensure quick scanning of large tile sets without losing precision.

🎨 UI: Expanded Horizon

Dimensional Boost: Extended the Discarded Pile container by 10%, providing a wider field of view for discarded assets.

Edge Masking: Implemented neon-alpha gradients at container boundaries to provide visual cues for scrollable content.

⚡ Optimization

Event Throttling: Utilized passive event listeners to ensure the new scrolling logic does not impact game loop performance or frame timing.

## [v3.2.0] - The "Chroma Clarity" Update

🎨 Visual: Luminous Calibration

Cyber-Cyan Shift: Re-engineered the Blue card palette to a higher-luminance Cyan to prevent visual bleeding on dark displays.

Onyx Silhouetting: Replaced pure black cards with a multi-layered Onyx Gray, featuring a white inner glow for perfect edge definition.

🧠 UX: Tactile Patterning

Pattern Mapping: Introduced unique geometric textures (lines/grids) for each card color, enabling identification through shape and texture, not just hue.

High-Contrast Mode: Added a system-wide toggle to amplify glow intensity and typography for players in high-glare environments.

⚙️ Optimization

Luminance Balancing: Verified all card combinations meet a minimum 4.5:1 contrast ratio against the primary board background.da


## [v3.1.0] - The "Adaptive Terminal" Update

🎨 UI/UX: Fluid Scaling

Viewport Locking: Bound the game container to 100vh to eliminate vertical browser scrolling on all resolutions.

Proportional Shrink: Implemented dynamic scaling for the game board, ensuring it remains fully visible on high-DPI 1440p laptop monitors.

Independent Sidebar: Isolated the sidebar scrolling logic to prevent layout shifts during intense matches.

⚙️ Optimization

High-DPI Support: Tuned CSS clamp() values for tiles to maintain legibility on 15-inch displays while maximizing play area.

## [v3.0.0] - The "Hidden Backbone" Update
This major release marks the transition from a session-based prototype to a permanent, server-authorized competitive platform. By integrating Supabase via the MCP protocol, the Syndicate's reputation ledger is now etched into a global database while maintaining the intimacy of private room play.

🏛️ Persistent Infrastructure
PostgreSQL Integration: Migrated all player data and match results to a permanent Supabase backend. Reputation is no longer tied to a browser cache.

Sovereign Identity: Your Signature ID now acts as a global primary key. Your ELO, rank, and alias follow you across any terminal or mobile device via the Neural Link.

Match Vaulting: Every game now generates a permanent record in the matches table, including the full v2.7.0 Match Tape JSON for future replay analysis.

🧠 Server-Side Authority
Reputation Shield: Relocated ELO calculation logic from the client to the server. This prevents client-side state manipulation and ensures the integrity of the Bronze/Silver/Gold hierarchy.

Atomic Transactions: Rank updates now trigger only upon verified match completion. The server performs a handshake with the database before emitting the final results to the room.

Ghost-Bot Verification: Maintained the "Ghost" protocol. Bots participate in the arena but are filtered out of the database's ELO commit layer.

📡 Hidden Leaderboard UI
Localized Competition: The sidebar leaderboard now dynamically fetches data from the global backbone but filters it to show only the players present in your current room.

Live Rank Sync: Metallic neon badges (Bronz, Argint, Aur) are synchronized in real-time. When a player joins a room, their true global standing is instantly revealed to their opponents.

Threshold Calibration: Finalized the high-velocity progression tiers:

Bronze (Bronz): 1200 - 1299

Silver (Argint): 1300 - 1399

Gold (Aur): 1400+

🛡️ Resiliency & Protocol
Ephemeral Fallover: Implemented a "Shadow Mode." If the Supabase connection is interrupted, the game remains playable in a local-only state with a terminal warning.

Infrastructure-as-Code: Utilized Claude Code MCP to automate the creation of SQL tables and security policies, ensuring the database structure is perfectly aligned with the game logic.

## [v2.9.7]

⚙️ Reputation CalibrationHigh-Velocity Progression: Reduced the gap between tiers to $100$ ELO points to accelerate player "Rank Up" moments.Balanced Entry: Bronze remains the baseline at $1200$.🎨 Visual IdentityMetallic Neon: Finalized hex-color mapping for Bronze, Silver, and Gold.Localized Strings: Verified Bronz, Argint, and Aur translations are active in Romanian mode.

## [v2.9.6] - The "Classic Tier" Update

UI: Universal Hierarchy: Replaced thematic ranks with Bronze, Silver, and Gold for instant skill-level recognition.

Visual: Metallic Neon: Implemented tier-specific color palettes with custom CSS neon glows and "breathing" animations for top-tier players.

Logic: Threshold Standardization: Unified the tier-mapping utility across the frontend and backend.

Localization: Fully translated the new tiers into Romanian (Bronz / Argint / Aur).

## [v2.9.5] - The "Reputation Committal" Patch

Logic: Human-to-Human Lock: Hardened the detection for multi-human matches to ensure ELO delta triggers even when bots are present.

Persistence: Transactional Updates: Moved the ELO calculation to the start of the GameOver sequence to prevent data loss during session disconnects.

UI: Tier Standardization: Verified STRADĂ / Street logic scales across languages and correctly maps to the 1200 baseline.

## [v2.9.4] - The "Agency" Update

Logic: Agency Restoration: Permanently removed output randomness from player actions (Discard/Meld).

UX: Grid-Aware Sorting: Re-engineered the sorting engine to work within the 44-slot tactical rack.

Feel: Persistent Selection: Integrated a "Lift and Lock" selection system that survives hand re-organizations.

## [v2.9.3] - The "Direct Action" Update

UI: Redundancy Purge: Removed the manual 'End Turn' button to declutter the arena and prioritize tactile gameplay.

UX: Reactive Discarding: Implemented a magenta target-glow on the discard pile that activates only when a legal discard is possible.

Feel: Magnetic Hand-off: Enhanced the snap-physics for discarded tiles to ensure turn-ending moves feel intentional and satisfying.

## [v2.9.2] - The "Landing Pad" Patch

🎨 UI/UX Visibility

Target Scaling: Doubled the vertical footprint of the 'New Meld' drop zone to improve drag-and-drop ergonomics.

Typography Overhaul: Enhanced the instructional text with increased scale and a cyan neon glow for better legibility against the green felt.

Dashed Border Logic: Swapped the legacy dotted border for a high-visibility dashed terminal style.

⚙️ Reactive Feedback

Proximity Glow: Implemented a reactive background shift that triggers when tiles are in motion, signaling the drop zone is "ready for input."

Spatial Anchor: Verified the drop zone remains centered and responsive across varied screen resolutions.

## [v2.9.1] Vercel Build Fix 

Fixing a Vercel TS6133 build failure by removing two dead sort comparators from App.tsx; tsc -b + vite build now pass. Next: confirm the Vercel deploy goes green.

## [v2.9.0] - The "Tactile Rack" Update

UX: Spatial Hand Management: Replaced the automatic hand-row with a 44-slot interactive grid for manual organization.

Logic: Insertion Physics: Tiles now "shove" neighbors aside when dropped, preventing overlaps while maintaining a natural physical flow.

Persistence: Memory Handshake: Tile slot coordinates are now persistent across sessions and refreshes via the Reputation Ledger.

Feel: High-Fidelity Feedback: Added scale-on-drag and magnetic-snap animations with synced audio feedback.

## [v2.8.2] - The "Ace High" Hotfix⚙️ Game LogicCorrected Point Attribution: Updated the scoring engine to differentiate between "Low Aces" (5 pts) and "High Aces" (10 pts) in run formations.Meld Validation: Hardened the sequence checker to ensure $12-13-1$ is recognized as a high-value strategic play.📊 Analytics SyncReputation Accuracy: Ensured that the 10-point value is correctly factored into the Elo calculation and the "Match Tape" post-game debrief.

## [v2.8.1] - The "True Reputation" Patch

⚙️ Reputation Ledger Refinement

Human-Centric Math: Refactored the Elo engine to strictly ignore bot outcomes. Human reputation is now calculated solely against other human signatures.

Match Tiering: Introduced RANKED (Pure Human) and SOCIAL (Bot-assisted) game states.

Tier Architecture: Established a new hierarchy of reputation titles: Street, Operator, and Syndicate Elite.

🎨 UI/UX Integrity

Status Watermarking: Added clear visual indicators for unranked matches on the After Action Report.

Dynamic Rating Colors: Integrated suit-reactive color coding for Elo changes (Gain: Cyan, Loss: Magenta, Neutral: Gray).

Neural Link Guard: Hardened the signature_id persistence to prevent identity loss during major ranking updates.

## [v2.8.0] - The "Syndicate Ledger" Update

⚙️ Reputation Architecture

Accountless Persistence: Implemented UUID-based signatures to track nicknames without requiring logins.

Reputation Engine: Fully integrated the Elo math system with suit-reactive volatility.

Identity Portability: Added "Neural Link" codes for moving aliases across different browsers.

🤖 Synthetic Calibration

Bot Tiers: Introduced weighted scoring for bot matches to maintain leaderboard integrity.

## [v2.7.0] – The Intelligence Hub
Focus: Implementing full-match state recording, skill heuristics, and visual replay capabilities.

🧠 Core Infrastructure: The Match Tape
Event-Sourced Logging: Implemented a new MatchRecorder middleware that captures every socket event (Draw, Meld, Discard, Scramble) alongside a complete delta of the game state.

State Snapshots: The system now generates a MatchTape JSON object at the conclusion of every game, providing a verifiable record of the entire match.

Deterministic Replay Engine: Developed a playback utility that can reconstruct the board state at any specific timestamp from the captured logs.

📊 Analytics & Heuristics
Fortune Factor (Luck vs. Skill): Created an algorithm to compare tiles drawn from the deck versus tiles successfully melded. This produces a "Luck" percentage for each player.

The Pivot Point: Implemented a data visualization that identifies the exact turn where the winning player’s point trajectory surpassed the competition.

Tile Efficiency Metric: Tracks how long high-value tiles (like the Joker) were held before being used or discarded, scoring players on their "Reaction Speed."

📺 UI/UX: After Action Report (AAR)
Bento-Style Report: Replaced the simple "Winner" screen with a high-fidelity, multi-panel dashboard containing MVP stats and performance charts.

Visual Replay Scrubber: Integrated a playback controller (Play, Pause, 2x Speed) at the bottom of the board once a game ends.

Hype Correlation: Integrated data from the v2.5.0 Hype Meter to show how "Scramble Intensity" correlated with the initial hand quality.

🛠️ Technical Refinements
Localization Sync: Fully localized the new "Intelligence" strings (e.g., "Pivot Point," "Match Tape," "Efficiency Score") in both ENG and RO.

Memory Management: Optimized the replay engine to prevent memory leaks during long scrubs by using a virtualized state-clearing method.

Socket Middleware: Updated backend handlers to ensure recording doesn't add measurable latency to live gameplay (processed on a separate thread).

## [v2.6.1] - The "Spatial Balance" Patch

🎨 Layout Calibration

Zonal Anchoring: Implemented a fixed 'Table Header' to lock the Draw and Discard piles to the top of the board.

Tactical Scaling: Re-calibrated clamp() values for tiles to prioritize board real estate for late-game melds.

Infinite Table: Enabled vertical scrolling for the Meld Area, ensuring the UI remains stable regardless of the number of tiles on the board.

## [v2.6.0] - The "Systemic Logic" Overhaul

⚙️ Core Architecture

Dynamic Grid Engine: Full refactor to a 100vh reactive grid system.

Fluid Scaling: Integrated clamp() typography and component sizing.

Localization 2.0: Standardized 'ENG/RO' ISO codes and 'Meld' terminology.

🎨 Visual Identity

Command Center Header: Synchronized branding and navigation heights.

Tactile Materials: Refined varnished wood and rim-lit bakelite tile textures.

Atmospheric Polish: Slow-pulse neon branding and suit-reactive rack lighting.

# [v2.5.3] - The "Global Standard" Patch

🌐 Localization Logic

Contextual Translation: Fully replaced "Etalare" with "Meld" in all English UI contexts.

Status Updates: Refined in-game status messages to match the active language's terminology.

🎨 UI/UX Refinement

ISO Update: Standardized language switcher labels to 'ENG' and 'RO'.

Branding Consistency: Verified alignment and versioning on the landing portal.

## [v2.5.2] - The "Scale & Spacing" Patch

🎨 UI/UX Refinement

Branding Clearance: Resolved the overlap between the language switcher and the Rommy logo by implementing a top-down spacing hierarchy in the login modal.

Global Tile Scaling: Increased all in-game tile dimensions by 15% to enhance visibility and tabletop immersion.

Component Harmonization: Adjusted hand-rack and board containers to seamlessly fit the new tile scale.

## [v2.5.1] - The "Gatekeeper" Hotfix

🎨 UI/UX Refinement

Corrected Positioning: Re-anchored the language toggle to the modal interior, resolving the overlap conflict with the main branding.

Layout Stability: Implemented fixed-container logic for localized strings to prevent "UI jumping" when switching between English and Romanian.

Branding Integrity: Restored the visual hierarchy of the Rommy logo by clearing the top-right corner of the login gate.

## [v2.5.0] - The "Friends Update" (Final Gate)

⚙️ Core Infrastructure

Major Version Bump: Officially transitioned to v2.5.0 across the entire application ecosystem.

Localization Layer: Integrated a dual-language (EN/RO) engine for the landing page.

Preference Persistence: Implemented local storage hooks to remember user language settings across sessions.

🎨 Landing UI/UX

Neon Language Toggle: Added a high-contrast, atmospheric language switcher to the login portal.

Footer Update: Refreshed the versioning and subtitle to reflect the "Friends Update" milestone.

## [v2.4.2] - The "Joker Refit" Patch

UI: Glyph Replacement

Replaced the overflowing "JOKER" string with a centered, high-visibility "J" glyph.

VISUAL: Hierarchy

Adjusted Joker font-scaling to 140% of standard tile values for better tactical recognition.

CSS: Center-Alignment Fix

Refactored the internal flexbox of the Tile component to handle single-character symbols without offset.

## [v2.4.1] - The "Pulse & Polish" Patch

🎨 Visual Polish

Grid Integration: Realigned the 'Rommy' logo box to create a clean 'L-shaped' container structure at the top-left, anchoring it perfectly to the left sidebar column and the top header row.

Dominant Branding: Increased the visual weight and font size of the 'Rommy' logo.

Atmospheric Animation: Implemented a slow, smooth, cyan/magenta neon pulse animation to the main logo to enhance the terminal atmosphere without creating visual fatigue.

# [v2.4.0] - The "Hype Foundation"

SOCKET: Shared Momentum

Implemented backend aggregation for multi-player cursor velocity.

UX: The Hype Engine

Integrated a top-docked neon progress bar to track group activity during the scramble phase.

VISUAL: Reward Logic

Added "Max Hype" screen-shake and glow triggers for successful group coordination.

## [v2.3.0] - The "Control & Exit" Update

⚙️ Audio Management

Local Volume Control: Integrated a persistent volume slider in the left sidebar.

UX Centralization: Aligned audio controls with the leaderboard for a unified "Management" panel.

Persistence: Volume settings are now saved to localStorage, preventing audio resets between rounds.

🚪 Session Control

Manual Quit Feature: Implemented an "Exit Terminal" action to break session persistence.

State Clearing: The quit action now wipes local session tokens and informs the server to purge the player from the active room, solving the "reconnection loop" during development.

## [v2.2.2] - The "Atmospheric Polish" Update

Visual Refinements

Materiality: Added varnish-effect gradients to the wooden racks for improved texture depth.

Atmospheric Lighting: Implemented "rim-lighting" on tiles via inset shadows, replacing flat outer glows for a more realistic tabletop feel.

Spatial Depth: Added dynamic drop shadows to tiles on the board and within the discard zone to ground them in the 3D space.

CRT Typography: Applied subtle glow and spacing adjustments to UI headers to reinforce the "Terminal" aesthetic without sacrificing legibility.

## [v2.1.1] - The "Classic Wood" Rollback

VISUAL: Aesthetic Rollback

Removed "glowing data chip" tile styling.

Re-implemented classic, solid-background tiles with suit-matching subtle neon outlines for clarity.

Deleted the "digital dark dock" and restored the classic "wooden rack" styling for the player hand.

VISUAL: Refinement

Integrated a warm neon backlighting effect to the new wooden rack.

Muted the Atu card glow, replacing it with a subtle, suit-matching neon border outline.

## [v2.2.1] - The "Pixel Perfect" Hotfix

UI Refinement: Resolved viewport overflow issues that caused phantom scrollbars on the left sidebar.

Component Anchoring: Adjusted deck positioning to sit cleanly inside the arena boundary, preventing geometry clipping.

Console Alignment: Docked sorting controls flush with the player console for a unified interface.

## [v2.2.0] - The "Immersive Arena" Layout

CSS Architecture: Migrated to a strict 100vh Grid (320px 1fr), eliminating dead space and maximizing viewport utility.

Dynamic Scaling: Applied flex-grow properties to the main play area, allowing the board to dynamically expand to fill modern high-res displays.

Component Anchoring: Refactored the deck placement, using absolute positioning to dock the draw/discard piles directly onto the board's top geometry.

## [v2.1.0] - The "Neon Tactician" Update

UI/UX Architecture

Unified Sidebar: Consolidated the "Vestiar" (Lobby), player management buttons, and the global Leaderboard into a strict Left Column hierarchy.

Header Optimization: Relocated the Rommy logo to the top-left and anchored the "Reguli Rapide" modal button to the top-right Meta-Bar.

Deck Anchoring: Removed dead space above the board. Docked the Draw and Discard piles directly flush with the top-center edge of the active play area.

Visual Upgrades

Digital Player Dock: Deleted the legacy wooden rack styling. Replaced it with a sleek, translucent dark dock featuring neon borders.

Data Chip Tiles: Overhauled tile CSS. Removed physical bakelite styling in favor of dark translucent backgrounds, suit-specific neon borders, and glowing text-shadow values.

Interactive Hover States: Added tactile CSS scaling and intensified glow effects when users hover over their data chips.

## [v2.0.0] - The "Command Center" Update

Overview
This release overhauls the frontend architecture, moving away from absolute positioning and floating elements to a rigid, responsive CSS Grid. We also shipped critical backend patches for deck randomization, session pacing, and audio scoping. The terminal aesthetic remains, but the UX is now built for 2026 standards.

🎨 UI/UX Overhaul

Grid Architecture: Implemented a three-column "Bento" layout for strict visual hierarchy.

Persistent HUD: Docked the global leaderboard permanently on the left side of the screen for live tactical visibility.

Decluttered Viewport: Converted the static "Reguli Rapide" text block into a sleek, blurred modal overlay triggered by a UI icon.

Expanded Player Console: Stretched the bottom hand area full-width and anchored the sorting controls directly above the tiles for faster interaction.

Clean Meta-Bar: Consolidated room codes, language toggles, and player counts into a top-right administrative header.

⚙️ Core Engine & Pacing

Tactical Intermission: Extended the post-game scoreboard phase from 15 to 45 seconds.

Ready-Up Bypass: Added a unanimous vote button to instantly skip the intermission and deal the next round.

Audio Scoping: Restricted the 10-second turn alarm to play strictly on the active player's local client, silencing it for spectators and waiting players.

🐛 Critical Bug Fixes

True Randomization: Replaced biased .sort() methods with a strict Fisher-Yates algorithm for deck shuffling.

Host Advantage Fix: Extracted the "Atu" tile prior to the deal sequence, ensuring Player 1 no longer mathematically swallows the trump card.

Rupere Validation Logic: Decoupled discard draw rules. Players can now temporarily stage the discard tile pre-Etalare, and freely draw it post-Etalare to build on the public board.

Twin Tile Resolution: Assigned globally unique UUIDs to all 106 tiles to prevent the system from flagging duplicate cards as the 50-point Atu.

## [v1.8.1] - The "Quiet Room" Hotfix

UX: Audio Targeting

Restricted the 10-second turn warning alarm so it only plays locally for the active player. Spectators and waiting players will no longer hear it.

## [v1.8.0] - The "HUD & Pacing" Update

UX: Persistent Leaderboard

Relocated global standings to a permanent dock on the left side of the game board.

GAME LOOP: Intermission Pacing

Extended post-game break from 15s to 45s.

Introduced a unanimous "Ready Up" bypass to instantly start the next round.

## [v1.7.1] - The "Fair Deal" Hotfix

LOGIC: Deterministic Dealing Fixed

Replaced biased shuffling with a strict Fisher-Yates algorithm.

Extracted the Atu tile prior to hand distribution to prevent host advantage.

Enforced strict 15/14 tile distribution for the opening round.

## [v1.7.0] - The "Tactile Wash" Update

UX: Collaborative Scramble

Introduced a 10-second pre-game SCRAMBLING phase.

Implemented shared cursor physics for face-down tile mixing.

Added a terminal glitch transition to the deal phase.

## [v1.6.0] - The "Persistence" Update

ARCHITECTURE: Session Decoupling

Migrated from volatile Socket ID tracking to persistent UUID Session Tokens stored via localStorage.

NETWORKING: Reconnect Grace Period

Players now have a 60-second window to refresh the page or regain WiFi without losing their seat at the table.

FEATURE: Global Leaderboards

Room state now tracks cumulative scores across multiple consecutive rounds.

## [v1.5.0] - The "Diplomat" Update

FEATURE: Multi-Language Support

Integrated i18next for seamless language switching.

Added en.json and ro.json dictionaries.

Implemented a cyberpunk-themed language toggle in the HUD.

UX: Dynamic String Loading

Refactored static UI components to use reactive translation keys.

## [v1.4.4] - The "Acoustic Overdrive" Patch

UX/AUDIO: Signal Amplification

Upgraded the audio playback engine to utilize the Web Audio API.

Implemented a Gain Node to overdrive the 'My Turn' notification sound, artificially boosting the decibel output to ensure it cuts through background noise.

## [v1.4.3] - The "Absolute Joly" Hotfix

SCORING BUGFIX: Strict Joker Point Evaluation

Fixed an edge-case logic flaw where the Joker would inherit contextual point values (e.g., scoring 25 points when substituting a '1' in a group).

Enforced a strict type-check intercept: The scoring engine now guarantees Jokers always evaluate to exactly 50 points before any positional logic is applied.

## [v1.4.2] - The "Audit" Patch

BUGFIX: Point Weight Recalibration

Fixed an issue where the '1' tile was universally awarding 25 points. It now dynamically scores 5, 10, or 25 points based on its structural position (Start of Run, End of Run, or Group).

Enforced the Joker (Joly) 50-point override during Etalare calculation, stripping its inherited substitute value.

## [v1.4.0] - The "Atu" Update

FEATURE: The Atu Protocol

The first tile of the deck is now globally designated as the 'Atu' (Trump) for the match.

Added a dedicated Atu display slot to the main game board HUD.

SCORING: Atu Bonus

The player who receives the Atu is automatically awarded a guaranteed 50-point bonus to their score tally.

Added global toast notifications to announce when the Atu is claimed.

## [v1.3.1] - The "Joly Protocol" Hotfix

SCORING BUGFIX: Joker Etalare Weight

Rewrote the initial meld (Etalare) calculation engine.

Jokers (Joly) are now correctly valued at a flat 50 points during meld calculation, rather than inheriting the face value of their substituted tile.

Impact: Any valid formation containing a Joker now automatically satisfies the 45-point Etalare threshold.

## [v1.2.3] - The "High-Roller" Patch

CONTENT: Rulebook Calibration

Updated the Quick Rules HUD to include the critical high-value scoring rule: Tiles of '1' used in a tertiary set (1-1-1) are valued at 25 points each.

## [v1.2.2] - The "Deep Breath" Patch

BALANCING: Turn Timer Adjustment

Increased the global failsafe turn timer from an aggressive 30 seconds (Blitz) to the classic 120 seconds (Standard) to allow players sufficient time for complex meld calculations.

## [v1.2.1] - The "Staged Rupere & Security" Patch

BUGFIX: First-Discard Ban

Implemented strict rule enforcement: Players can no longer perform Rupere on the very first card discarded in a match.

SECURITY: Staged Rupere Protocol (Anti-Cheat)

Prevented an information-leak exploit where players could grab the discard pile, view the cards, and intentionally fail the meld.

Mechanic Update: Players performing Rupere are now given ONLY the target card initially. The server holds the remaining discarded cards in a secure pending state. The bonus cards are automatically injected into the player's hand only after the server validates a successful meld using the target card.

UX: Added localized toast notifications to guide players through the Staged Rupere flow.

## [v1.2.0] - The "Grid Stabilization" Update
(Post-Rupere UI Architecture Overhaul)

UI/UX: Central Pillar Architecture

Unified the core gameplay elements (Game Board, Action Buttons, Sort Controls, and Player Tile Rack) into a single bounded container.

Player Tile Rack width is now restricted to match the exact width of the game board, eliminating the "infinite stretch" footer issue.

UI/UX: Symmetrical Master Grid

Replaced the volatile flex-layout with a strict, 3-column CSS Grid (1fr / minmax / 1fr).

The main play area is mathematically locked to the absolute dead-center of the monitor on wide displays, counterweighted by invisible gutters.

UI/UX: Orbital HUD Alignment

Recalibrated the Quick Rules side-panel axes (align-items: center, justify-self: center) so it floats perfectly in the center of the right-hand void, creating balanced negative space.

BUGFIX: Collision & Clipping Eradication

Purged rogue absolute positioning that caused the Rules panel to clip through the active game board.

SYSTEM: Responsive Cloaking Protocol

Added a max-width: 1400px media query fail-safe. If a user's screen is too narrow to safely render the board and rules side-by-side, the Quick Rules panel will automatically cloak (hide) to protect the integrity of the core game board.

## [v1.1.0] - The "Rupere & Shadows" Update
(Updates since Checkpoint 24 - Terminal Synthwave Immersion)

FEATURE: Fog of War (Privacy Protocol) * Opponent hands are now masked. Card counts > 3 display as 3+ or ??.

Warning systems stay active for opponents with 3 or fewer tiles (Endgame Protocol).

FEATURE: The 'Rupere' Mechanic * Server-side validation implemented for drawing from the discard pile.

Added conditional turn-locks: Players must meld the drawn discard tile in the same turn or the discard action is rejected by the server.

UX/UI: Smart 'Etalare' Button

Etalare (Meld) button is now state-aware.

Grayed out/disabled until valid parameters (≥45 points, valid sequences/sets) are selected.

Visual feedback added to selected tiles (Neon glow + Y-axis lift) for pre-meld clarity.

UX/UI: Persistent Cheat Sheet

Added a persistent "Quick Rules" side-panel to utilize ultra-wide screen real estate without breaking the central focal point.

UX/UI: Viewport & Alignment Overhaul

Locked the root viewport to prevent accidental mobile-scrolling (100vw/100vh).

Migrated primary board to a symmetrical 3-column Grid for absolute geometric centering.

Added Z-axis floating shadow effects to the main play area.

## Checkpoint 24 — Terminal Synth-wave Immersion Overhaul

- **Outrun background (`.app`)** — felt green replaced with `#0d0221`. Layered backgrounds: the deep navy/purple base, a 44px × 44px neon-purple grid (`linear-gradient(rgba(188, 19, 254, 0.15) 1px, transparent 1px)` + the 90deg twin), and a `radial-gradient(circle, transparent 20%, #0d0221 100%)` vignette. `.app-header` switches to a translucent panel with `backdrop-filter: blur(4px)` and a thin neon-purple bottom border.
- **CRT scanlines + flicker** — new `.app::after` (fixed, `pointer-events: none`, `z-index: 50`, `mix-blend-mode: multiply`) paints a `repeating-linear-gradient` of `rgba(18, 16, 33, 0.1)` every 2px. A 6s `crt-flicker` keyframe pulses opacity 0.9 → 1.0 → 0.9 for the slow flicker.
- **Theme color plumbing** — `App.tsx` reads the local player's `colorIndex`, looks up the matching entry in `PLAYER_THEMES`, and sets `style={{ '--theme-color': … }}` on `.app`. `GameBoard` also sets `--theme-color` on each `.player-zone` so tiles inside that zone glow in the *owner's* color.
- **Terminal HUD typography** — `room-code`, `room-count`, `player-tag`, `turn-indicator`, `turn-timer`, `rack-count`, `player-zone__points/cards/warn`, `draw-pile__badge` all forced to `'Courier New', Courier, monospace`. Static neon flicker via a small `text-shadow` keyed off `var(--theme-color)` (using `color-mix` for a softer outer glow).
- **Neon tiles (`TileComponent.css`)** — base border softened to `1px solid rgba(255, 255, 255, 0.1)`. `:hover` and `.tile--selected` now apply a sharp two-stop neon outer glow `0 0 6px / 0 0 14px var(--theme-color)` plus the existing `translateY(-8px)` lift, with the border picking up the theme color too.

## Checkpoint 23 — Lean: Turn Broadcast Verify, 3-Tile Warning & Tile Hover

- **Proactive turn broadcast (verify)** — confirmed `advanceTurn` runs `startTurnTimer` then `broadcastGameState` in that order (added in Checkpoint 21), so the moment a player discards every other client receives the fresh `turnEndsAt` and starts ticking down from 120s. No change required.
- **3-tile warning label** — opponent zone header now reads **`⚠️ N TILES`** (was `⚠️ N CARDS LEFT`) when an opponent's `handCount <= 3`. Continues to use `.player-zone__warn` (red glow + pulse).
- **Tile hover** — `TileComponent.css`: `transition: transform 0.1s, box-shadow 0.1s` and `:hover { transform: translateY(-8px); … }` so any tile (rack, draft, board, discard) lifts cleanly under the cursor.

## Checkpoint 22 — Deck Counter, Live Points & Hand-Size HUD

- **Server payload (`PublicRoomView`)** — `publicView` now also computes `handCounts: Record<socketId, number>` (per-player tile count) and `meldPoints: Record<socketId, number>` (sum of `scoreMeldFinal(meld)` across each player's zone, using the *exact* end-of-round scoring engine so the live total matches the final round score). `drawPileCount` was already shipped.
- **Live point totals (client)** — every `.player-zone__header` now shows a `Points: N` badge derived from `meldPoints[socketId]`. Updates with every `game_state_update`.
- **Opponent card counts + 3-card warning** — opponent zone headers display `Cards: N`. When `cards <= 3` for any opponent, a glowing red **`⚠️ N CARDS LEFT`** pill appears next to their name and pulses with the existing `pulse` keyframe.
- **Local rack counter** — a `Cards: N` badge sits at the right edge of the rack-controls bar so the local player never has to manually count their hand (which can balloon past 30 after a Rupere chain).
- **Draw pile counter** — `DrawPile` accepts a `count` prop and renders an `N left` badge directly under the face-down stack. Wraps the existing `.draw-pile` in a small flex column so the badge stays anchored regardless of disabled/empty styling.

## Checkpoint 21 — Proactive Turn Sync & Global Timer Visibility

- **`advanceTurn` is now self-contained (server)** — folded `stopTurnTimer → reset flags → bump currentTurn → startTurnTimer → broadcastGameState` into a single function. The new `turnEndsAt` is set inside `startTurnTimer` *before* `broadcastGameState` fires, so non-active players receive the fresh 120s deadline the instant the previous player discards (previously they were stuck with `turnEndsAt = null` until they themselves drew).
- **Call-site cleanup** — `discard_tile`, `runAutoPass`, and `runBotTurn` no longer call `broadcastGameState` / `startTurnTimer` after `advanceTurn`; the function does it for them. `start_game` and `restart_game` still order it explicitly because they broadcast `room_update` first.
- **Global timer visibility (client)** — turn line consolidated into a single span with the format `Rami's Turn (115s remaining)` (or `Your Turn (Ns remaining)`). `turnEndsAt` was already shipped to all clients; with the server fix the countdown now ticks for everyone in real time. New `.turn-indicator--low` mirrors the existing pulse-red treatment when ≤10s remain.
- **Discard sound for all (client)** — `App.tsx` keeps a `prevDiscardLenRef` and plays `playDiscard()` whenever the incoming `state.discardPile.length` exceeds the prior length. Removed the local emit-time `playDiscard` calls in the discard drag-end branch and the End-Turn button so the sound is driven exclusively by the server broadcast — every connected player hears the thud at the same moment.

## Checkpoint 20.1 — Rupere "Take All" Fix & Round 1 Lockout

- **Take-all explicit (server)** — `rupere_tile` now uses an explicitly named `takenTiles` for the splice (`room.discardPile.splice(pickIdx)`), `player.hand.push(...takenTiles)` to add the whole array, and snapshots `takenTiles.slice()` into `room.lastRupere.tiles` so Undo continues to lift every tile back into the pile in the right order. Behaviour was already correct; the rewrite makes the intent unmissable and adds a debug log of every tile id taken. The must-use rule still pins to the specific clicked tile only.
- **Round 1 lockout (server)** — `rupere_tile` rejects with a generic `error` event ("The discard pile is locked until the first round is complete.") whenever `room.discardPile.length <= room.players.length`. With the seeded discard the pile only crosses that threshold after every player has had a chance to discard once.
- **Visual lock (client)** — `DiscardPile` accepts a new `locked` prop. When set, every slot gets `opacity: 0.5; filter: grayscale(0.45); cursor: not-allowed`, the buttons are disabled, hover highlight is suppressed, and the container's `title` reads "Discard pile locked — first round is in progress". `App.tsx` derives `locked` as `gameStarted && discardPile.length <= gamePlayers.length` and passes it through.

## Checkpoint 20 — Grouped Board & Player Theming

- **Per-player meld zones (server)** — `Room.board` is now `Record<string, Tile[][]>` keyed by `socketId`. `dealRoom` initialises an empty array for every seated player; `restart_game` resets the map. Every meld lives in exactly one zone — the zone owned by the player who first placed it via Etalare or `play_new_meld`.
- **Owner-aware handlers** — `attach_tile` and `replace_joker` payloads now include `targetPlayerId`. The server resolves `room.board[targetPlayerId]` for the lookup and rejects `Invalid meld target` when the zone or index is out of range. The active player's `meldedScore` still accrues from the *delta* of the touched meld regardless of whose zone it sits in.
- **`Player.colorIndex`** — every joining human and bot is assigned the lowest unused index in `[0..3]`; surfaced in `publicView` so all clients can theme each player consistently. The client uses `PLAYER_THEMES = ['#00f2ff', '#ff007f', '#39ff14', '#ffcc00']`.
- **Bot updates** — `findAttachment` now returns `{ tile, ownerId, meldIndex, chosen }` and scans every zone, so bots happily attach to anyone's melds. Bot Etalare/`play_new_meld` push into `room.board[bot.socketId]`.
- **Zoned UI (client)** — `GameBoard` now takes `board`, `draftMelds`, `players`, `themes`, `localPlayerId` and renders one `.player-zone` per `hasMeldedInitial` player. Each zone has a 2px solid border in the player's theme color, an inner glow (`box-shadow: 0 0 14px <color>33, inset 0 0 8px <color>22`), and a header reading **"Your Melds"** / **"<Name>'s Melds"** in the same color. Draft melds are rendered in their own dashed zone above the always-present **"Drop here to start a new meld"** drop zone.
- **Owner-aware drop ids** — meld droppable id format is now `board-meld:<ownerId>:<idx>` and joker slot ids are `joker-slot:<ownerId>:<idx>:<jokerId>`. New `parseBoardMeldId` and `parseJokerSlotId` helpers in `App.tsx` route drag-end events into `attach_tile` / `replace_joker` with the correct `targetPlayerId`.
- **Header player tag** — once the game starts, the local player's name renders as a pill in their theme color with a subtle glow, anchored next to the room code.

## Checkpoint 19.2 — Discard Spacing & Rupere Undo Safety

- **Discard pile readability** — `DiscardPile.css`: fan overlap relaxed from `-22px` → `-12px`; container gains `padding-left: 20px` so the first tile isn't clipped at the edge. `DiscardPile.tsx` writes an inline `style={{ zIndex: i + 1 }}` on each slot so the most recent discard always paints on top of older overlapping tiles.
- **Stricter pre-Etalare Rupere check (server)** — `rupere_tile` now runs `tryEtalare(hand + ruperedTile)` *and* verifies that `plan.flat()` actually contains the rupered tile id. A pick that just sits in the hand while other tiles assemble the 45 is rejected ("The Rupere tile must itself be part of your Etalare melds.").
- **`Room.lastRupere` snapshot** — server records `{ tiles, pickIdx, playerId }` on every successful Rupere so the move can be reversed. Cleared by any successful `submit_etalare` / `play_new_meld` / `attach_tile`, and on `advanceTurn`.
- **`undo_rupere` (server)** — new handler. Valid only if `lastRupere` is set, the requester is its `playerId`, and **all** of the rupered tiles are still in their hand (i.e., none has been melded). On success it splices the snapshot back into `discardPile` at the original `pickIdx`, removes those tile ids from the player's hand, resets `hasDrawn = false` and `mustUseTileId = null`, clears `lastRupere`, and broadcasts.
- **`mustUseTileId` over the wire** — added to `PlayerView` so the client can react to the obligation. `App.tsx` tracks it as state.
- **"Undo Pick" button (client)** — visible only on the local player's turn while `mustUseTileId !== null`, sits between Etalare and End-Turn in the board actions row, emits `undo_rupere`. Styled in saddle-brown / yellow to read as a soft "back-out" affordance.

## Checkpoint 19.1 — Join Flow & Normalization Fix

- **Code normalization (server)** — `join_room` continues to `.trim().toUpperCase()` the incoming code before `rooms.get(...)`, matching `check_room` and `create_room`. Verified end-to-end so a lowercase `abcd` typed by a user always lands on `ABCD` server-side.
- **Code normalization (client)** — `Landing.tsx`'s code input still upper-cases on `onChange`, and `trimmedCode = code.trim().toUpperCase()` is what's sent on click — both paths confirmed.
- **Join enable rule** — `canJoin` now strictly requires that `room_status` has come back for the *current* code AND `roomStatus.exists === true && !roomStatus.full && !roomStatus.gameStarted`. The button stays disabled until the probe confirms a joinable room, which prevents the silent "click does nothing" / `no_such_room` race.
- **Click handler** — extracted `handleJoin()` that early-returns if `!canJoin`, logs `Landing: Attempting join with <code>` to the console, and explicitly calls `onJoin(trimmedName, trimmedCode)`. The button's `onClick` is now `handleJoin` (no inline arrow).
- **Server log** — `join_room` logs `Server: Join request for room <code> from <name>` at entry, plus a `-> rejected: no such room` line on the `no_such_room` path so you can correlate client-side and server-side traces. The existing `join_error { reason: "no_such_room" }` continues to surface in the landing banner.

## Checkpoint 19 — Rupere Must-Use Rule & Rack Scaling

- **`Room.mustUseTileId: string | null`** added in `GameState.ts` (initialised by `createRoom`). On a successful `rupere_tile`, `room.mustUseTileId` is set to the *broken* tile id (the one the player targeted; bonus tiles swept up after it carry no obligation).
- **`discard_tile` enforcement** — before doing anything else with the discard, the handler checks: if `room.mustUseTileId` is set AND the player still holds that tile in `hand`, the discard is rejected with an `invalid_move` ("You must play the Rupere tile on the board before discarding.") and the client is force-resynced. If the player has already attached/melded the tile, it has left their hand and the check passes silently.
- **Auto-clear** — `advanceTurn(room)` now resets `room.mustUseTileId = null` alongside the existing `hasDrawn = false` and `stopTurnTimer`, so the obligation never leaks between turns.
- **Rack scaling** — `PlayerRack.css` now uses `flex-wrap: wrap` with `justify-content: center` and `max-height: 220px; overflow-y: auto` so 30+ tiles wrap onto a second row and remain reachable via scroll instead of pushing the rest of the layout off-screen.

## Checkpoint 18 — Linear Discard & Rupere Mechanics

- **Linear discard pile (client)** — `DiscardPile.tsx` rewritten to render the *whole* `discardPile` array as a horizontally fanned row (`margin-left: -22px` per tile so the value/color of each is visible). The container is `overflow-x: auto` and capped at `min(70vw, 520px)`. Each tile is a `<button>` with hover/focus state; the discard pile droppable target (for drag-to-discard) is preserved on the outer container.
- **Hover preview** — when the local player can Rupere, hovering tile *i* lifts and gold-glows tile *i* and every tile after it (`.discard-pile__slot--will-take` adds `translateY(-6px)` + drop-shadow + a 2px yellow ring), giving a clear preview of what a click would sweep up.
- **`rupere_tile({ tileId })` (server)** — new socket handler. Phase 1 gates: `currentTurn`, `!hasDrawn`. Rule A (pre-Etalare): only the most recently discarded tile is eligible; the server runs `tryEtalare([...player.hand, lastDiscard])` (greedy bot heuristic) and rejects if no legal Etalare can be assembled. Rule B (post-Etalare): any tile in the pile is eligible. Phase 2: `splice(pickIdx)` lifts that tile *and every tile after it* into `player.hand`, sets `room.hasDrawn = true`, broadcasts.
- **Turn-one starter rule** — already enforced by `dealRoom` setting `room.hasDrawn = true` for the opening hand: `draw_tile` and `draw_discard` reject with `already_drawn`, the new `rupere_tile` rejects with `cannot_rupere_now`, leaving the starter only Etalare/discard as valid actions. Comment in the rupere handler documents this.
- **Client routing** — `App.tsx` exposes `handleRupere(tileId)` that emits `rupere_tile`. The pile no longer fires the legacy `draw_discard` on outer click; clicks now happen per-tile and route through Rupere. `canRupere` is gated on `isMyTurn && !hasDrawn`. The legacy `draw_discard` server handler remains for backward compatibility but is no longer invoked from the UI.

## Checkpoint 17 — 106-Tile Deck & 4-Player Cap

- **106-tile deck (`rummy-server/src/GameState.ts`)** — `generateDeck` now iterates in fixed `["red","yellow","blue","black"]` order across two copies (`a`/`b`) producing exactly 104 numbered tiles, and appends two jokers `joker-a` / `joker-b`. Tile ids stay unique even though physical tiles can share value+color, so dnd-kit never sees colliding item ids. Fisher–Yates shuffle preserved.
- **Joker color** — `TileColor` extended to `"red" | "black" | "blue" | "yellow" | "joker"` on both `rummy-server/src/GameRules.ts` and `rummy-client/src/types/game.ts` so jokers carry `color: "joker"` rather than borrowing `red`/`black`. `TileComponent` only consults `COLOR_MAP` in the non-joker branch (jokers render via `tile--joker`); a `"joker"` entry was added to keep the `Record<TileColor, string>` type complete.
- **4-player cap** — `MAX_PLAYERS = 4` already enforced server-side in `join_room` and `add_bot`. Added a new `check_room({ code })` socket handler that returns `room_status { exists, full, playerCount, gameStarted }` so the client can probe a code *before* trying to join.
- **Dealing** — already consistent with the spec since Checkpoint 7: `dealRoom` shuffles the new deck, deals 15 to the starting player and 14 to the rest, seeds the discard with one tile, and the remainder becomes the draw pile. No code change required, verified.
- **Landing UI enforcement** — `Landing.tsx` accepts `onCheckRoom` and `roomStatus` props. As soon as the code field hits 4 chars the client emits `check_room`; the landing displays "Room Full (4/4 players)" / "Game already in progress" / "Room found — N/4 players" and disables the **Join Game** button (label flips to "Room Full") when the room is full.
- **Header counter** — header `.app-header__title-row` now shows `Players: N/4` next to the room code, derived from `lobbyPlayers.length`.

## Checkpoint 16 — Multi-room Lobby, Synth-Wave Audio & 120s Timer Fix

- **Multi-room engine** — `rummy-server/src/index.ts` rewritten around a `Map<string, Room>` registry plus a `socketToRoom: Map<socketId, code>`. Replaced `join_game` with two events: `create_room` (generates a unique 4-char code from a confusion-free alphabet, attaches the host, broadcasts) and `join_room({ code, name })` (validates length, looks up the room, attaches if open). Disconnect drops the room when no humans remain. Every game event now resolves via `getRoom(socket.id)` / `getActiveRoom(socket.id)` instead of a hardcoded room. `room_update` now ships `{ code, players[] }` so the client can render the code; new `room_created` and `room_joined` ack events. Bots are registered with synthetic socket ids so they're skipped when broadcasting per-socket state.
- **Timer bug fix** — `advanceTurn(room)` now calls `stopTurnTimer(room)` *first* (before `hasDrawn = false` and any index math), guaranteeing no stale callback can fire mid-transition. `stopTurnTimer` explicitly `clearTimeout`s and resets `room.turnEndsAt = null`. Turn duration bumped from 60s → **120s** (`TURN_DURATION_MS = 120_000`).
- **End-Turn action** — `App.tsx` adds a clear **End Turn (Discard)** button next to Etalare/Play-New-Meld. It's disabled until `hasDrawn === true`; clicking it discards `hand[hand.length - 1]` (the most-recently-drawn tile), making it explicit that discarding is what ends the turn. Drag-to-discard still works.
- **Synth-wave audio** — `rummy-client/src/audio.ts` rewritten as a small FM-style engine with detuned unison oscillators routed through a resonant low-pass `BiquadFilter`. `playDraw` is a sweeping sawtooth zap; `playDiscard` is a glide-down square thud; `playMeld` is a layered C major triad pad with staggered onsets; `playWin` is a synth-brass arpeggio over a sustained pad chord; `playTick` is a tight high blip.
- **Landing screen** — new `Landing.tsx` + `.css` with a neon-styled panel: Username field (persisted to `localStorage` under `rommy.username`), **Host Private Game** and **Join Game** buttons (the join button reveals a 4-char code input). `App.tsx` gates the entire game UI behind a `roomCode` state — without a room you see only the Landing.
- **Room code banner** — header gains an `.app-header__title-row` rendering "Room **ABCD**" in a courier yellow with a soft glow, so the host can read out the code at a glance. Errors from `join_error` surface as a brief banner.

## Checkpoint 15 — Audio, Dealing Animations & AI Bots

- **AI bot ("Rami")** — new `rummy-server/src/Bot.ts` with `findRuns`, `findSets`, `tryEtalare` (greedy non-overlapping pick that satisfies `canInitialMeld`), `tryNewMelds`, `findAttachment`, `pickDiscard` (highest-value real tile not part of any obvious in-hand meld). `index.ts` adds an `add_bot` socket event (joins a `Rami N` slot in the lobby), an `isBot` flag on `Player`, and `runBotTurn(room, bot)` — draws if needed, drops Etalare or play_new_meld if possible, attaches greedily up to 8 times, then discards. `maybeScheduleBotTurn(room)` queues the next bot move with a 2–3s "thinking" delay; it's invoked after `start_game`, `restart_game`, every successful `discard_tile`, and after auto-pass. `Player` and `PublicRoomView` carry `isBot`.
- **Heartbeat & reconnect** — Socket.IO server configured with `pingInterval: 10s`, `pingTimeout: 20s`. The client `connect` handler now emits `request_sync` on every connect (initial *and* reconnect), so the board, hand, timer, and modal state restore without a page refresh. A `disconnect` listener also logs the reason for visibility.
- **Synthesised audio** — new `rummy-client/src/audio.ts` (Web Audio API; no assets, no external dep). Exposes `playDraw` (rising blip), `playDiscard` (low thud), `playMeld` (two-note chime), `playWin` (4-note arpeggio), `playTick` (short high pip). Wired into `App.tsx`: `drawFromDeck`/`drawFromDiscard` → draw; discard drag-end → discard; `etalare_success` and play-new-meld click → meld; `game_over` listener → win; a ref-guarded effect plays `playTick` once per integer second when `turnSecondsRemaining ≤ 10`. AudioContext is created lazily and resumed on first event to satisfy autoplay policies.
- **Dealing animation** — `SortableTile` accepts an optional `style` prop and renders with class `.sortable-tile`. `PlayerRack` passes `style={{ '--idx': i }}` per tile. New `@keyframes tile-deal-in` (translateY −60px → 0, scale 0.85 → 1) runs `320ms` with `animation-delay: calc(var(--idx) * 50ms)`. New tiles drawn during play also benefit from the same staggered entrance.
- **Centering polish** — `.board-area` now uses `align-items: center` with a `max-width: 1100px` `.game-board`, keeping the felt centered on wide displays without losing the responsive 720px breakpoint added in Checkpoint 14.

## Checkpoint 14 — Joker Swapping, Hand Sorting & Turn Timers

- **Joker swap (Schimbarea Joly)** — `rummy-server/src/index.ts` adds `replace_joker({ tileId, jokerId, meldIndex })`. Gates on turn + `hasMeldedInitial`; for a Suita the replacement must equal the joker's reified effective value AND the meld's color; for a Formatie the replacement must equal the set value AND its color must not already be present among the meld's real tiles. On success the real tile slots in, the joker returns to the player's hand. `meldedScore` is left alone (the meld's reified values are unchanged). `GameRules.ts` exports `reifySuita` and `ReifiedTile` so the handler can introspect a run.
- **Joker drop target (client)** — `MeldComponent` (interactive=false) now wraps each joker tile in a new `JokerSlot` `useDroppable` with id `joker-slot:<meldId>:<jokerId>`. `App.tsx`'s collision detector prioritises joker hits over the parent meld so a drop on the joker goes to `replace_joker` instead of `attach_tile`. `handleDragEnd` parses the slot id and emits `replace_joker`.
- **Hand sorting** — `App.tsx` adds `sortMode: 'none' | 'groups' | 'runs'`. **Sort by Groups** sorts by value then color (good for spotting Formații); **Sort by Runs** sorts by color then value (good for spotting Suite). The sort is applied in the `rackTiles` derivation so it survives every `game_state_update`.
- **Turn timer (60s)** — `Room` gains `turnEndsAt: number | null`. Server keeps a per-room `setTimeout` (`startTurnTimer` / `stopTurnTimer`) that fires `runAutoPass(room)` on expiry — auto-draws if the player hasn't drawn, then auto-discards `hand[0]` and advances the turn (handles closing as a fallback). Timer is (re)started after `dealRoom`, after every successful `discard_tile`, on `restart_game`, and stopped on `finalizeRound` and empty-room cleanup. `discard_tile` and the dealer were factored through `advanceTurn` and `finalizeRound` helpers.
- **Turn timer UI** — client tracks `turnEndsAt` from `game_state_update`, ticks a local `now` every 500ms, displays "Time Remaining: Ns" next to the turn pill. Pulses red under 10s (`.turn-timer--low`).
- **Polish** — tile drop-shadow deepened with a hover lift. `App.css` gains `.rack-controls`, `.rack-sort`, `.turn-timer*`, plus a `@media (max-width: 720px)` block tightening header/board/rack padding for narrow viewports. dnd-kit's existing CSS transitions handle in-rack/draft slide animations; we did not pull in framer-motion.

## Checkpoint 12.1 — Turn Phase Validation (draw → discard)

- **`rummy-server/src/GameState.ts`** — `Room` gains `hasDrawn: boolean`. `createRoom` initialises it to `false`. `dealRoom` sets it to `true` on round start (player 0 was dealt 15 tiles, so they begin in a state where they can only discard). `publicView` ships `hasDrawn` to clients.
- **`rummy-server/src/index.ts`** — phase guards:
  - `draw_tile` and `draw_discard` reject with `action_error: 'already_drawn'` when `room.hasDrawn` is true; on success they set `room.hasDrawn = true` before broadcasting.
  - `discard_tile` rejects with `action_error: 'must_draw_first'` when `room.hasDrawn` is false. On a successful discard that did *not* close the round, it resets `room.hasDrawn = false` immediately before advancing the turn so the next player must draw before they can discard. Closing discards leave the flag alone (game has ended).
- **`rummy-client/src/App.tsx`** — added `hasDrawn` state synced from `game_state_update`. The discard `handleDragEnd` branch now logs `console.log('Attempting to discard:', activeId)` before emitting. `DrawPile` receives the new `disabled={hasDrawn}` prop.
- **`rummy-client/src/components/DrawPile.tsx` + `.css`** — accepts `disabled`, applies `.draw-pile--disabled` (grayscale + reduced opacity + `not-allowed` cursor) and short-circuits its `onClick` when set. The existing `empty` styling is unchanged.

## Checkpoint 12 — Final Victory & Scoring Engine

- **`rummy-server/src/GameRules.ts`** — added closing-time scoring functions distinct from the Etalare scorer (the "1" tile is 25 in every context here, vs 5/10 during Etalare). New `scoreEffectiveValue` (1=25, 2-9=5, 10-13=10), `scoreTileFinal` (in-hand penalty; jokers = 25), `scoreMeldFinal` (reifies the meld so Jolys inherit the value of whatever rung/value they replace), and `calculateFinalScores(players, winnerId, closingTile)` which returns `Record<socketId, number>`. Winner: `base + meldedScore` where base is 400 if the closing tile is a Joker, else 200; if it is a non-joker "1" the whole score is doubled. Other players: `meldedScore − sum(hand)` if `hasMeldedInitial`, otherwise a flat `-100`.
- **`rummy-server/src/GameState.ts`** — `Player` gains `meldedScore: number` (running closing-time tally). `dealRoom` resets it; `index.ts` initialises it to 0 on `join_game`.
- **`rummy-server/src/index.ts`** — running `meldedScore` updates: `submit_etalare` and `play_new_meld` add `Σ scoreMeldFinal(meld)` for every committed meld; `attach_tile` adds `scoreMeldFinal(newMeld) − scoreMeldFinal(oldMeld)` (the delta correctly attributes only the new tile's contribution). `discard_tile` now checks `player.hand.length === 0` after the splice — on closing it calls `calculateFinalScores`, builds a `name → score` map, sets `room.gameStarted = false`, `room.currentTurn = null`, and emits `game_over { winnerName, scores, closingTile }` to the room (turn is *not* advanced). New `restart_game` handler re-deals via `dealRoom` after the round has ended.
- **`rummy-client/src/components/GameOverModal.tsx` + `.css`** — new high-z-index overlay showing the title, winner, the closing tile rendered via `TileComponent`, a sortable leaderboard (winner row highlighted in yellow), and a **Play Again** button.
- **`rummy-client/src/App.tsx`** — new `gameOver` state, `socket.on('game_over', …)` listener, `handlePlayAgain` emits `restart_game` and clears the modal. Any `game_state_update` with `gameStarted === true` also clears the modal so a peer's restart dismisses it everywhere.

## Checkpoint 11.3 — UI Button Visibility Fix

- **`rummy-client/src/App.tsx`** — submit button render condition simplified to a single `isMyTurn` (`currentTurn === socket.id`). Removed the prior `gameStarted && draftMelds.length > 0` co-conditions that were hiding the button after a successful Etalare (when the broadcast pruned `draftMelds` to empty).
- **Handlers split** — `handleSubmitEtalare` (`socket.emit("submit_etalare", draftMelds)`) and `handlePlayNewMeld` (`socket.emit("play_new_meld", draftMelds)`). The button's `onClick` is `hasMelded ? handlePlayNewMeld : handleSubmitEtalare` and its text is `{hasMelded ? 'Play New Meld' : 'Etalare'}`.

## Checkpoint 11.2 — UI Button Desync Fix

- **`rummy-server/src/index.ts`** — `submit_etalare` now emits a targeted `etalare_success` event to the acting socket immediately after committing (`player.hasMeldedInitial = true`, board updated) and before the room-wide `broadcastGameState`. This gives the client a reliable per-socket acknowledgment independent of the broadcast payload.
- **`rummy-client/src/App.tsx`** — added `socket.on('etalare_success', () => setHasMelded(true))` in the listener `useEffect`. The submit button text is strictly `hasMelded ? 'Play New Meld' : 'Etalare'`. `handleSubmitMelds` now routes via an explicit `if/else` on `hasMelded` (`play_new_meld` vs `submit_etalare`).

## Checkpoint 10.1 — Math Engine Rewrite

- **`rummy-server/src/GameRules.ts`** — full rewrite. `isValidSuita` now bounds length 3..14, enforces single-color, strictly consecutive values, and the "1" exception (1-2-3 ✅, 12-13-1 ✅, 13-1-2 ❌). `isValidFormatie` enforces exactly 3 or 4 tiles, identical value, strictly distinct colors. Both functions enforce the Joly ratio (`real >= jokers * 2`).
- **Point calculation** — `calculateMeldPoints` reifies each tile's effective value and scores per-tile: 2..9 = 5; 10..13 = 10; "1" at the low end of a run = 5; "1" at the high end of a run = 10; "1" in a set = 25 per tile; Jolys inherit the value of whatever rung/value they mimic. Handles the 14-tile loop run (1..13,1) correctly — position 0 scores 5, position 13 scores 10.
- **`canInitialMeld`** — every meld must be a valid Suita or Formatie, the submission must contain at least one Suita, and total points must be >= 45. Logs `Etalare Attempt - Total Points: <n> Contains Suita: <b> Valid: <b>` before returning.
- The exported `Tile` interface continues to match the client's `src/types/game.ts` definition exactly.

## Checkpoint 11.1 — `hasMelded` Sync Bug Fix

- **`rummy-client/src/App.tsx`** — local state renamed `hasMeldedInitial` → `hasMelded`. Inside `game_state_update` the client now finds its own player record via `state.players.find(p => p.socketId === socket.id)` and calls `setHasMelded(localPlayer.hasMeldedInitial)` instead of trusting the top-level field; the wire payload typing keeps the server's `hasMeldedInitial` field name. Submit-button text remains `hasMelded ? 'Play New Meld' : 'Etalare (Submit Drop)'` and dispatches to `play_new_meld` vs `submit_etalare` accordingly.
- **Server payload** — verified `viewForSocket` already includes `hasMeldedInitial` on every entry of `players[]` via `publicView` (added in Checkpoint 10); no server change required.

## Checkpoint 11 — Attaching Tiles (Lipire) & Subsequent Plays

- **`rummy-server/src/index.ts`** — added `play_new_meld(proposedMelds)`: gates on turn + `hasMeldedInitial`, validates tile ownership and uniqueness, and runs `isValidSuita || isValidFormatie` per meld (no 45-pt floor). Added `attach_tile({ tileId, meldIndex })`: gates on turn + `hasMeldedInitial`, finds the tile in the player's hand, then attempts `[...meld, tile]` and `[tile, ...meld]` and accepts whichever still passes `isValidSuita || isValidFormatie`. Both handlers emit `invalid_move` + a per-socket `game_state_update` for snap-back on failure.
- **`rummy-client/src/components/MeldComponent.tsx` + `GameBoard.tsx`** — meld component now takes an `interactive` flag: when false (server-confirmed melds) it renders only `useDroppable` + plain `TileComponent`s; when true (draft melds) it keeps the existing `SortableContext`. `GameBoard` accepts `draftMelds` alongside `board` and renders confirmed melds with id `board-meld-<i>` and drafts with `draft-meld-<i>`.
- **`rummy-client/src/App.tsx`** — introduced a `draftMelds: Tile[][]` state. The rack is now derived as `hand.filter(t => !draftTileIds.has(t.id))`. `handleDragOver` only mutates draft state (rack ↔ draft, draft ↔ draft); drops on `board-meld-<i>` emit `attach_tile`; drops on `board-new-meld` create a new draft; the new-meld zone no longer touches `hand`. The submit button text flips to "Play New Meld" once `hasMeldedInitial` is true and dispatches to `play_new_meld` instead of `submit_etalare`. `invalid_move` and `game_state_update` clear stale drafts so the rack re-fills correctly.

## Checkpoint 10 — Initial Drop (Etalare) Validation

- **`rummy-server/src/GameState.ts`** — `Player` now tracks `hasMeldedInitial: boolean` (false on join; reset in `dealRoom`). `publicView` exposes it on each player; `viewForSocket` adds a top-level `hasMeldedInitial` for the recipient. `index.ts` initializes the flag when pushing a new player on `join_game`.
- **`rummy-server/src/index.ts`** — new `submit_etalare(proposedMelds)` handler: gates on active room + `currentTurn`, verifies every proposed tile is in the player's actual hand and has no duplicates, then runs `canInitialMeld(proposedMelds)`. On success it filters those tiles out of `player.hand`, `room.board.push(...proposedMelds)`, sets `player.hasMeldedInitial = true`, and re-broadcasts. On any failure it emits a per-socket `invalid_move` message **and** an immediate `game_state_update` so the client snaps back to authoritative state. Added a `request_sync` handler as a belt-and-braces resync trigger.
- **`rummy-client/src/App.tsx` + `App.css`** — track `hasMeldedInitial` from `game_state_update`. New "Etalare (Submit Drop)" button rendered in the board area, gated on `gameStarted && currentTurn === socket.id && !hasMeldedInitial && board.length > 0`; on click emits `submit_etalare` with the local `board`. Added `invalid_move` listener that `alert()`s the message and emits `request_sync` to force the server to re-broadcast state.

## Checkpoint 9 — Turn Management & Bug Audit

- **`rummy-server/src/index.ts`** — Added `socket.id === room.currentTurn` guards at the top of `draw_tile`, `draw_discard`, and `discard_tile` (rejected actions emit `action_error: 'not_your_turn'`). After a successful `discard_tile`, the server advances `room.currentTurn` to `room.players[(currentIdx + 1) % room.players.length].socketId` and re-broadcasts. `start_game` already seeded `currentTurn` to `players[0].socketId` via `dealRoom` (Checkpoint 7) — verified.
- **`rummy-client/src/App.tsx` + `App.css`** — Added `currentTurn` and `gamePlayers` state (populated from `game_state_update`). The header now renders a `Current Turn: <name>` indicator that switches to a highlighted "Your turn" pill (yellow background, glow) when `currentTurn === socket.id`.
- **Bug audit (no code change required)** — Verified `discard_tile` already routes to `room.discardPile` (not `drawPile`) and `DrawPile.tsx` renders a face-down CSS striped pattern with no tile data ever passed in.

## Checkpoint 8 — Server-Side Actions & Changelog Protocol

- **`rummy-server/src/index.ts`** — added three socket handlers, all gated by a new `getActiveRoomFor(socketId)` helper that requires `gameStarted` and membership: `draw_tile` shifts the front of `room.drawPile` into the requester's hand, `draw_discard` pops the top of `room.discardPile` into the hand, and `discard_tile(tileId)` removes the matching tile from the player's hand and pushes it onto `discardPile`. Each handler ends with `broadcastGameState(room)`; invalid actions emit a per-socket `action_error`.
- **`rummy-client/src/App.tsx`** — replaced the local `drawFromDeck` / `drawFromDiscard` mutations with thin `socket.emit('draw_tile')` and `socket.emit('draw_discard')` callbacks (still wired to the existing `DrawPile` / `DiscardPile` `onClick`). The `handleDragEnd` discard branch no longer touches local state — it now only `socket.emit('discard_tile', activeId)` once it confirms the tile is in `hand`. Authoritative state continues to arrive via `game_state_update`.
- **`CHANGELOG.md`** — created at workspace root to document checkpoint-level changes going forward; this is the first entry.
