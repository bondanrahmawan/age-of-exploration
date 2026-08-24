# WP5 Player-Facing Base Game

WP5 adds the browser-local product layer for the base-game contract in
`docs/game-design.md` §34. It stops at the Lisbon → Cape Verde → Cape → Lisbon
campaign and does not add any deferred full-game system.

## Technology decision and package layout

The application uses Preact 10 and Vite 7 with TypeScript. Preact supplies the
small component/runtime layer, and Vite supplies the maintained
Node-22-compatible development and production build. The one-step Windows
launcher serves only that production output through a first-party,
loopback-only Node static server; it adds no API, remote service, or
authoritative game-state owner. Vitest 3 remains the established unit test
runner, and Playwright provides the real Chromium interaction path. Vite 7 is
deliberately retained alongside the validated Vitest 3 dependency instead of
migrating the engine test toolchain to Vite 8.

```text
src/                         pure deterministic engine and campaign wrapper
app/controller.ts            authoritative-state command and autosave boundary
app/view-model.ts            allow-listed UI projections and validation
app/storage.ts               campaign-save and separate preference adapters
app/seed.ts                  injectable expedition seed ownership
app/components/              four product-screen presentations
app/e2e-environment.ts       e2e-mode-only short deterministic route
play.cmd                     one-step Windows player entrypoint
scripts/play.mjs             build identity and loopback static-server owner
scripts/play.test.mjs        launcher identity, serving, and freshness tests
test/ui-*.test.*             controller, projection, component, a11y tests
e2e/player-flow.spec.ts      real-browser three-run and narrow-window paths
```

`pnpm build:engine` preserves the headless package build. `pnpm build:app`
produces the browser application. `pnpm build` composes both. The launcher
hashes production inputs, reuses only an identified matching build, and writes
its ignored build manifest under `app-dist/`. Its health response contains only
the app id, launcher protocol, content version, and build id.

## Engine, controller, and projection boundary

The engine remains independent of browser, storage, rendering, wall clock,
network, and filesystem APIs. The controller is the only application object
that holds a `CampaignState`; it calls `executeCampaignCommand`, and then uses
the existing campaign serializer after a successful command. Rejected commands
do not replace the last valid autosave.

Components do not receive `CampaignState`, raw campaign saves, or the controller's
authoritative state. `buildAppViewModel` starts from `CampaignPlayerView` and
creates narrower screen-specific models. It removes expedition seeds and does
not attach finalized reports while an expedition is active. The authored event
catalogue is projected separately into choice labels, public requirements, and
known immediate consequences; hard gates, weights, rolls, future scheduled
consequences, and internal flags do not enter component props.

The only engine correction required by the complete campaign loop was to let
the existing `recognise_cape_landfall` command accept both forms of true-position
Cape arrival: `visible_unrecognised` on the first run and already `recognised`
after later runs inherit a confirmed Cape landmark. This adds no command,
random draw, tuning change, or bypass; the same atomic reducer still validates
and commits the transition.

## Four-screen state flow

Only these four values exist in `PRODUCT_SCREENS`:

```text
Outfitting
  └─ valid allocation + depart → Expedition
       ├─ event / landfall / warning / port / Cape → Interrupt
       │    └─ resolved decision or departure → Expedition
       └─ terminal outcome → Interrupt
            └─ finalize → After-action report
                 └─ prepare next expedition → Outfitting
```

- **Outfitting** shows reported knowledge, prior finalized summaries, four
  stores, fixed and allocatable hold, cost, money, adjacent validation, and a
  clearly labelled projected-range estimate.
- **Expedition** coordinates Chart, Deck, and Log tabs with all 16 headings,
  three sailing policies, four ration combinations, intent, repairs, single-day
  advance, and advance-until-interrupted.
- **Interrupt** is the consistent event, landfall, survival, port, Cape, and
  finalization surface. Disabled options retain their requirement or rejection
  reason. All existing Cape Verde and Cape commands are mapped.
- **After-action report** uses only finalized WP4 report data and is the sole
  screen that receives actual-route data.

## Chart allow-list and hidden truth

The active SVG chart is constructed only from the active player projection:

- estimated position and estimated positions already written to safe logs;
- east–west and north–south uncertainty;
- player-known landmark facts and their claimed positions;
- observed wind and player-known current claims;
- selected heading.

It does not import authored landmark geometry for presentation, except in the
e2e-only environment module that is eliminated from production builds. It never
receives active actual position, actual route, current-region bounds, an unknown
current vector, any PRNG state, event weights, future weather, pending hidden
consequences, or undiscovered geometry. Active DOM tests scan for the sensitive
field names. Save previews contain only run/day/date counts and a named safe
resume boundary; raw save contents are never rendered.

The finalized report chart receives the estimated and actual tracks from
`AfterActionReport`. Current vectors are described only for
`supported_by_reported_evidence`; `unexplained_route_divergence` is rendered
without a vector.

## Seed ownership

`BrowserCryptoSeedSource` uses `crypto.getRandomValues`, never a clock, and is
called exactly once by the controller when a new expedition is prepared. The
returned seed is passed explicitly to `start_expedition`; the campaign wrapper
persists it in canonical state and replay commands. The normal view model, DOM,
save preview, and report presentation omit it. Tests inject `FixedSeedSource`.

## Local save and resume

The campaign save and UI preferences use different storage keys. A successful
campaign command is first computed, then serialized through
`serializeCampaignSave`, then installed as the new controller state. A rejected
command never calls the save path. Compatible saves resume through
`deserializeCampaignSave` at the five WP4 boundaries already covered by the
campaign determinism suite:

1. ordinary committed day;
2. pending event choice;
3. immediately after Cape Verde report deposit;
4. immediately before finalization;
5. between expeditions.

Invalid bytes produce a safe error preview and remain untouched. Starting fresh
is an explicitly labelled overwrite action. Panel choice and animation mode are
stored separately and never enter campaign hashes or replay bytes.

## Pacing and animation

Normal, reduced, and skipped modes select only the delay between completed days.
The default becomes reduced when `prefers-reduced-motion` matches. The controller's
leg loop forwards the ordinary WP4-wrapped `advance_day` command, saves it, and
checks the player projection for an interruption before starting another day.
Stop requests are checked only between successful complete days. Rendering and
animation own no simulation randomness.

The Chromium timing path commits five uneventful days through the real controls
in skipped mode and requires less than five seconds. The final validation run
measured 96 ms at desktop width and 94 ms at 520 px width. No 45–90 minute Cape-attempt
claim is made without a genuine human playthrough.

## Accessibility and responsive behavior

- Every operation is a native button, input, select, tab, link, or details
  control with visible focus.
- Day advance has a native button and `D` keyboard shortcut; Escape requests a
  between-day stop.
- A polite live region announces successful commands, stops, and rejections.
- The chart has an accessible name/description, visible labels, keyboard-focusable
  symbols, numeric uncertainty, and a text/pattern/shape legend.
- Confidence and warnings include status text and border patterns; neither
  relies on colour alone.
- The written log is independent of animation.
- Responsive checks run the real browser flow at 520 px and assert no horizontal
  document overflow.

## Balance assessment

No mechanics, tuning constants, event weights, prices, consumption values,
world coordinates, or content versions were retuned for WP5. Existing WP0–WP4
behavior and fixture hashes remain the balance baseline. Automated mechanical
evidence is strong enough for every gate except §34.15 gate 14 as a whole: the
five-day target is measured, but the 45–90 minute human Cape-attempt target is
unverified. The five qualitative questions in §35.2 also remain unverified
pending genuine player evidence.
