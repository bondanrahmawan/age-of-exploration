import { describe, expect, it } from "vitest";

import { createPrngState, nextIntegerInclusive, nextUint32 } from "../src/index.js";

describe("xoshiro128ss-v1", () => {
  it("locks the documented seed expansion and uint32 output vectors", () => {
    let state = createPrngState("wp0-vector");
    expect(state.words).toEqual([548_758_372, 3_534_665_579, 2_972_052_341, 420_779_762]);

    const values: number[] = [];
    for (let index = 0; index < 6; index += 1) {
      const draw = nextUint32(state);
      values.push(draw.value);
      state = draw.state;
    }

    expect(values).toEqual([
      1_528_752_126,
      4_170_463_848,
      882_946_908,
      119_148_976,
      1_775_900_778,
      395_427_497,
    ]);
    expect(state.words).toEqual([
      3_049_370_249,
      830_582_355,
      2_488_660_756,
      2_840_365_215,
    ]);
  });

  it("maps a bounded integer with exactly one state transition", () => {
    const initial = createPrngState("bounded-vector");
    const bounded = nextIntegerInclusive(initial, -4, 4);
    const raw = nextUint32(initial);

    expect(bounded.value).toBeGreaterThanOrEqual(-4);
    expect(bounded.value).toBeLessThanOrEqual(4);
    expect(bounded.state).toEqual(raw.state);
  });
});
