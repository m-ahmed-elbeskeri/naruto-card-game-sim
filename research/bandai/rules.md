# NARUTO CARD GAME (Bandai) — Rules Research

Research date: 2026-09-27. This is the Bandai game (official site naruto-cardgame.com, announced 2026-06-18, rules shown 2026-07-29, first demos at Gen Con 2026, worldwide release Summer 2027). It is NOT Naruto Mythos TCG.

**No official rulebook or comprehensive rules have been published yet.** Bandai says more will be revealed at NYCC 2026 (panel "NARUTO: What's Next?", Oct 10 2026) and that "More Information Revealed" happens in December 2026 (roadmap image).

## Confidence levels

- **CONFIRMED-OFFICIAL**: stated on naruto-cardgame.com, the official Overview Trailer (YouTube 3o_wqkZJfr0), official card faces, or the official PR Newswire release.
- **CONFIRMED-PRINT**: printed on an official Bandai item handed out at Gen Con 2026, such as the official playmat or English demo cards (SAMPLE / NOT FOR SALE). Photos and scans were posted on X and transcribed by narutoreca.com. These are real but could change before release.
- **REPORTED**: taken from a secondary write-up of the demo (VRSUS, 2026-08-08, "unofficial fan explainer built from official preview materials and Gen Con demo footage"). Treat as low confidence. Some of these points conflict with card text.
- **INFERRED**: my own reasoning from card text or from how other Bandai games work (One Piece Card Game / Union Arena).

## Sources

- Official EN site: https://www.naruto-cardgame.com/en/welcome/ (ABOUT page), https://www.naruto-cardgame.com/en/ , news pages under /en/news/
- Official JP site: https://www.naruto-cardgame.com/jp/welcome/ (uses "登場カード" for the Summon card and "デッキ50枚" for the deck)
- Official Overview Trailer: https://www.youtube.com/watch?v=3o_wqkZJfr0 (151 s). I read the captions and extracted frames.
- Official First Look Trailer: https://www.youtube.com/watch?v=2AByN4yTij4 (65 s)
- PR Newswire, "NARUTO CARD GAME Shows Its Hand": https://www.prnewswire.com/news-releases/naruto-card-game-shows-its-hand-302837560.html
- narutoreca.com (fan tracker): https://narutoreca.com/en/guide/ , /en/cards/ , /en/keywords/ , /en/news/2026-07-31-gencon-playmat-turn-phases-zones/ , /en/news/2026-08-03-gencon-2026-closing-roundup/ , /en/news/2026-08-04-demo-deck-list-reading/ , /en/news/2026-08-04-chakra-card-complete-guide/
- VRSUS: https://www.vrsus.io/here-is-how-the-naruto-card-game-actually-plays-and-it-looks-closer-to-yu-gi-oh-than-you-think/
- noisypixel, universetcg, boxed.gg, narutohq, ANN, gamepedia.jp. These only repeat the official overview. GameSpot (Cloudflare) and Crunchyroll could not be fetched. Reddit returned access-forbidden through the tool.

---

## 1. Deck construction

| Rule | Status | Source |
|---|---|---|
| Each player uses 1 Leader card, a 50-card main deck, 5 Chakra cards and 1 Summon card, for 57 cards in total. | CONFIRMED-OFFICIAL | JP site: "リーダーカード1枚とデッキ50枚、チャクラカード5枚、登場カード1枚". The trailer's "DECK BUILDING" graphic shows 1 Leader + 50 + 5 Chakra + 1 Summon. The EN site's "deck of 51 cards" counts the Leader plus the 50-card deck. |
| The 50 main-deck cards are Character cards, and **EX Characters go in the main deck**. There is no separate EX deck. | CONFIRMED-OFFICIAL | Trailer graphic: "50 Character Cards — includes EX Characters". Card-types graphic: "Character Card — includes EX Character". |
| The main deck contains only Characters and EX Characters. No event, stage or other card type has been shown. | CONFIRMED-OFFICIAL (5 card types only) | "you'll play using 5 types of cards" |
| Characters must match the Leader's color. | CONFIRMED-OFFICIAL | "Chosen based on your Leader's color" / "Brew a deck full of strong ninja that share the same color as your leader". |
| Colors seen so far: magenta/red (Naruto Leader side), cyan/blue (Sasuke Leader side), green/teal (Tsunade art card). No color names have been announced, and the total number of colors is unknown. | INFERRED from frame colors | card images |
| Copy limit per card (for example 4 like OP or UA) | UNKNOWN. If you need a default, INFERRED: 4 copies per card number. | none |
| Leaders have 2 colors / multicolor | UNKNOWN. Both revealed Leaders are single-colored. | |

