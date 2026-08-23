# WP2 Survival Technical and Content Note

This note records WP2 implementation and authored **TUNING** data. It does not
change the **CONTRACT** prose in `docs/game-design.md`; section 34 remains
authoritative. WP2 stops at deterministic survival decisions. Authored journey
events, Cape survey content, run outcomes, reports, campaign persistence, and
player-facing screens remain WP3 or later work.

## Version and compatibility decision

WP2 uses explicit state/save/replay v3:

```text
age-of-exploration-state-v3
age-of-exploration-save-v3
age-of-exploration-replay-v3
```

The v3 state adds a `survival` object for lifecycle/location, dated batches,
finite Cape Verde stock, fouling, careening progress, warning pressure, status,
interrupts, and expedition intent. Water and provision totals remain in the
common `stores` projection and must equal their batch sums once underway.

V1 and v2 retain their exact schemas and constructors. `createInitialState()`
still creates v1, and `createNavigationState()` still creates v2. Saves and
replays for all three versions are readable, but envelope and state versions
must match. There is no silent reinterpretation, automatic migration, campaign
migration, or campaign persistence.

`createSurvivalState()` creates the Lisbon outfitting state with the 300-ducat
advance and empty allocation. `createCapeVerdePortFixtureState()` is a named,
deterministic test/content-fixture entry to the WP2 port state; it does not
simulate or replace WP3 journey content.

## Authored tuning data

All mass is integer kilograms, money is integer ducats, condition is basis
points, and multipliers are per mille. The focused source of these values is
`src/survival.ts` (`SURVIVAL_TUNING`).

### Hold, outfitting, and port stock

```text
Total hold                    60,000 kg
Fixed mission allocation      8,000 kg
Player-allocatable hold       52,000 kg
Sponsor advance                  300 ducats
```

| Store | Ship cap | Lisbon price / 1,000 kg | Cape Verde stock | Cape Verde price / 1,000 kg |
|---|---:|---:|---:|---:|
| Water | 24,000 kg | 2 | 24,000 kg | 3 |
| Provisions | 18,000 kg | 4 | 12,000 kg | 6 |
| Repair stores | 8,000 kg | 16 | 4,000 kg | 20 |
| Medicine | 2,000 kg | 40 | 500 kg | 60 |

Purchases accept integer kilograms. Because money remains integer ducats, a
fractional-ducat price is rounded upward to the next whole ducat. The common
contract quantities (for example 500 kg of Cape Verde medicine) price exactly.
Transactions compute and validate the complete candidate state before commit;
cap, hold, money, stock, negative-value, and location failures change no bytes
and consume no randomness.

Cape Verde stock is allocated once in v3 construction and only decremented.
Port entry and departure never recreate it. Entering the port normally requires
a recognised Cape Verde landfall; the named fixture constructor exists for
focused WP2 tests without adding WP3 route content.

### Crew, ration, repair, rest, and fouling

```text
Departure crew / able crew    25 / 25
Departure health / morale     10,000 / 7,500 bps
Minimum able crew to sail      8
```

| Ration policy | Water | Provisions | Health/day | Morale/day |
|---|---:|---:|---:|---:|
| Normal | x1.00 | x1.00 | 0 | 0 |
| Reduced water | x0.75 | x1.00 | -300 bps | -200 bps |
| Reduced provisions | x1.00 | x0.50 | -100 bps | -200 bps |
| Reduced both | x0.75 | x0.50 | -400 bps | -400 bps |

| Action | Repair stores | Restoration | Movement |
|---|---:|---:|---:|
| At-sea repair day | 250 kg | 500 bps | none |
| Cape Verde repair day | 500 kg | 1,500 bps | none |

Cape Verde rest costs 5 ducats per committed day, consumes normal daily stores,
adds 200 health and 400 morale basis points after ration/pressure consequences,
and caps both at 10,000.

