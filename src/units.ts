import { SimulationValidationError } from "./errors.js";

export const MNAUTICAL_MILES_PER_NAUTICAL_MILE = 1_000;
export const CONDITION_MAX_BPS = 10_000;
export const MULTIPLIER_ONE_PERMILLE = 1_000;
export const PARTS_PER_MILLION = 1_000_000;
export const ALLOCATABLE_HOLD_KG = 52_000;

function toSafeNumber(value: bigint, label: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) {
    throw new SimulationValidationError(`${label} exceeds the safe integer range`);
  }
  return result;
}
export function divideRoundHalfAwayFromZero(
  numerator: bigint,
  denominator: bigint,
  label = "integer division",
): number {
  if (denominator <= 0n) {
    throw new SimulationValidationError(`${label} requires a positive denominator`);
  }
  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  let quotient = magnitude / denominator;
  const remainder = magnitude % denominator;
  if (remainder * 2n >= denominator) {
    quotient += 1n;
  }
  return toSafeNumber(negative ? -quotient : quotient, label);
}

export function divideCeiling(
  numerator: bigint,
  denominator: bigint,
  label = "ceiling division",
): number {
  if (numerator < 0n || denominator <= 0n) {
    throw new SimulationValidationError(
      `${label} requires a non-negative numerator and positive denominator`,
    );
  }
  return toSafeNumber((numerator + denominator - 1n) / denominator, label);
}

export function scaleByPermille(
  value: number,
  factors: readonly number[],
  label: string,
): number {
  let numerator = BigInt(value);
  let denominator = 1n;
  for (const factor of factors) {
    numerator *= BigInt(factor);
    denominator *= BigInt(MULTIPLIER_ONE_PERMILLE);
  }
  return divideRoundHalfAwayFromZero(numerator, denominator, label);
}

export function scaleByPartsPerMillion(
  value: number,
  factorPpm: number,
  label: string,
): number {
  return divideRoundHalfAwayFromZero(
    BigInt(value) * BigInt(factorPpm),
    BigInt(PARTS_PER_MILLION),
    label,
  );
}

export function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
