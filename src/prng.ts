import { SimulationValidationError } from "./errors.js";
import { PRNG_ALGORITHM, type PrngState } from "./types.js";

function rotateLeft(value: number, count: number): number {
  return ((value << count) | (value >>> (32 - count))) >>> 0;
}
function seedWords(seed: string): [number, number, number, number] {
  let hash = (1_779_033_703 ^ seed.length) >>> 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 3_432_918_353) >>> 0;
    hash = rotateLeft(hash, 13);
  }

  const emit = (): number => {
    hash = Math.imul(hash ^ (hash >>> 16), 2_246_822_507) >>> 0;
    hash = Math.imul(hash ^ (hash >>> 13), 3_266_489_909) >>> 0;
    hash = (hash ^ (hash >>> 16)) >>> 0;
    return hash;
  };

  const words: [number, number, number, number] = [emit(), emit(), emit(), emit()];
  if (words.every((word) => word === 0)) {
    words[0] = 0x9e3779b9;
  }
  return words;
}

export function createPrngState(seed: string): PrngState {
  if (typeof seed !== "string" || seed.length === 0 || seed.length > 256) {
    throw new SimulationValidationError("runSeed must contain 1 to 256 characters");
  }
  return {
    algorithm: PRNG_ALGORITHM,
    words: seedWords(seed),
  };
}

export interface PrngDraw {
  readonly value: number;
  readonly state: PrngState;
}

export function nextUint32(state: Readonly<PrngState>): PrngDraw {
  const [word0, word1, word2, word3] = state.words;
  const result = Math.imul(rotateLeft(Math.imul(word1, 5) >>> 0, 7), 9) >>> 0;
  const temporary = (word1 << 9) >>> 0;

  let next2 = (word2 ^ word0) >>> 0;
  let next3 = (word3 ^ word1) >>> 0;
  let next1 = (word1 ^ next2) >>> 0;
  let next0 = (word0 ^ next3) >>> 0;
  next2 = (next2 ^ temporary) >>> 0;
  next3 = rotateLeft(next3, 11);

  return {
    value: result,
    state: {
      algorithm: PRNG_ALGORITHM,
      words: [next0, next1, next2, next3],
    },
  };
}

export function nextIntegerInclusive(
  state: Readonly<PrngState>,
  minimum: number,
  maximum: number,
): PrngDraw {
  if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum) || minimum > maximum) {
    throw new SimulationValidationError("PRNG integer range must contain safe integers");
  }
  const span = BigInt(maximum - minimum + 1);
  if (span <= 0n || span > 0x1_0000_0000n) {
    throw new SimulationValidationError("PRNG integer range may contain at most 2^32 values");
  }
  const draw = nextUint32(state);
  const offset = Number((BigInt(draw.value) * span) >> 32n);
  return { value: minimum + offset, state: draw.state };
}