## 2. Card types and card anatomy

| Type | What it is | Status |
|---|---|---|
| Leader | Starts in play. Printed with DMG, POW and **LIFE 15**. It has no HP and no cost. It carries [Activate: Main] and [Recovery] abilities. Rarity "L". | CONFIRMED-OFFICIAL (N-001, N-012 card faces; trailer shows "LIFE 15 / LIFE POINT") |
| Character | Printed with **DMG** (top-left), **POW** and **HP** (top-right), a name, a trait line (for example "Special/Hidden Leaf Village/Team 10"), a card number such as N-008, a rarity (C/R/SR) and a circled "1" icon whose meaning is unknown. Some Characters have a **[Support] block**: an orange "SUPPORT <Jutsu name>" bar plus a timing and an effect, with a **CHAKRA cost** number (1 or 2 seen) in a box on the left. Others have ordinary effect text instead. | CONFIRMED-OFFICIAL (N-008 and N-011 card faces) |
| EX Character | A Character labelled "EX CHARACTER". It reads "Cannot be summoned normally." and has **[Summon Requirements]**. It has higher stats (POW 8–11, HP 8–11, DMG 2–3). | CONFIRMED-OFFICIAL (N-005 card face) |
| Chakra card | C-001. Text: "When using Chakra, turn this card face-down." There are 5 per player and they are not part of the deck. | CONFIRMED-OFFICIAL |
| Summon card | S-001. Text: "You may rest this card to summon a Character card." There is 1 per player. | CONFIRMED-OFFICIAL |

Stat meanings:
- **DMG** is the amount of Life the opponent's Leader loses when this card's attack connects.
  - Status: INFERRED, strongly supported. The trailer shows Life 15 dropping to 13 when a DMG 2 Itachi attacks the Leader. Ino's text grants "+5 power/+1 damage".
- **POW** is combat power used against Characters. **HP** is the Character's durability: a Character is K.O.'d when it takes damage equal to or greater than its HP.
  - Status: INFERRED. VRSUS reports "Attack vs Leader" and "Attack vs Rested Characters" values plus HP, and says "only the target takes battle damage, the attacker is not damaged". A simulator could reasonably use this rule: an attacker with POW ≥ the target's HP K.O.s the target, or damage accumulates until end of turn. The exact rule is UNKNOWN.
- Leaders have POW 3 but no HP. They take damage only as Life loss.
  - Status: CONFIRMED that there is no HP box. The rest is INFERRED.

## 3. Setup

| Rule | Status |
|---|---|
| Leader is placed in the LEADER CARD zone with 15 Life. Life is a **number** printed on the Leader, not a stack of Life cards as in OP. The trailer shows a "LIFE POINT" counter going 15 → 13 → 0. | CONFIRMED-OFFICIAL (card faces and trailer). Using a counter rather than cards is INFERRED from the trailer, and the playmat has no Life zone. |
| The 5 Chakra cards start face-up in the CHAKRA AREA. The Summon card goes in the SUMMON CARD zone. The deck is shuffled into the DECK zone. | Zones: CONFIRMED-PRINT (playmat). Chakra starting face-up: INFERRED ("turn face-down to use"). |
| Opening hand size | UNKNOWN. INFERRED default: 5. |
| Mulligan | UNKNOWN. INFERRED default: one full redraw, as in OP/UA. |
| Who goes first | UNKNOWN. INFERRED: rock-paper-scissors or a die roll, and the winner chooses. |
| First-player restrictions: [Recovery] can only be used "if it is the second turn or later". This probably means the game's turn count, so on game turn 1 nobody can recover. Whether the first player draws or attacks on turn 1 is unknown. | CONFIRMED text. Interpretation INFERRED. |
| VRSUS claim: "The player going second gets to draw 1 card at the start and starts with 2 cards instead of 1 ... After the opening, both players draw 2 cards each turn." | REPORTED, low confidence and garbled. Do not use as a default without corroboration. |

