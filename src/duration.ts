export type DurationParseErrorReason =
  | "expected_duration"
  | "must_be_positive_days";

export interface DurationParseError {
  readonly _tag: "DurationParseError";
  readonly input: string;
  readonly reason: DurationParseErrorReason;
}

export type MinAgeDays = number | DurationParseError;

const daysByUnit: Record<string, number> = {
  d: 1,
  w: 7,
  m: 30,
  y: 365,
};

export const parseMinAgeDays = (input: string): MinAgeDays => {
  const match = input.match(/^(-?\d+)([a-zA-Z]+)$/);

  if (match === null) {
    return {
      _tag: "DurationParseError",
      input,
      reason: "expected_duration",
    };
  }

  const amount = Number.parseInt(match[1] ?? "0", 10);

  if (amount <= 0) {
    return {
      _tag: "DurationParseError",
      input,
      reason: "must_be_positive_days",
    };
  }

  const unitDays = daysByUnit[(match[2] ?? "").toLowerCase()];

  if (unitDays === undefined) {
    return {
      _tag: "DurationParseError",
      input,
      reason: "expected_duration",
    };
  }

  return amount * unitDays;
};

export const isDurationParseError = (
  value: MinAgeDays,
): value is DurationParseError => typeof value !== "number";