The authored tropical rectangle is x -3,000..+3,000 nm and y -3,800..-950 nm,
inclusive. The day's starting true position decides whether the day is
tropical; the bounds are hidden authoritative content and never enter a normal
view or canonical player log. Every committed tropical WP2 day adds 5 basis
points of speed loss, capped at 1,500. Sailing applies the accumulated loss to
commanded speed. Six committed careening days at Cape Verde consume stores,
produce no movement, and the sixth day's completion resets fouling to zero
after that day's tropical accrual.

## Dated batches, FIFO, and spoilage

Lisbon departure and each Cape Verde water/provision purchase create a stable,
dated batch. Arrays remain oldest-first; consumption walks them in order and
removes empty batches. Daily consumption uses the living crew count at the
beginning of the day. At 25 crew, four normal days therefore consume exactly
600 kg water and 300 kg provisions.

Batch age is evaluated at the committed end-of-day date. A batch acquired on
day zero has age 45 after 45 committed days and does not spoil. It first becomes
eligible at age 46. Each eligible provision batch loses:

```text
ceiling(remaining usable kg / 1,000)
```

This is deterministic ceiling-kilogram rounding for the authored 0.1% daily
rate. It guarantees a positive eligible batch actually decays and can never
create mass. Water never loses mass merely from age. Water older than 45 days
activates the visible `sour_water` warning; the weighted sour-water choice event
remains WP3.

## Commands, results, and day transaction

V3 adds typed commands/results for:

- setting Lisbon outfitting and departing;
- entering/leaving Cape Verde and buying from finite stock;
- resting, repairing one of hull/mast/sails/rudder, and careening;
- setting return or objective-abandonment intent;
- sailing or committing a typed stranded wait day.

`applyCommand()` remains the shared reducer. `executeSurvivalCommand()` also
returns the just-committed typed canonical result. Every accepted command adds
exactly one replay command and one matching canonical result. Rejected commands
add neither.

Sailing days preserve the section 4.1 nine-phase order. Repair, rest, careening,
and stranded-wait days record the same phase order with movement, observations,
landfall, and WP3 events as explicit no-ops where inapplicable. Store
consumption/spoilage occurs before crew/ship condition resolution, and terminal
testing remains the final phase. No command commits a partial day.

Only a capable sailing day owns randomness: two main movement draws in the WP0
order plus one WP1 environment/weather draw. Outfitting, port purchases,
settings, entry/departure, repair, rest, careening, and stranded waits consume
neither PRNG stream. Projection, validation, serialization, hashing, canonical
logging, and chart rendering also consume no randomness.

## Warnings, stranded state, and terminal staging

The day that consumption first reaches zero water or provisions adds a visible
warning and applies no zero-store pressure. A later day that remains at zero
applies the authored pressure:

```text
water pressure       -2,000 health, -1,000 morale bps/day
provision pressure     -500 health,   -300 morale bps/day
```

Departure with a zero allocation exposes the warning in the departure result,
before the first pressure day. Replenishment clears the corresponding warning
and pressure counter.

Hull danger becomes visible at or below 1,500 bps. Hull zero without a prior
warning produces a stranded repair/distress/abandonment interrupt, leaving a
response boundary. Hull zero on a later committed day while the warning remains
may become terminal `ship_lost`. Zero mast, sails, or rudder and fewer than eight
able crew produce typed stranded interrupts and no normal travel; none is an
instant ship loss. Health zero uses the terminal wording "The pooled crew is
unable to continue the expedition." It does not claim that everyone died.

There is no mutiny terminal path in WP2. Return-to-Lisbon and
objective-abandonment intent remain representable whenever the ship can sail;
their eventual outcomes remain WP3.

## Hidden-information boundary

The v3 player view remains an allow-list. It adds visible hold use, dated batch
dates/quantities, port stock while in port, fouling, careening progress,
warnings, status, interrupts, and expedition intent. It does not expose true
position, either PRNG state, unknown-current data, tropical/current bounds,
future weather, hidden event/spoilage weights, or WP3 truth. Canonical
player-facing results use the same boundary and record `event: "none"` until
WP3.