## 4. Turn structure — 4 phases

CONFIRMED-PRINT (official Gen Con playmat): **Refresh Phase → Draw Phase → Main Phase → End Phase**. "End Phase" also appears on the official card text of Shisui N-016.

| Phase | Contents | Status |
|---|---|---|
| Refresh | Probably untaps (stands up) your rested cards: Characters, the Summon card and the Leader. It probably does **not** flip Chakra face-up, because only [Recovery] does that. | INFERRED |
| Draw | Draw a number of cards (1? VRSUS says 2). Whether the first player skips this on turn 1 is unknown. | Phase confirmed. Count UNKNOWN. |
| Main | Summon a Character by resting the Summon card. Set cards face-down into the Support Area. Use [Activate: Main] abilities, including Leader [Recovery]. Fire [During Your Main] Supports. Declare attacks. **Attacks appear to happen inside the Main Phase, because there is no Battle Phase on the mat.** | Summoning and [Activate: Main]: CONFIRMED. Attacks in Main: INFERRED. |
| End | "until the end of your next turn's End Phase" shows that durations are tracked through the End Phase. "During this turn" effects expire here. | CONFIRMED (term). Details INFERRED. |

## 5. Resources — Chakra (different from DON!!)

- **CONFIRMED-OFFICIAL**
  - Each player has exactly 5 Chakra cards in the CHAKRA AREA.
  - To pay a Chakra cost, turn that many face-up Chakra cards face-down ("When using Chakra, turn this card face-down"; trailer: "Flip your CHAKRA CARD to activate your Jutsu!").
  - Chakra pays Support (Jutsu) activation costs and some abilities. For example, Leader Naruto's cost is "Flip 1 of your CHAKRA face-down".
- **CONFIRMED-OFFICIAL**: Chakra is **refilled only by the Leader's [Recovery]**: "If it is the second turn or later, rest this card and flip all of your CHAKRA face-up." Resting the Leader this way is the trade-off.
  - INFERRED: a rested Leader cannot attack that turn. VRSUS also reports that "recovering Chakra costs you a Leader attack".
- **REPORTED / INFERRED**: Chakra is **not** used to summon Characters. Summoning uses the Summon card, and card cost boxes appear only inside [Support] blocks.
- Comparison with One Piece DON!!:
  - Chakra does not grow each turn. It is a fixed pool of 5.
  - Chakra is not attached to Characters for power.
  - Chakra does not refresh automatically. It is a pay-then-recover loop gated by resting your Leader.
  - Both players can see how many Chakra are face-up, which is a bluffing tool.

## 6. Playing Characters — the Summon card

- **CONFIRMED-OFFICIAL**: "Rest your Summon card to bring one of your characters onto the field." S-001: "You may rest this card to summon a Character card." The JP name is 登場カード (appearance card).
- INFERRED: this means **1 normal summon per turn**, because there is only one Summon card and it stands up again in the Refresh Phase. VRSUS also reports "summon 1 Character per turn normally".
- INFERRED: summoning a Character from hand this way is free. No Chakra is paid, and Characters with no Support block have no cost box.
- **CONFIRMED-PRINT**: "Characters cannot attack on the turn they were played" (printed in the CHARACTER AREA of the playmat). [Rush] overrides this.
- Extra summons come from card effects (all CONFIRMED card text):
  - [Support] effects that "Summon this card" from the Support Area (Shikamaru, Karin, Choji, Suigetsu).
  - [On Summon] or [When Attacking] effects that summon from the deck or trash (Gamabunta, Manda, Jugo, EX Naruto).
  - EX Characters through [Summon Requirements].
- Character Area size limit: UNKNOWN. The trailer calls Characters the "front line".

