# Product

<!-- impeccable:product-schema 1 -->

## What This Document Is For

This is the concise product brief for the playable base game. It gives a
designer, implementer, or evaluator the product intent, the non-negotiable
player promise, the actual operating context, and the evidence boundary in one
place. It is deliberately not a substitute for the implementation contract.

When documents disagree, use this order:

1. `docs/game-design.md` §34 — authoritative base-game rules, scope, and
   acceptance gates;
2. `docs/wp1-navigation.md` through `docs/wp5-player-facing-base-game.md` —
   approved subsystem and product-layer details;
3. `docs/wp5-acceptance.md` and the playtest artifacts — evidence and its
   current status;
4. this brief — product framing and a decision-safe summary.

This ordering matters: evocative product language must never overrule a
CONTRACT rule, reveal hidden state, or turn an untested claim into evidence.

## Current Product Status

**Playable, mechanically evidenced, not yet human-validated.** The complete
local base-game loop is implemented and its automated acceptance baseline has
passed. The central product question is still open because no genuine
three-expedition human session has been recorded.

| Area | Current evidence | Honest status |
|---|---|---|
| Core loop | Outfitting through three consecutive expeditions, reports, and inherited knowledge are covered by engine and Chromium flows. | Mechanically evidenced |
| Hidden truth and replay | Projection boundaries, save/replay compatibility, and deterministic fixtures are exercised by targeted tests. | Mechanically evidenced |
| Local playability | `play.cmd` builds, serves, and opens the production bundle on loopback. | Mechanically evidenced |
| Session usability | Automated browser checks cover timing, keyboard operation, and target viewports. | Partially evidenced |
| Tension, clarity, and replay value | The five §35.2 questions have no human evidence. | Unverified |

The next product-evidence action is defined, not guessed: run the normal
production three-expedition protocol in `docs/base-game-playtest-protocol.md`
and record only observed evidence in `docs/base-game-playtest-results.md`.

## Platform

web

## Users

One user: the developer, playing their own build to validate a design question.
There is no external audience, no playtest cohort, and no commercial player base
yet. The pending human playtest in `docs/base-game-playtest-results.md` is still
unrun, so nothing is known about how a stranger reads this game — future work
must not invent that knowledge.

The play situation is concrete: Windows, double-click `play.cmd`, a browser tab
on a loopback server, campaign saves in that browser's local storage. Sessions
are self-directed and repeated — the same person replays the same voyage to feel
whether the decisions hold up.

## Product Purpose

A survival-management exploration game set in the Age of Exploration, structured
like The Oregon Trail. The player commands one caravel on a repeatable campaign:
Lisbon → Cape Verde → Cape of Good Hope → Lisbon.

The core fantasy is turning an unknown world into a navigable one. The loop is
discover → survive → return → report, and knowledge carries across expeditions
even when the ship does not.

The base game exists to answer one question (`docs/game-design.md` §34):

> Does planning against an uncertain position create readable, tense, replayable
> decisions?

Success is the developer being able to answer that honestly from their own play.
Not downloads, not retention, not revenue.

## Positioning

The mechanic a neighboring survival-management game could not truthfully copy:

> The player never sees where the ship is. Only where the crew believes it is.

Every other system — water, provisions, repair stores, medicine, morale, disease,
the chart itself — exists to make that uncertainty expensive. Failed expeditions
are not wasted: they still produce facts that improve the inherited chart, so
progression is knowledge rather than levels or gear.

## Operating Context

The game is four screens, and the state flow between them is fixed:

```text
Outfitting → Expedition → Interrupt → (back to Expedition, or) After-action → Outfitting
```

- **Outfitting** — inherited knowledge, prior finalized summaries, four stores,
  fixed and allocatable hold, cost against money, and a projected-range estimate
  that is labelled as an estimate.
- **Expedition** — Chart, Deck, and Log tabs. The player picks one of 16 compass
  headings and a policy (cautious, standard, press on), then advances one day or
  runs until something interrupts.
- **Interrupt** — an authored event, landfall, warning, port call, the Cape, or a
  terminal outcome. The player decides and returns to sea, or finalizes.
- **After-action** — the run's report, then preparation for the next expedition.

A tick is one day. A leg is 5–40 days between decisions. A campaign must support
at least three consecutive runs, and three is not a cap.

## Capabilities and Constraints

**Binding, user-confirmed:** the game is fully local with zero network. No
server, account, telemetry, remote map, CDN, analytics, or any runtime network
call. Web fonts are a network call — every asset ships inside the bundle.

