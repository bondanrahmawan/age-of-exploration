# WP4 Knowledge Campaign

WP4 adds the headless knowledge campaign required by §34.10–§34.12 and stops
before WP5. The four player-facing screens, pacing, animation, visual
after-action chart, and accessibility presentation are not implemented here.

## Wrapper and compatibility boundary

The released journey remains `age-of-exploration-state-v4`. Its state, save,
replay, reducer, validation, and one-log-entry-per-command contract are not
reinterpreted. Campaign persistence is a separate wrapper with explicit
formats:

```text
age-of-exploration-campaign-v1
age-of-exploration-campaign-save-v1
age-of-exploration-campaign-replay-v1
age-of-exploration-after-action-v1
```

An active campaign expedition owns an unchanged `JourneySimulationState`, the
reported facts inherited at its start, at most one Cape Verde report snapshot,
the hidden after-action trace, and departure metrics. Every ordinary
simulation command is wrapped as `forward_simulation_command` and passed to
the existing v4 `applyCommand` reducer. The campaign does not duplicate
movement, weather, events, survival, port, survey, or terminal rules.

Campaign-only commands are:

```text
start_expedition(runSeed)
deposit_report_at_cape_verde
finalize_expedition
```

The seed is required command data for every new expedition. Run numbers are
consecutive but unbounded. No clock, filesystem, storage, network, browser, or
implicit randomness is consulted.

V1–v4 saves remain readable by the existing save API. Campaign saves use their
own API and envelope, so no released shape is silently migrated.

## Starting knowledge and adapters

A new campaign contains exactly four standard facts:

| Fact | Confidence | Status |
|---|---:|---|
| Lisbon landmark | 100 | confirmed |
| Cape Verde / Santiago landmark | 90 | confirmed |
| Cape Verde port | 90 | confirmed |
| Broad Cape goal region | 25 | rumoured |

There is no starting South Atlantic current fact.

Campaign facts use structured claimed values: a position, a current vector, or
a statement. Each fact also stores its stable ID, type, affected location or
region, source, confidence, observed date, reported date (null while carried
but unreported), status, and a stable sorted evidence array.

Deterministic adapters translate campaign landmark/current facts into v4
navigation facts. Confirmed inherited current knowledge therefore enters the
ordinary v4 navigation state and is applied by the existing environment logic.
Journey facts translate back into campaign evidence. Stable mappings include:

- `fact.south-atlantic-current-hypothesis` → `current.south-atlantic` with the
  structured authored vector;
- `fact.cape-landmark-survey` → the standard Cape goal landmark ID and
  structured position;
- other journey facts retain their IDs and become structured statement claims.

The campaign trace also implements §34.10's recognised-landfall discrepancy
rule. A segment of at least five committed days with at least 50 nm of
east–west current contribution creates confidence-40 observed current
evidence only when a recognised landfall makes the discrepancy knowable.

## Canonical merge rules

Merge is computed from the complete evidence set, never by mutating a winner
in arrival order.

1. Fact arrays are sorted by stable fact ID; evidence arrays are sorted by
   stable evidence ID.
2. Re-reporting the same evidence ID is idempotent. Its earliest report date is
   retained.
3. The first matching observation establishes its stated confidence. Matching
   evidence from the same run adds 20; the first matching evidence from a
   different run adds 25. Current confidence is capped at 95; other facts at
   100.
4. A later weaker matching rumour cannot lower or replace confirmed
   information.
5. Disproof remains evidence. It becomes authoritative only when its strongest
   evidence is at least as strong as the strongest supporting evidence.
6. Equal-ID claims with different structured values remain together in the
   evidence array. The canonical claim is selected by aggregate confidence,
   strongest individual evidence, then canonical claim bytes. Conflicts are
   therefore deterministic and never silently overwritten.
7. Equal evidence IDs with different substantive contents, or equal fact IDs
   with conflicting type/location identity, are rejected.

These rules make merge order irrelevant and prevent duplicate reports from
duplicating facts or repeatedly granting confidence.

## Cape Verde deposit snapshot

`deposit_report_at_cape_verde` is legal only when an expedition is active, the
v4 journey and survival locations are both Cape Verde, no event choice is
pending, and the run is not terminal.

The immutable snapshot contains:

- committed day and date;
- whether the Cape objective had been achieved;
- the complete eligible carried facts with exact source, confidence, status,
  and evidence at that boundary;
- a SHA-256 hash of the canonical snapshot payload.

Deposit performs no v4 reducer transition, consumes no PRNG draw, and changes
no navigation truth. A later deposit replaces the single prior snapshot with
a newer complete snapshot. A failed deposit changes no campaign or v4 bytes.
The campaign command log receives one deposit entry while v4's own log remains
untouched.

## Reporting and outcome precedence