## 7. EX Characters

- **CONFIRMED-OFFICIAL**: "Powerful Character cards that can be played once you reach certain play conditions." They are part of the 50-card deck.
- **CONFIRMED card text**: "Cannot be summoned normally." Then "[Summon Requirements] Place 1 of your Characters ... in your trash." Examples of requirements:
  - Manda: 1 Character.
  - Gamabunta: 1 Character with 10 or more power.
  - EX Naruto: 1 Character plus 1 Character with 10 or more power.
  - EX Sasuke: 1 Character plus 1 {The Taka} Character.
- INFERRED:
  - You summon them from your hand by trashing the required Characters from your field. The trashed Characters are the payment, similar to a Yu-Gi-Oh! tribute.
  - It is unknown whether this uses up the Summon card or the once-per-turn normal summon. Probably not, since "cannot be summoned normally" implies a special procedure.
  - "Power 10 or more" counts current power, including buffs. Ino gives +5 and Choji doubles power, so buffed non-EX Characters can reach 10.
  - EX Characters probably cannot be set in the Support Area, since they have no [Support].

## 8. Support Area and counter mechanics (the core hook)

**CONFIRMED-PRINT (playmat, SUPPORT AREA)**:
- "You may set up to 5 cards face-down."
- "You cannot set another card if there are already 5."

**CONFIRMED-OFFICIAL**:
- Site: "Use Chakra to activate face down support cards. Unleash Ninjutsu to stop their attacks!"
- Trailer narration: "Strategically play the characters concealed in your support area with chakra, and cut in with special abilities like Ninjutsu. Activate the effects of face down character cards in response to your opponent's moves."
- On-screen trailer text: "Activate Character Cards from the Support Area!"

How it works:
- You **set Character cards face-down** in the Support Area.
  - INFERRED: during your Main Phase, and probably with no limit per turn beyond the cap of 5.
- Later you **pay the Chakra cost** printed in the card's [Support] block, **flip the card face-up** and resolve its Support effect. The timing header on the Support says when this is allowed.
- Many Support effects say "Summon this card", which moves the card from the Support Area onto the field.
- INFERRED: after resolving, a Support that does not summon itself goes to the trash.
- Timing headers seen on [Support] blocks:
  - **[During Your Opponent's Attack]**: when the opponent attacks (6 cards).
  - **[During Your Main]**: during your own Main Phase (board wipes).
  - **[Quick]**: exact window unknown. INFERRED: any time, or any time either player has priority.
  - **[Support Activated]**: in response to a Support being activated, for example "Negate that card."
- Trailer example: Itachi (DMG 2) declares "ATTACK!!" on Leader Naruto. The Naruto player flips Chakra, reveals Shikamaru's "Shadow Possession Jutsu" ([During Your Opponent's Attack] "Summon this card and interrupt that attack"), and the screen shows "ATTACK CANCEL!!"
- **REPORTED (VRSUS)**: the battle/chain window runs in four steps: 1) attack declaration (attacker and target), 2) on-attack/triggered effects, 3) Support and response effects, 4) damage calculation. The chain "stacks and resolves backward" (LIFO), which "feels closer to Yu-Gi-Oh! than One Piece".

## 9. Attacking and battle

| Rule | Status |
|---|---|
| Characters attack. "Attack the leader with your characters." | CONFIRMED-OFFICIAL (trailer) |
| The attacker is probably **rested** to attack, as in OP. | INFERRED: VRSUS "Rested (Tapped) characters cannot [attack]" and Refresh Phase naming |
| Targets are the opponent's Leader or the opponent's **rested** Characters, as in OP. Supported by Jiraiya and Orochimaru "K.O. rested Characters" and VRSUS "Attack vs Rested Characters". | INFERRED / REPORTED |
| The Leader can attack. It has DMG 1 / POW 3, and VRSUS says "Leader attacks and Character attacks are separate choices". Using [Recovery] rests the Leader, which costs that attack. | INFERRED / REPORTED |
| When an attack on the Leader connects, the Leader loses Life equal to the attacker's **DMG**. Trailer: 15 → 13 from DMG 2 Itachi. | INFERRED, strong |
| In battle with a Character, the attacker's POW is compared to the target's HP (or damage is dealt equal to POW). Only the target takes damage. | REPORTED / INFERRED. Exact formula UNKNOWN. |
| **Blocking**: no Blocker keyword and no blocking rule has been seen. Defense is done through face-down Supports: interrupt the attack (Shikamaru), K.O. rested Characters, bounce, K.O. non-EX, or gain Life. | CONFIRMED absence so far. Rule UNKNOWN. |
| No "counter" step with hand cards as in OP. Counters come from the Support Area. | INFERRED |

