# NARUTO CARD GAME — Battle Simulator (unofficial, pre-release)

A fan simulator for Bandai's **NARUTO CARD GAME** (worldwide release Summer 2027), built from everything revealed so far.

## Play
Double-click `index.html`, or run `npm start` and open http://localhost:8765. You need an internet connection for fonts, key art and card images.

- **Tutorial**: a guided match that teaches the whole game.
- **Battle vs AI**: Genin, Chunin, Jonin and Kage (heuristic), plus **Hokage**, an AlphaZero-style bot (see below).
- **Local 2-Player**: hot-seat mode that hides your Supports while the other player looks.
- **Deck Builder**, **Revealed Cards** gallery, **How to Play**, and **Settings & House Rules**.

## Rules
Everything Bandai has confirmed is implemented:
- 15 Life
- 5 Chakra cards, flipped face-down to pay
- Leader [Recovery]
- The Summon card
- The face-down Support Area (up to 5 cards) and its jutsu timings
- EX Characters with Summon Requirements
- The 4 phases
- Rush, and summoned Characters can't attack that turn

The rules Bandai hasn't published yet are **House Rules** you can change in Settings: deck size, copy limit, hand size, draws per turn, and battle maths (POW vs HP). The official rulebook is expected from NYCC 2026 onwards.

## Cards
All 23 revealed cards (N-001 to N-022, Chakra, Summon) are scripted. Card text comes from naruto-cardgame.com and the Gen Con 2026 English demo cards. Research notes are in `research/bandai/`.

## Custom menu wallpaper
Put a video at `backgrounds/menu.mp4` (or `.webm`) and it becomes the animated full-screen main-menu background. It reacts to mouse parallax and clicks.

## Hokage AI (AlphaZero-style)
- **Network** (`js/az.js`): a small policy/value MLP. It encodes the game from the deciding player's point of view (their own hand, public board, trash, and counts of hidden cards) plus features for each legal move. The policy head scores every legal move; the value head predicts the winner.
- **Search**: PUCT Monte Carlo Tree Search guided by the network, with no random rollouts. Hidden information is handled by *determinization*. For every sampled world, the opponent's hand, face-down Supports and deck are re-dealt at random from what's unseen, and results are merged across worlds. The bot never sees your cards.
- **Exact replay**: the engine has a seeded RNG and logs every decision. Any decision point is rebuilt from the latest turn-start snapshot, which is what lets search and Web Workers work on the async engine.
- **Training** (`node tools/az-train.js [iterations]`):
  - Generation 0 imitates the Kage heuristic.
  - After that it's AlphaZero self-play on every CPU core: about 200 simulations per move, Dirichlet noise at the root, and temperature sampling early on.
  - It trains on a replay buffer with value MSE plus policy cross-entropy, using Adam.
  - A candidate is promoted to champion only if it wins at least 55% against the current champion.
  - The champion is exported to `js/az-weights.js`. State in `training/` can be resumed.
- **In the browser**, the search runs in Web Workers on all cores (`js/az-worker.js`) with a time budget per decision.

## Testing
`npm test` runs 200 headless AI-vs-AI games and reports crashes, effect errors and card usage. `node tools/replaytest.js` checks that games replay exactly from snapshots.

## Credits
NARUTO CARD GAME © Bandai. NARUTO © Masashi Kishimoto / Shueisha, TV Tokyo, Pierrot. Key art and backgrounds are loaded from naruto-cardgame.com; card images come from the ExBurst card database. Music: "Fakebit / Chiptune Music Pack" by Ragnar Random (CC0, OpenGameArt) in `music/`, plus original synthesized jingles. Drop your own `music/title|battle|tension|victory|defeat.mp3|ogg` files to replace them. This project is not affiliated with Bandai.
