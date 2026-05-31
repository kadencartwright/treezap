import assert from "node:assert/strict";
import test from "node:test";

import { parseMinAgeDays } from "../src/duration";

test("parses minimum age strings into days", () => {
  assert.equal(parseMinAgeDays("30d"), 30);
  assert.equal(parseMinAgeDays("30D"), 30);
  assert.equal(parseMinAgeDays("7d"), 7);
  assert.equal(parseMinAgeDays("2w"), 14);
  assert.equal(parseMinAgeDays("2W"), 14);
  assert.equal(parseMinAgeDays("3M"), 90);
  assert.equal(parseMinAgeDays("3m"), 90);
  assert.equal(parseMinAgeDays("1y"), 365);
  assert.equal(parseMinAgeDays("1Y"), 365);
});

test("rejects unsupported minimum age strings", () => {
  assert.deepEqual(parseMinAgeDays("0d"), {
    _tag: "DurationParseError",
    input: "0d",
    reason: "must_be_positive_days",
  });
  assert.deepEqual(parseMinAgeDays("-1d"), {
    _tag: "DurationParseError",
    input: "-1d",
    reason: "must_be_positive_days",
  });
  assert.deepEqual(parseMinAgeDays("30"), {
    _tag: "DurationParseError",
    input: "30",
    reason: "expected_duration",
  });
  assert.deepEqual(parseMinAgeDays("1q"), {
    _tag: "DurationParseError",
    input: "1q",
    reason: "expected_duration",
  });
});
