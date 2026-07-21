import test from "node:test";
import assert from "node:assert/strict";
import { scoreBounty } from "../lib/scoring";

test("high-certainty, leveraged work is pursued", () => {
  const assessment = scoreBounty({
    title: "Launch copy package",
    payoutUsd: 500,
    hoursEstimate: 5,
    daysToDeadline: 7,
    daysToPayout: 7,
    existingSubmissions: 4,
    fit: 5,
    paymentCertainty: 5,
    aiLeverage: 5,
    reuseValue: 5,
    agentAccessible: true,
    verifiableOutput: true,
  });

  assert.equal(assessment.result.verdict, "pursue_now");
  assert.ok(assessment.result.score >= 90);
  assert.equal(assessment.result.payoutPerHourUsd, 100);
  assert.equal(assessment.result.hardStops.length, 0);
});

test("negative net opportunities are killed", () => {
  const assessment = scoreBounty({
    payoutUsd: 20,
    cashCostUsd: 25,
    hoursEstimate: 1,
    daysToDeadline: 5,
    fit: 5,
    paymentCertainty: 5,
    aiLeverage: 5,
    reuseValue: 5,
  });

  assert.equal(assessment.result.verdict, "skip");
  assert.equal(assessment.result.score, 0);
  assert.ok(assessment.result.hardStops.some((stop) => stop.includes("zero or negative")));
});

test("unavailable human-only access is a hard stop", () => {
  const assessment = scoreBounty({
    payoutUsd: 1000,
    hoursEstimate: 2,
    daysToDeadline: 10,
    fit: 5,
    paymentCertainty: 5,
    aiLeverage: 5,
    reuseValue: 5,
    agentAccessible: false,
    humanSupportAvailable: false,
  });

  assert.equal(assessment.result.verdict, "skip");
  assert.ok(assessment.result.hardStops.some((stop) => stop.includes("human-only")));
});

test("available human support lowers friction without forcing a skip", () => {
  const assessment = scoreBounty({
    payoutUsd: 300,
    hoursEstimate: 4,
    daysToDeadline: 5,
    daysToPayout: 14,
    existingSubmissions: 10,
    fit: 5,
    paymentCertainty: 4,
    aiLeverage: 5,
    reuseValue: 4,
    agentAccessible: false,
    humanSupportAvailable: true,
    requiresAccount: true,
  });

  assert.notEqual(assessment.result.verdict, "skip");
  assert.equal(assessment.result.hardStops.length, 0);
});

test("invalid requests fail clearly", () => {
  assert.throws(
    () => scoreBounty({ payoutUsd: 50, hoursEstimate: 0, daysToDeadline: 5 }),
    /hoursEstimate/,
  );
  assert.throws(() => scoreBounty([]), /JSON object/);
});