**From the codebase and the design contract:**

- Base-game scope is §34 only. Trade, diplomacy, combat, and extra geography are
  full-game context, not implied scope.
- The hidden-state split in §34.3 is a CONTRACT rule. The interface may show
  believed position and never true position. Any chart, readout, or estimate is
  bound by it.
- Preact 10 + Vite 7 + TypeScript. The engine in `src/` is pure and deterministic:
  no browser, storage, clock, network, or filesystem access.
- `app/controller.ts` is the only holder of `CampaignState`. Components receive
  narrowed projections from `buildAppViewModel` — never campaign state, raw saves,
  expedition seeds, hidden gates, weights, rolls, or internal flags.
- Determinism is verified by fixture hashes and replay tests. A change that moves
  a recorded hash is a change to the game, not to its presentation.
- An invalid or incompatible save is reported and retained until the player
  explicitly starts fresh.
- Values marked **TUNING** in the design doc may change during balancing; rules
  marked **CONTRACT** may not change without updating the doc and its acceptance
  checks.

## Brand Commitments

The name is *Age of Exploration*. The setting is roughly 1450–1700, historically
inspired by a late-15th-century Portuguese Cape expedition but explicitly not a
reenactment of a named voyage — so real captains, ships, and dates are not to be
claimed as this game's story.

The existing interface has an established visual world (aged paper, deep sea
teal, gold, rust, serif headings, a wax-seal motif) in `app/styles.css`. The user
has not pinned it as binding; it is incumbent evidence, and whether it is
preserved, extended, or replaced is a decision for the design work itself.

## Evidence on Hand

- `docs/game-design.md` — full design document; §34 is the base-game contract.
- `docs/wp5-player-facing-base-game.md` — architecture, screen flow, boundaries.
- `docs/wp5-acceptance.md` — the §34.15 gate matrix.
- `docs/wp1-navigation.md`, `wp2-survival.md`, `wp3-authored-journey.md`,
  `wp4-knowledge-campaign.md` — per-system specifications.
- 24 authored events (8 delayed, 7 remembered, 8 preparation-softened, 5
  fact-producing), validated by `pnpm event:validate`.
- `artifacts/wp1-navigation.svg` — generated navigation chart.
- Local verification snapshot (2026-08-24): `pnpm typecheck`, `pnpm test`
  (17 files, 151 tests), `pnpm test:determinism` (5 files, 29 tests), and
  `pnpm event:validate` all passed. The pnpm launcher reported its known Node
  24 host warning; this does not replace the repository's Node 22 requirement.

Absences future work must not fabricate: no human playtest has happened, so there
are no player quotes, confusion reports, session lengths, or difficulty findings.
There are no players, reviews, sales, art assets, sound, or logo.

## Product Principles

1. **Uncertainty is the product.** Anything that quietly resolves the player's
   position — a helpful marker, a precise number where an estimate belongs, a
   reassuring animation — destroys the thing being tested.
2. **Estimates must read as estimates.** Every projected figure carries visible
   confidence. The chart shows belief, and belief is allowed to be wrong.
3. **Failure produces knowledge.** A lost ship still returns facts. The campaign
   must make that carry-over legible enough to pull the player into another run.
4. **Everything ships in the box.** Local-only is not a deployment detail; it is a
   design constraint on fonts, imagery, and every asset choice.
5. **Determinism over spectacle.** Presentation may never introduce a random draw,
    a wall-clock dependency, or anything that breaks replay.

## Product Completion Standard

The base game is not “done” because an automated flow succeeds. It becomes ready
to answer its design question only when every §34.15 acceptance gate is passed
and the evidence is recorded honestly. Today, gate 14 remains **Unverified**:
the automation establishes the fast five-day path, but it cannot establish that
a normal Cape attempt takes approximately 45–90 minutes of active play. The
five qualitative questions in §35.2 are likewise unanswered until a genuine
three-expedition session is documented.

Until then, the correct product decision is to preserve the validated base-game
contract and collect the missing human evidence. Do not add trade, diplomacy,
combat, extra ships, extra geography, accounts, telemetry, or remote services
as a way to mask an unanswered navigation question.

## Accessibility & Inclusion

No external requirement was established, but behaviors already in the build are
contract, not decoration: a skip link, a polite `aria-live` status region for
announcements, visible focus rings on every interactive element, and a motion
default that becomes reduced when `prefers-reduced-motion` matches.
