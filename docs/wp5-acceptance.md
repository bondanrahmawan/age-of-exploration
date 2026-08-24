# WP5 §34.15 Acceptance Evidence

This matrix records evidence without promoting an unmeasured or human-only
question into a pass. Commands are run from the repository root.

| # | Gate | Status | Evidence | Command or artifact | Remaining limitation |
|---:|---|---|---|---|---|
| 1 | Mass | Passed | Existing survival tests prove 25 crew consume exactly 600 kg water and 300 kg provisions over four normal days. | `pnpm test`; `test/survival.test.ts` | None found. |
| 2 | Capacity | Passed | Engine atomicity plus WP5 validation tests cover store caps, 52 t allocatable/60 t total hold, money, finite port stock, and non-negative resources. | `pnpm test`; `pnpm test:ui`; `test/ui-controller.test.ts` | None found. |
| 3 | Hidden truth | Passed | Campaign projections and active DOM/view-model scans omit actual position/route, hidden trace, seed/PRNG fields, snapshot internals, unknown-current vector, weights, and undiscovered geometry. | `pnpm test`; `pnpm test:ui`; `pnpm test:e2e` | Finalized prior summaries remain visible, but their truth comparison is not attached to an active screen. |
| 4 | Drift | Passed | WP1/WP4 tests prove unknown-current divergence and later automatic correction from confirmed inherited knowledge. | `test/navigation.test.ts`; `test/campaign.test.ts`; `pnpm test:determinism` | None found. |
| 5 | Latitude | Passed | Navigation tests prove a clear noon sight narrows north–south uncertainty without erasing east–west uncertainty. | `test/navigation.test.ts` via `pnpm test` | None found. |
| 6 | Landfall | Passed | Navigation/journey tests prove estimated-marker misses when actual geometry lies outside sight range. | `test/navigation.test.ts`; `test/journey.test.ts` | None found. |
| 7 | Fix | Passed | Recognised-landmark tests prove estimate correction and fact confidence updates; the active chart renders only the resulting safe estimate. | `test/navigation.test.ts`; `test/journey.test.ts`; `pnpm test:ui` | None found. |
| 8 | Warnings | Passed | Survival and authored-event tests prove staged water, hull, crew, and mutiny paths; the interrupt UI shows warnings and legal repairs/intent responses. | `test/survival.test.ts`; `test/events.test.ts`; `pnpm test:ui` | None found. |
| 9 | Reports | Passed | WP4 tests distinguish safe return, latest Cape Verde snapshot, post-snapshot loss, and no-deposit loss; browser flow deposits and finalizes through product controls. | `test/campaign.test.ts`; `pnpm test:e2e` | None found. |
| 10 | Determinism | Passed | Determinism suites prove canonical byte equivalence; WP5 tests prove animation mode and render frequency leave campaign save/replay bytes unchanged. | `pnpm test:determinism`; `pnpm test:ui`; `pnpm fixture:wp3`; `pnpm fixture:wp4` | None found. |
| 11 | Resume | Passed | WP4 determinism tests round-trip ordinary day, pending choice, post-deposit, pre-finalization, and between-run saves; WP5 controller test resumes through safe preview metadata. | `test/campaign-determinism.test.ts`; `test/ui-controller.test.ts` | Browser storage quota failure is reported at command time but is not synthetically forced in E2E. |
| 12 | Progression | Passed | WP4 tests exclude lost observations and hidden traces; real Chromium completes three runs and sees Cape survey knowledge inherited in runs 2 and 3 while active DOM remains truth-safe. | `test/campaign.test.ts`; `e2e/player-flow.spec.ts`; `pnpm test:e2e` | Qualitative confidence/tension effect remains a §35.2 human question. |
| 13 | Complete loop | Passed | Chromium flows outfit, depart, use both ports/landfalls, survey/collect, turn home, deposit, finalize, read reports, and begin runs 2 and 3 without direct state manipulation. Fixed-session assertions cover 1280×720, 1366×768, 1920×1080, and 520×900. | `e2e/player-flow.spec.ts`; `pnpm test:e2e` | Browser route is shortened by an e2e-mode deterministic environment; production uses the same commands with authored Atlantic travel. |
| 14 | Usability | Unverified | Real Chromium proves five skipped-animation days in under five seconds, zero Expedition/Interrupt document overflow at all four target viewports, persistent mission/milestone/critical status/primary action visibility, and keyboard operation of bounded Log and Cape Verde regions. | `e2e/player-flow.spec.ts`; `pnpm test:e2e` | No genuine 45–90 minute human Cape attempt was conducted, so this combined gate cannot pass yet. Automated layout checks do not prove that the hierarchy is clear or fun. |
| 15 | Content | Passed | Catalogue validation reports 24 events and all quotas; component tests render every authored choice, disabled reason, public requirement, and known consequence. | `pnpm event:validate`; `pnpm test:ui` | Prose quality still benefits from human playtest feedback but mechanical coherence checks pass. |

## Final automated and browser results

- `node --version`: `v22.13.1`
- `pnpm exec node --version`: `v22.13.1`
- `pnpm typecheck`: passed (engine and app TypeScript projects)
- `pnpm test`: 17 files, 151 tests passed
- `pnpm build`: engine build and production browser build passed
- `pnpm test:ui`: 2 files, 20 tests passed
- `pnpm test:e2e`: 8 Chromium paths passed, including fixed-session checks at
  1280×720, 1366×768, 1920×1080, and 520×900
- five-day skipped browser timing: 101 ms desktop, 117 ms narrow in the
  final validation run
- `pnpm test:determinism`: 5 files, 29 tests passed
- `pnpm event:validate`: 24 events; 8 delayed; 7 remembered; 8
  preparation-softened; 5 fact-producing
- production bundle scan: the e2e route markers are absent
- browser layout assertions: Expedition and Interrupt had no vertical or
  horizontal document overflow at all four target viewports; mission,
  milestone/current decision, critical status, and primary action stayed in
  the viewport; bounded Log and Cape Verde regions accepted keyboard scrolling

The WP3 and WP4 fixture hashes remained byte-for-byte unchanged; they are
listed in the implementation completion report and can be reproduced with
`pnpm fixture:wp3` and `pnpm fixture:wp4`.

## §35.2 human product questions

Automated correctness does not answer these. All five remain **unverified**:

| Question | Status | Evidence still required |
|---|---|---|
| Does the ellipse help players decide, or feel decorative? | Unverified | Observed player decisions and interview recall. |
| Can players explain a missed landfall after the final chart? | Unverified | Post-run explanation from players who actually experienced a miss. |
| Does report deposit make partial progress feel earned? | Unverified | Human response to a deposited-report loss, not a scripted assertion. |
| How many uninterrupted days remain tense? | Unverified | Measured play sessions and player commentary. |
| After three runs, does knowledge build confidence without removing decisions? | Unverified | A genuine three-run player session and debrief. |

## Balance conclusion

WP5 makes no tuning change. Mechanical gates do not show a specific balance
defect that justifies changing established deterministic outcomes. Gate 14 and
the five product questions stay open until genuine player evidence exists.
