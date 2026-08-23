# WP1 Navigation Technical and Content Note

This note records WP1 implementation and initial **TUNING** data. It does not
change the **CONTRACT** prose in `docs/game-design.md`; section 34 remains
authoritative. WP1 stops at navigation results and a debug SVG. Survival,
ports, authored events, report persistence, and campaign progression remain
later work packages.

## Version and deterministic state

WP0 remains available byte-for-byte as state/save/replay v1. Its still-water
fixture consumes exactly two main simulation PRNG draws per sailing day and
retains its original state and log hashes.

WP1 navigation state deliberately uses state/save/replay v2. It adds a
persisted `navigation` object containing weather memory, a named environment
PRNG substream, known navigation facts, and the most recent typed observation,
landfall, and interrupt. V1 and v2 envelopes are both readable, but their
envelope version must match their state version. There is no silent v1 schema
reinterpretation or automatic migration.

The main movement substream still owns exactly two draws per day, in the WP0
order: steering error, then logged-distance error. The WP1 environment stream
is seeded from `<run seed>::environment:authored-atlantic-v1` and owns exactly
one weather-transition draw per day. Weather selection depends on authored
region, Gregorian season, previous weather, and this run-seeded substream.
Rendering, projection, saving, hashing, and logging consume neither stream.

## Authored map and environment tuning

All coordinates and distances below are integer milli-nautical-miles in state.
The table uses nautical miles for readability.

| Landmark | Centre (nm) | Physical radius | Starting fact |
|---|---:|---:|---|
| Lisbon | (0, 0) | 15 nm | confirmed, confidence 100 |
| Cape Verde / Santiago | (-770, -1430) | 15 nm | confirmed, confidence 90 |
| Cape goal region | (+1660, -4390) | 60 nm | rumoured, confidence 25 |

The single Atlantic wind field has two authored latitude bands inside one
field. Its initial compass headings mean **wind from**, never wind toward:

| Band | Bounds (nm) | Winter | Spring | Summer | Autumn |
|---|---|---|---|---|---|
| North Atlantic | x -3000..+3000, y -2000..+750 | NE | NNE | N | NE |
| South Atlantic | x -3000..+3000, y -5000..-2000.001 | ESE | SE | SSE | SE |

Point-of-sail classification uses the selected 16-point heading relative to
that source direction. Within 45 degrees of the wind automatically tacks at
speed ×0.35 and uncertainty ×1.25. The next 22.5-degree point is close-hauled
at ×0.50; beam-reach points use ×0.90; running and broad-reach points use
×1.00. Calm has no direction and commanded movement ×0.00.

The one South Atlantic current region initially uses:

- bounds: x -1500..+1200 nm, y -3800..-1700 nm, inclusive;
- true vector: +18 nm east and -4 nm south per day;
- stable fact id: `current.south-atlantic`.

True movement applies this vector when the day's starting true position is in
the region. Estimated movement applies a claimed vector only when the matching
fact is confirmed at confidence 70 or higher. Rumoured or observed facts below
70 remain visible for player judgement but are not applied automatically.

## Weather tuning

The authored weather Markov weights are data in `src/world.ts`. North Atlantic
base weights are 52 clear, 14 rough, 22 overcast, 8 calm, and 4 storm. South
Atlantic base weights are 44, 22, 16, 10, and 8. Seasonal adjustments are
added, the previous state receives +45 persistence weight, and every final
weight is clamped to at least one.

| State | Speed | Uncertainty | Sight | Noon observation |
|---|---:|---:|---:|---|
| fair/clear | ×1.00 | ×1.00 | 20 nm | latitude reset to ±15 nm |
| rough/heavy swell | ×0.75 | ×1.50 | 8 nm | latitude reset to ±40 nm |
| overcast | ×0.90 | ×1.50 | 8 nm | no latitude reset |
| calm | ×0.00 | ×1.00 | 20 nm | latitude reset to ±15 nm |
| storm | ×0.75 | ×1.80 | 8 nm | none |

Storm is an observed weather state only in WP1. It causes no surprise damage;
storm events and consequences remain WP3.

## Observations, landfall, and hidden truth

A usable noon sight corrects only the estimated north-south coordinate and its
uncertainty radius. East-west estimate and uncertainty remain untouched.
Recognised confirmed landmarks correct the estimated position to the claimed
chart position and set both uncertainty radii to the 5 nm base-game floor.
Neither operation changes true position.

Landfall uses squared `bigint` distance comparisons against true position.
Visibility is physical radius plus the weather sight radius. A visible fact is
recognised only when its chart status is confirmed and confidence is at least
70. Thus Cape Verde can fix the estimate, while the initial Cape rumour yields
visible but unrecognised land. If the estimate enters a known landmark symbol
but true geometry is outside visibility, the typed result is `missed`.

`getPlayerView()` is an allow-list. It exposes estimates, uncertainty, observed
weather and wind, typed visible results, and known facts. It omits true position,
environment PRNG state, unknown current data, authored bounds, undiscovered
geometry, and future weather. Canonical player-facing day logs follow the same
boundary.

## Debug chart

`pnpm chart:wp1` builds the package and writes the deterministic representative
chart to `artifacts/wp1-navigation.svg`. The ignored `artifacts/` directory is
outside the package. The dependency-free renderer is in `debug/chart.mjs`,
outside the pure simulation source boundary. Default rendering accepts only a
player view and shows estimated track, estimate, ellipse, player-known landmark
facts, and observed weather/wind. Truth appears only when a caller supplies an
explicit `developerTruth` option; `getPlayerView()` cannot provide that data.
