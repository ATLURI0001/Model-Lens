import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clamp,
  percentile,
  mean,
  median,
  standardDeviation,
  iqr,
  safeDivide,
  normalizeTokenCount,
  calculateCostPerThousand,
  computeTokenCosts,
} from "./math.ts";

describe("clamp", () => {
  it("clamps values within bounds", () => {
    assert.strictEqual(clamp(5, 0, 10), 5);
    assert.strictEqual(clamp(-5, 0, 10), 0);
    assert.strictEqual(clamp(15, 0, 10), 10);
  });

  it("handles reversed min/max gracefully", () => {
    assert.strictEqual(clamp(15, 10, 0), 10);
  });
});

describe("percentile", () => {
  it("returns 0 for empty or invalid inputs", () => {
    assert.strictEqual(percentile([], 0.5), 0);
    assert.strictEqual(percentile([NaN, Infinity, -Infinity], 0.95), 0);
  });

  it("computes exact percentiles for sorted sequences", () => {
    const data = [10, 20, 30, 40, 50];
    assert.strictEqual(percentile(data, 0), 10);
    assert.strictEqual(percentile(data, 0.2), 10);
    assert.strictEqual(percentile(data, 0.5), 30);
    assert.strictEqual(percentile(data, 1.0), 50);
  });

  it("normalizes integer percentage (e.g. 95 vs 0.95)", () => {
    const data = [10, 20, 30, 40, 50];
    assert.strictEqual(percentile(data, 50), 30);
    assert.strictEqual(percentile(data, 100), 50);
  });

  it("clamps out-of-bounds p values", () => {
    const data = [1, 2, 3];
    assert.strictEqual(percentile(data, -0.5), 1);
    assert.strictEqual(percentile(data, 150), 3);
  });

  it("filters non-finite numbers before computing", () => {
    const data = [10, NaN, 20, Infinity, 30];
    assert.strictEqual(percentile(data, 0.5), 20);
  });
});

describe("mean and median", () => {
  it("computes mean correctly", () => {
    assert.strictEqual(mean([]), 0);
    assert.strictEqual(mean([10, 20, 30]), 20);
    assert.strictEqual(mean([10, NaN, 30]), 20);
  });

  it("computes median for odd and even length arrays", () => {
    assert.strictEqual(median([]), 0);
    assert.strictEqual(median([10, 20, 30]), 20);
    assert.strictEqual(median([10, 20, 30, 40]), 25);
  });
});

describe("standardDeviation and iqr", () => {
  it("computes standard deviation", () => {
    assert.strictEqual(standardDeviation([]), 0);
    assert.strictEqual(standardDeviation([5]), 0);
    const sd = standardDeviation([2, 4, 4, 4, 5, 5, 7, 9]);
    assert.ok(Math.abs(sd - 2.0) < 0.01);
  });

  it("computes interquartile range", () => {
    assert.strictEqual(iqr([]), 0);
    const data = [1, 2, 3, 4, 5, 6, 7, 8];
    assert.ok(iqr(data) >= 0);
  });
});

describe("safeDivide and normalizeTokenCount", () => {
  it("protects against zero-division and non-finite values", () => {
    assert.strictEqual(safeDivide(10, 0), 0);
    assert.strictEqual(safeDivide(10, 0, -1), -1);
    assert.strictEqual(safeDivide(NaN, 5), 0);
    assert.strictEqual(safeDivide(10, Infinity), 0);
    assert.strictEqual(safeDivide(10, 2), 5);
  });

  it("normalizes token count inputs safely", () => {
    assert.strictEqual(normalizeTokenCount(100), 100);
    assert.strictEqual(normalizeTokenCount("250"), 250);
    assert.strictEqual(normalizeTokenCount(-10), 0);
    assert.strictEqual(normalizeTokenCount(NaN), 0);
    assert.strictEqual(normalizeTokenCount(null), 0);
    assert.strictEqual(normalizeTokenCount(undefined), 0);
    assert.strictEqual(normalizeTokenCount("invalid"), 0);
  });
});

describe("computeTokenCosts and calculateCostPerThousand", () => {
  it("computes cost per thousand tokens safely", () => {
    assert.strictEqual(calculateCostPerThousand(0.05, 0), 0);
    assert.strictEqual(calculateCostPerThousand(0.05, 1000), 0.05);
    assert.strictEqual(calculateCostPerThousand(0.1, 2000), 0.05);
  });

  it("computes token costs with standard pricing", () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 500_000 };
    const pricing = { inputCostPerMillion: 3.0, outputCostPerMillion: 15.0 };
    const cost = computeTokenCosts(usage, pricing);

    assert.strictEqual(cost.inputCost, 3.0);
    assert.strictEqual(cost.outputCost, 7.5);
    assert.strictEqual(cost.totalCost, 10.5);
    assert.strictEqual(cost.costPerInputToken, 0.000003);
    assert.strictEqual(cost.costPerOutputToken, 0.000015);
    assert.strictEqual(cost.costPerTotalToken, 0.000007);
  });

  it("handles null/undefined/missing rates and zero tokens gracefully", () => {
    const costEmpty = computeTokenCosts(null, null);
    assert.strictEqual(costEmpty.inputCost, 0);
    assert.strictEqual(costEmpty.outputCost, 0);
    assert.strictEqual(costEmpty.totalCost, 0);
    assert.strictEqual(costEmpty.costPerInputToken, 0);
    assert.strictEqual(costEmpty.costPerOutputToken, 0);
    assert.strictEqual(costEmpty.costPerTotalToken, 0);

    const costZeroTokens = computeTokenCosts(
      { inputTokens: 0, outputTokens: 0 },
      { inputCostPerMillion: 5.0, outputCostPerMillion: 10.0 }
    );
    assert.strictEqual(costZeroTokens.inputCost, 0);
    assert.strictEqual(costZeroTokens.totalCost, 0);
    assert.strictEqual(costZeroTokens.costPerInputToken, 0);
  });
});

