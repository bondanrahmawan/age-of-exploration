import { SimulationValidationError } from "./errors.js";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
function daysInMonth(year: number, month: number): number {
  const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return lengths[month - 1] ?? 0;
}

export function assertIsoDate(value: unknown, label = "date"): asserts value is string {
  if (typeof value !== "string") {
    throw new SimulationValidationError(`${label} must be an ISO date string`);
  }
  const match = ISO_DATE.exec(value);
  if (match === null) {
    throw new SimulationValidationError(`${label} must use YYYY-MM-DD`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new SimulationValidationError(`${label} is not a valid Gregorian date`);
  }
}

export function addOneDay(value: string): string {
  assertIsoDate(value);
  const match = ISO_DATE.exec(value);
  if (match === null) {
    throw new SimulationValidationError("date could not be parsed");
  }
  let year = Number(match[1]);
  let month = Number(match[2]);
  let day = Number(match[3]) + 1;
  if (day > daysInMonth(year, month)) {
    day = 1;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  if (year > 9_999) {
    throw new SimulationValidationError("date exceeds four-digit year range");
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
