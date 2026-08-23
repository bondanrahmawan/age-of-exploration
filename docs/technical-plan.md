# WP0 Technical Plan

`docs/game-design.md` is the repository's development contract. Section 34 wins
over broader prose. This document records the preserved WP0 foundation. WP1's
versioned extension and authored tuning are recorded separately in
`docs/wp1-navigation.md`; WP2 is the next gate.

## Runtime and boundaries

- Node.js 22, strict TypeScript, pnpm, and Vitest.
- `src/` contains pure state transitions and serialization. It does not import
  filesystem, UI, network, browser-storage, clock, or operating-system APIs.
- A caller injects a deterministic daily environment provider. WP0 ships only
  `fairWeatherStillWaterEnvironment`, which supplies fair movement factors, no
  current or leeway, and no observation or landfall. Environment content is not
  persisted in or exposed by the player view.
- The public player projection is an allow-list. It excludes the seed, PRNG
  state, true position, environment truth, and replay inputs.

## Canonical integer units

| Quantity | Persisted unit / scale |
|---|---|
| Mass | integer kilograms (`kg`) |
| Position and uncertainty | integer milli-nautical-miles (`mnm`), 1 nm = 1,000 mnm |
| Money | integer ducats |
| Health, morale, and component condition | basis points, 0–10,000 = 0–100% |
| Multipliers | per-mille, 1,000 = ×1.000 |
| Heading error | integer milli-degrees |
| Distance error | integer parts-per-million |

Intermediate products use integer or `bigint` arithmetic and are rounded by an
explicit helper. `bigint` never enters persisted state. Fractional ration use is
rounded up to the next kilogram so integer storage never grants free supplies.

## Day transaction

One committed day is built privately, validated, then returned atomically in the
exact §4.1 order:

1. lock heading and sailing policy;
2. resolve the injected environment;
3. advance hidden true position;
4. advance estimated position and uncertainty;
5. attempt observation / landfall (WP0 no-op hook);
6. consume stores and apply spoilage (consumption only in WP0);
7. tick ship, crew health, and morale (ration consequences only in WP0);
8. evaluate at most one event (WP0 no-op hook);
9. test interruptions and terminal states (WP0 no-op hook).

The date/day and one canonical daily log record are committed only after all
phases succeed. Invalid input throws and the caller's state is not mutated.

## Seeded randomness

The named algorithm is `xoshiro128ss-v1` (xoshiro128**), with four serializable
unsigned 32-bit words. A string run seed is expanded with the documented xmur3
32-bit UTF-16-code-unit mixer; an all-zero state is replaced by a fixed non-zero
word. All operations wrap to unsigned 32 bits. Its output/transition is:

```text
result = rotl(s1 * 5, 7) * 9
t = s1 << 9
s2 ^= s0; s3 ^= s1; s1 ^= s2; s0 ^= s3; s2 ^= t; s3 = rotl(s3, 11)
```

xmur3 begins at `1779033703 XOR UTF-16 length`, folds each code unit with
`imul(..., 3432918353)` and a 13-bit rotate, then emits words using the
`2246822507` and `3266489909` avalanche constants. Each WP0 sailing day
consumes exactly two draws in this order:

1. bounded steering error;
2. bounded logged-distance error.

Range mapping uses integer multiply-high, so each sample consumes exactly one
draw. Logging, serialization, hashing, and player projection consume no draws.
Fixed vectors in `test/prng.test.ts` lock both seeding and output behavior.

## Save, replay, and canonical bytes

Canonical JSON recursively sorts object keys, rejects non-JSON values and every
non-safe or non-integer number, uses UTF-8 encoding, and ends with exactly one LF
byte (`0A`). SHA-256 hashes include that final LF. Save envelopes contain every
authoritative state field, including PRNG state, log, and replay commands.
Deserialization requires canonical bytes and validates the complete state before
returning it.

A replay record contains its format, content version, run seed, starting-state
hash, and ordered commands. Replaying requires the caller-supplied starting state
and deterministic environment provider, verifies the contract identifiers and
starting hash, then runs commands through the same reducer.