## 10. Damage and Life

- Leader Life is 15 on both revealed Leaders, printed as "LIFE 15". CONFIRMED-OFFICIAL.
- Win by reducing the opponent Leader's Life to 0. CONFIRMED-OFFICIAL.
- Life changes seen on cards: Karin "you gain 2 Life"; Kakashi "reduce your life by 2". There is no Life maximum stated.
- Life is a counter. There are no trigger cards and no Life cards revealed. INFERRED.
- Deck-out: UNKNOWN. INFERRED default: a player who cannot draw loses, as in OP/UA.

## 11. Keywords and notations seen on card faces (13)

| Keyword | Meaning | Status |
|---|---|---|
| [Rush] | "This card can attack on the turn in which it is summoned/played." | CONFIRMED (reminder text) |
| [Recovery] | A Leader ability: "If it is the second turn or later, rest this card and flip all of your CHAKRA face-up." Probably usable in your Main Phase. | CONFIRMED text. Timing INFERRED. |
| [Activate: Main] | An activated ability you use during your Main Phase. Written as cost ":" effect. | CONFIRMED text. Meaning INFERRED. |
| [Once Per Turn] | Limits the ability to one use per turn. Leader Naruto lacks it. | CONFIRMED |
| [On Summon] | Triggers when the card is summoned. | CONFIRMED |
| [When Attacking] | Triggers when the card attacks (Jugo). | CONFIRMED |
| [Your Turn] | A continuous effect that applies during your turn (Minato). | CONFIRMED |
| [Support] <Jutsu name> | A block with a Chakra cost. Usable when the card is face-down in the Support Area. | CONFIRMED |
| [During Your Opponent's Attack] | A Support timing. | CONFIRMED |
| [During Your Main] | A Support timing. | CONFIRMED |
| [Quick] | A Support timing. The exact window is unknown. | CONFIRMED name |
| [Support Activated] | A Support timing: in response to a Support activation. | CONFIRMED |
| [Summon Requirements] | The cost to summon an EX Character. Always paired with "Cannot be summoned normally." | CONFIRMED |

Other terms used in card text:
- K.O.
- rest / rested
- trash
- negate / "with its effects negated"
- "interrupt that attack"
- "return to the owner's hand"
- "will not be affected by your opponent's Support effects"
- non-EX
- [Name] in square brackets for a card name
- {Trait} in curly braces for a type or trait. Traits are called "type" in text, for example "{The Taka} type".
- power / damage modifiers ("+3 power", "+5 power/+1 damage", "doubled")
- "during this turn"
- "during your opponent's next turn"

## 12. Board zones (8 per player)

CONFIRMED-PRINT, from the official Gen Con playmat and the event photos:

1. CHARACTER AREA. Printed rule: Characters cannot attack the turn they are played.
2. SUPPORT AREA. Printed rule: max 5 face-down.
3. CHAKRA AREA (5 slots).
4. DECK.
5. TRASH.
6. LEADER CARD.
7. SUMMON CARD.
8. EXCLUSION AREA. This is a removed-from-game zone. No card that uses it has been revealed yet.

Layout (from the VRSUS description and event photo https://www.vrsus.io/wp-content/uploads/2026/08/naruto-cg-tutorial-2.jpg):
- The Character Area is nearest the center.
- The Support Area sits below it.
- The Chakra row is below the Support Area.
- The Leader, Deck and Trash are to the side.
- The Summon card and the Exclusion Area are at the corners.

## 13. Win conditions

- Opponent Leader's Life reaches 0. CONFIRMED-OFFICIAL.
- Deck-out loss: UNKNOWN. INFERRED default: lose when you must draw from an empty deck.

## 14. Differences from One Piece Card Game and Union Arena

| Topic | NARUTO CARD GAME | One Piece Card Game | Status |
|---|---|---|---|
| Life | A 15-point counter printed on the Leader, reduced by DMG. | Life cards taken into hand, with Triggers. | CONFIRMED / INFERRED |
| Resource | A fixed 5 Chakra, spent by flipping face-down and refilled all at once by resting the Leader ([Recovery]). | DON!! deck of 10, +2 per turn, attaches for power. | CONFIRMED |
| Playing Characters | Rest the one Summon card, so about 1 per turn and free. | Pay DON!! cost, unlimited per turn. | CONFIRMED / INFERRED |
| Stats | DMG / POW / HP. | Power only. Life damage is always 1 (2 with Double Attack). | CONFIRMED |
| Interaction | Face-down Support Area (max 5), paid with Chakra, trap-like. Chains resolve in reverse order (reported). | Counter values from hand, Blocker. | CONFIRMED / REPORTED |
| Big cards | EX Characters in the main deck, summoned by trashing your Characters. | Cost-based. | CONFIRMED |
| Removed zone | The Exclusion Area exists. | No removed zone (OP uses bottom of deck or trash). | CONFIRMED-PRINT |
| Turn phases | Refresh / Draw / Main / End (Union Arena-like naming). | Refresh / Draw / DON!! / Main / End. | CONFIRMED-PRINT |

Union Arena comparison (INFERRED): UA also uses AP and front/energy lines. NARUTO drops the energy line in favour of the Chakra flip pool, and the Summon card replaces UA's action-point limit on plays.

## 15. Remaining unknowns (rule gaps)

1. Opening hand size, mulligan rule, and how the first player is chosen.
2. How many cards you draw per turn, and whether the first player skips the draw or attack on turn 1. VRSUS claims "draw 2" and "start with 1/2 cards", which is unverified and implausible.
3. What the Refresh Phase untaps. Whether Chakra ever refreshes automatically.
4. When [Recovery] can be used: which phase, and once per turn? "Second turn or later" could mean the game turn or the player's own turn.
5. Exact battle resolution: POW vs HP, whether damage persists, whether the attacker takes damage, and whether unrested Characters can be attacked.
6. Whether attacking requires resting the attacker. Whether a rested Leader can attack.
7. Blocking. There appears to be none, and it is not confirmed.
8. Character Area size limit.
9. When cards can be set into the Support Area (phase, number per turn, from hand only?). Whether EX Characters or Support-less Characters can be set.
10. What happens to a Support after it resolves if it does not summon itself (trash?). Whether Supports can be set and then used in the same turn.
11. The [Quick] timing window. The chain/priority rules (reverse-order resolution is only reported).
12. Whether "Cannot be summoned normally" EX summons consume the Summon card or the normal summon. Which zone an EX is summoned from (hand assumed).
13. Summoning from the Support Area through "Summon this card": does the Summon card need to be available? It appears not.
14. Deck-out rule, Life cap, and draw-game rules.
15. Copy limits, the full color list, and multicolor Leaders.
16. What uses the Exclusion Area.
17. The meaning of the circled "1" icon next to the rarity. It might be a block or set icon.
18. The Chakra cost on Characters with no Support block (Ino, Minato, Itachi, Jugo show no cost box). This implies they cost nothing to summon.
19. Retail product structure: starter decks, boosters, set codes.

---

## 16. Official image URLs (naruto-cardgame.com)

Base URL: https://www.naruto-cardgame.com

### Key art and backgrounds

- /images/top/mv.webp (1920x776). Hero key art: Naruto and Sasuke with card backs on an orange swirl.
- /images/top/mv_sp.webp. Mobile version of the hero key art.
- /images/top/mv_card.webp
- /images/welcome/sp/mv_illust.webp (750x773)
- /images/welcome/pc/mv_bg.webp
- /images/welcome/pc/mv_bg_en.webp
- /images/welcome/pc/mv_item.webp?v1
- /images/welcome/sp/mv_bg.webp
- /images/welcome/sp/mv_bg_en.webp
- /images/welcome/sp/mv_item.webp?v1
- /images/top/welcome_illust.webp
- /images/top/welcome_illust_sp.webp
- /images/top/welcome_bg.webp
- /images/top/welcome_bg_sp.webp
- /images/top/welcome_item.webp
- /images/top/welcome_item_sp.webp
- /images/top/gencon_bg.webp
- /images/top/gencon_bg_sp.webp
- /images/welcome/feature_bg.webp
- /images/common/bg_pc.webp
- /images/common/bg_sp.webp
- /images/page/bg_pc.webp
- /images/page/bg_sp.webp
- Logos: /images/common/logo.webp, /images/welcome/logo_naruto_en.webp?v1, /images/welcome/logo_naruto-shippuden_en.webp, /images/welcome/logo_boruto_en.webp
- Kishimoto message / shikishi art: /images/top/comment_en.webp, /images/top/comment_en@2x.webp. JP versions: /images/top/comment.webp, /images/top/comment@2x.webp
- Other: /images/welcome/movie_thumbnail_en.webp, /images/welcome/thumbnail.webp?v1, /images/welcome/sp/roadmap_en.webp (roadmap)
- Videos:
  - /video/pv_en.mp4 and /video/pv.mp4 (JP)
  - Overview Trailer: https://www.youtube.com/watch?v=3o_wqkZJfr0
  - First Look Trailer: https://www.youtube.com/watch?v=2AByN4yTij4
- Event and news images:
  - /en/images/news/gencon-2026/mv.webp?v2, img01..img04.webp
  - /en/images/news/nycc-2026/mv.webp?v2, img02.webp
  - /en/images/news/bcgfes26-27/mv.webp, img01.webp
  - /images/top/schedule/*.webp

### Card images

Card types and how-to-play diagrams. These are composites that show the card with its back, and they contain real card faces:
- /images/welcome/type_img01_en.webp: Leader N-001 plus the red Leader card back.
- /images/welcome/type_img02_en.webp: Ino N-011 and Shikamaru N-008 plus the white Character card back.
- /images/welcome/type_img03_en.webp: Gamabunta N-005 (EX) plus the Character back.
- /images/welcome/type_img04_en.webp: Chakra C-001 plus the orange Chakra back.
- /images/welcome/type_img05_en.webp: Summon S-001 plus the black Summon back.
- /images/welcome/feature_img01_en.webp?v1: deck-build diagram (Leader, deck, 5 Chakra, Summon).
- /images/welcome/feature_img02_en.webp?v1: N-001 vs N-012, LIFE 15.
- /images/welcome/feature_img03_en.webp: Summon card → Ino N-011.
- /images/welcome/feature_img04_en.webp: Chakra flip plus a face-down card → Shikamaru N-008.

Artwork gallery (12 full-art showcase cards):
- /images/welcome/card/en/card01.webp … card12.webp (card02 has ?v1). Each is 600x838.
- The JP versions are at /images/welcome/card/jp/card01..12.webp.

Promo:
- /en/images/news/nycc-2026/img01.webp?v2 is the clean CP-001 Chakra promo face.
- /en/images/news/gencon-2026/img01.webp?v1 is the Gen Con version shown with the backpack and sticker.

Third-party images:
- narutoreca OG renders: https://narutoreca.com/og/cards/en/<slug>.png. These are site-generated summary images, not scans.
- Gen Con event photos:
  - https://www.vrsus.io/wp-content/uploads/2026/08/naruto-cg-tutorial-1.jpg (official card-types infographic)
  - naruto-cg-tutorial-2.jpg (playmat in use)
  - naruto-cg-tutorial-3.jpg (foil display)
  - naruto-cg-tutorial-4.jpg (foil cards and Chakra cards)
  - naruto-cg-tutorial-6.jpg (tutorial room)

Card backs by type (seen in the images):
- Leader: red.
- Character/EX: white/grey swirl.
- Chakra: orange.
- Summon: black.