Finalization is explicit and is legal only after the active v4 journey has a
terminal outcome. This preserves the required save boundary immediately before
finalization.

- A recognised Lisbon return reports every eligible carried fact.
- Any loss or other termination reports only the latest Cape Verde snapshot at
  full strength.
- Evidence learned after the last snapshot is listed as lost with the ship, and
  is then merged as salvage: one piece of evidence per finding, its confidence
  the lower of the finding's own and the salvage cap of 40, its status
  `observed` at the cap, `rumoured` below it, and `disproved` if the expedition
  disproved the claim. Its source names the salvage.
- Salvage never reaches confidence 70 on its own, so it cannot by itself confirm
  a fact or earn automatic navigation correction, and it never changes the run
  outcome.
- A loss with no snapshot therefore reports no fact at full strength, but still
  salvages what the expedition logged.
- Earlier campaign facts are never removed or weakened by a failed expedition;
  salvaged evidence merges alongside them under the ordinary confidence rules.

Campaign outcomes are exactly:

| Outcome | Campaign rule |
|---|---|
| `full_success` | Cape recognised and the ship returns to Lisbon. |
| `report_success` | Cape recognised, the latest Cape Verde snapshot records that achievement, and the ship is later lost. |
| `partial_return` | Ship returns to Lisbon without Cape recognition. |
| `objective_failure` | No qualifying full, report, or partial return. |

An early pre-Cape snapshot cannot produce `report_success`. V4 continues to
reject `report_success`; only campaign finalization can produce it.

## Hidden trace and after-action truth

The active wrapper records one initial trace point and one point for every
committed v4 day. A point contains day/date, estimated and true positions,
uncertainty, observed weather, current contribution, and a recognised-landmark
marker. Capturing the environment result occurs inside the same provider call
used by the v4 reducer; the trace owns no random stream and does not alter draw
order.

The hidden trace is serialized in campaign saves and reproduced by campaign
replay. It is omitted from `getCampaignPlayerView`, along with active true
position/track, all PRNG state, unknown-current geometry, pending consequences,
future events, and snapshot internals. The projection exposes only snapshot
date, fact count, and the number of logged findings no deposited copy holds.
That last count is derived from journey facts and navigation knowledge only,
never from the hidden trace, so it can be shown on deck while the voyage runs.

Finalization converts the hidden trace into serializable after-action data:

- outcome/reason, run number/seed, departure/final dates, elapsed days, and
  objective status;
- departure and final crew, ship, and store metrics;
- exact total water and provisions consumed from v4 day logs;
- facts observed, reported, disproved, evidence lost with the ship, and the
  salvaged records that reached Lisbon in its place;
- snapshot day/hash and campaign fact changes inherited next time;
- estimated track, true track, uncertainty, and actual error history.

True track appears only in finalized reports. Current contribution vectors are
included only when the resulting campaign knowledge contains reported,
non-disproved current evidence at confidence 40 or higher. Otherwise the
report labels those points `unexplained_route_divergence` and omits the vector.

## Save, replay, hashing, and PRNG ownership

Campaign save round-trips the facts, summaries, reports, active v4 state, all
three underlying v4 PRNG states, snapshot, hidden trace, campaign log, and
ordered replay commands. Canonical JSON and SHA-256 use the existing canonical
implementation.

Campaign replay records:

- campaign replay/content format;
- starting campaign hash;
- explicit expedition seed sequence;
- ordered campaign commands, including every forwarded v4 command.

Replay verifies the starting hash, content version, and seed sequence before
using the same campaign reducer. Save/resume is covered at an ordinary day,
pending choice, immediately after deposit, immediately before finalization,
and between expeditions.

PRNG ownership remains with v4:

- movement, environment, and event streams retain their WP0–WP3 ownership;
- campaign start, deposit, merge, projection, trace inspection, reporting,
  hashing, serialization, and replay construction draw nothing;
- rejected campaign commands draw nothing and commit nothing.

## Three-run fixture and WP5 gate

`pnpm fixture:wp4` runs a deterministic injected test route:

1. Run 1 buys one new fact, deposits an early Cape Verde report, then loses the
   ship after water pressure. Only the snapshot persists.
2. Run 2 inherits that reported fact, records three matching current
   discrepancies, confirms the current, surveys the Cape, deposits a later
   report, and returns with full success.
3. Run 3 inherits the accumulated campaign knowledge. Its v4 estimate applies
   the confirmed +18,000/-4,000 mnm daily current automatically; prior hidden
   traces and unreported observations are absent.

The script verifies byte-equivalent replay and prints hashes for campaign state
after each run, each report, final knowledge, the campaign command log, and the
replay record.

WP5 is the next gate. WP4 provides trustworthy structured data but no screens,
chart presentation, pacing, animation, outfitting UI, interrupt modal, or
after-action visual design.
