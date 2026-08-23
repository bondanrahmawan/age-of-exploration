# WP3 Authored Journey

WP3 implements only the current Lisbon → Cape Verde → Cape of Good Hope → Lisbon expedition. It does not implement report deposition, campaign persistence, after-action truth comparison, or later expeditions.

## Compatibility boundary

- WP3 state is `age-of-exploration-state-v4`.
- WP3 saves and replays are `age-of-exploration-save-v4` and `age-of-exploration-replay-v4`.
- `createJourneyState` is the production v4 constructor. `createJourneyFixtureState` is the deterministic authored-location test constructor.
- V1, v2, and v3 constructors and serialized shapes remain unchanged and readable.
- Canonical JSON, hashing, and the one-log-entry-per-command replay contract are unchanged.

## Authored locations

Cape Verde retains the finite WP2 port stock, purchases, rest, repair, and careening behavior. `purchase_cape_verde_rumour` spends exactly 10 ducats and uses one event-substream draw to select one of three stable current-expedition rumour facts at confidence 25. Rejected or repeated purchases draw nothing.

The Cape objective is recognised only after a true-position visible landfall. An estimated-marker miss cannot be converted into recognition. Two `survey_cape_day` commands commit two complete normal-consumption, no-movement days. Completion records the landmark, water-source, and hazard facts once. `collect_cape_water` commits one normal-consumption, no-movement day and then adds the smaller of 12,000 kg, the water-store cap, or remaining allocatable hold capacity. The Cape has no trading-port transition.

A recognised true-position Lisbon landfall resolves exactly one `full_success` or `partial_return`. Warned terminal survival loss or staged seizure resolves `objective_failure`. Every later gameplay command is rejected. `advanceUntilInterrupted` calls the ordinary reducer one day at a time and stops on the existing visible choice, landfall/interruption, stranded state, terminal outcome, or authored location; it owns no alternate transition rules.

## Authored event catalogue

The data catalogue contains 24 choice events:

| Group | Count |
|---|---:|
| Weather | 5 |
| Stores | 4 |
| Ship | 4 |
| Crew | 7 |
| Navigation/discovery | 4 |

The validated quota totals are eight delayed, seven remembered, eight preparation-softened, and five fact-producing events. Every event has two to four choices and at least one spendable mitigation. The catalogue includes falling glass before the major storm, fatigue before severe sickness, the grumbling → petition → officers divide → attempted seizure chain, and the existing WP2 hull warning before ship loss. “Officers divide” is authored stage text and a flag only; no individual officer simulation exists.

Events remain eligible during sailing, repair, Cape Verde rest/careening, and Cape survey/water days. Non-sailing days do not consume movement or environment draws.

## Event PRNG ownership

The dedicated serializable event substream is seeded with the stable domain separator:

```text
runSeed + "::events:authored-journey-v1"
```

Daily selection uses this stable order:

1. Apply hard gates.
2. Apply deterministic state-dependent weight modifiers.
3. Exclude cooldown and once-per-leg entries.
4. If the eligible pool is empty, consume zero draws.
5. Otherwise consume one uniform 1–1,000 daily-chance draw.
6. Only when that chance passes, consume one uniform 1–total-weight selection draw and walk the catalogue in stable authored order.

At most one choice event is presented per committed day. A scheduled forced follow-up consumes no draw and takes the one event slot for that day. Buying the Cape Verde rumour consumes one uniform catalogue-index draw after every atomic precondition passes.

Choice availability inspection, choice application, immediate effects, delayed consequences, follow-up presentation, Cape recognition, survey, water collection, logging, projection, serialization, hashing, replay construction, and debug-chart rendering consume no randomness. Failed commands consume no randomness. The event substream never perturbs movement or authored-environment streams.

## Projection and WP4 boundary

The normal journey view exposes current-expedition facts, visible choice availability and non-secret rejection reasons, survey progress, and the terminal outcome. It omits true position, every PRNG state, chance rolls, weights, hidden environment values, internal flags, scheduled future consequences, and future chain stages. Raw v4 state retains only what deterministic resume requires.

`report_success` is reserved in the typed outcome identifier set but v4 state validation rejects it as unreachable. That outcome requires the Cape Verde deposited-report snapshot owned by WP4. WP3 contains no report deposition, report snapshot, campaign knowledge, truth comparison, after-action report, or second/third expedition flow.
