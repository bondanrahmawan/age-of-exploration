import { describe, expect, it } from "vitest";

import {
  CanonicalizationError,
  SaveFormatError,
  advanceDay,
  canonicalState,
  canonicalize,
  createInitialState,
  deserializeSave,
  hashCanonical,
  serializeSave,
  sha256Hex,
} from "../src/index.js";

describe("canonical bytes and saves", () => {
  it("sorts keys, uses one LF, hashes known SHA-256 data, and rejects floats", () => {
    expect(canonicalize({ z: [3, 2], a: { d: true, c: null } })).toBe(
      '{"a":{"c":null,"d":true},"z":[3,2]}\n',
    );
    expect(hashCanonical({ b: 2, a: 1 })).toBe(
      "e8d38819d39f705646bfb643368eca78f7db476c16471dbc33b941b27326410d",
    );
    expect(sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(sha256Hex(new TextEncoder().encode(
      "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
    ))).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
    expect(() => canonicalize({ value: 1.5 })).toThrow(CanonicalizationError);
    expect(() => canonicalize({ [Symbol("hidden")]: 1 })).toThrow(CanonicalizationError);
  });

  it("round-trips every authoritative field including PRNG state", () => {
    let state = createInitialState({
      contentVersion: "wp0-test-v1",
      runSeed: "save-round-trip",
    });
    state = advanceDay(state);
    state = advanceDay(state);
    const serialized = serializeSave(state);
    const restored = deserializeSave(new TextEncoder().encode(serialized));

    expect(canonicalState(restored)).toBe(canonicalState(state));
    expect(restored.prng).toEqual(state.prng);
    expect(restored.canonicalLog).toEqual(state.canonicalLog);
    expect(restored.replayCommands).toEqual(state.replayCommands);
    expect(serialized.endsWith("\n")).toBe(true);
    expect(serialized.endsWith("\n\n")).toBe(false);
    expect(serialized.includes("\r")).toBe(false);
    expect(new TextEncoder().encode(serialized).at(-1)).toBe(0x0a);
  });

  it("rejects non-canonical or corrupt saves explicitly", () => {
    const state = createInitialState({
      contentVersion: "wp0-test-v1",
      runSeed: "corrupt-save",
    });
    const serialized = serializeSave(state);
    const parsed = JSON.parse(serialized) as { state: { stores: { waterKg: number } } };
    parsed.state.stores.waterKg = -1;

    expect(() => deserializeSave(canonicalize(parsed))).toThrow(SaveFormatError);
    expect(() => deserializeSave(serialized.trimEnd())).toThrow(SaveFormatError);
    expect(() => deserializeSave("not json\n")).toThrow(SaveFormatError);
    expect(canonicalState(state)).toBe(canonicalState(createInitialState({
      contentVersion: "wp0-test-v1",
      runSeed: "corrupt-save",
    })));
  });
});
