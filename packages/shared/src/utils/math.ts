/**
 * Clamp a numeric value within [min, max].
 */
export function clamp(value: number, min: number, max: number): number {
  if (min > max) [min, max] = [max, min];
  return Math.min(Math.max(value, min), max);
}

/**
 * Filter and extract finite numbers from an array.
 */
function extractFiniteNumbers(values: number[]): number[] {
  return values.filter((v) => typeof v === "number" && Number.isFinite(v));
}

/**
 * Calculate the p-th percentile of a numeric array.
 * Supports both fractional percentiles (e.g., 0.95) and percentage integers (e.g., 95).
 * Filters non-finite values and safely clamps index boundaries.
 * Returns 0 for empty arrays.
 */
export function percentile(values: number[], p: number): number {
  const valid = extractFiniteNumbers(values);
  if (valid.length === 0) return 0;

  // Support integer percentages (e.g., 95 -> 0.95)
  const normalizedP = p > 1 && p <= 100 ? p / 100 : p;
  const clampedP = clamp(normalizedP, 0, 1);

  const sorted = valid.toSorted((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(clampedP * sorted.length) - 1));
  return sorted[index];
}

/**
 * Compute the arithmetic mean of numeric values.
 * Returns 0 for empty arrays.
 */
export function mean(values: number[]): number {
  const valid = extractFiniteNumbers(values);
  if (valid.length === 0) return 0;
  const sum = valid.reduce((acc, curr) => acc + curr, 0);
  return sum / valid.length;
}

/**
 * Compute the median (p50) of numeric values.
 * Returns 0 for empty arrays.
 */
export function median(values: number[]): number {
  const valid = extractFiniteNumbers(values);
  if (valid.length === 0) return 0;
  const sorted = valid.toSorted((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Compute the population standard deviation of numeric values.
 * Returns 0 for empty or single-element arrays.
 */
export function standardDeviation(values: number[]): number {
  const valid = extractFiniteNumbers(values);
  if (valid.length <= 1) return 0;
  const avg = mean(valid);
  const variance = valid.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / valid.length;
  return Math.sqrt(variance);
}

/**
 * Compute the interquartile range (IQR = p75 - p25).
 */
export function iqr(values: number[]): number {
  const valid = extractFiniteNumbers(values);
  if (valid.length === 0) return 0;
  return percentile(valid, 0.75) - percentile(valid, 0.25);
}

/**
 * Safely perform division with zero-division and non-finite value protection.
 * Returns fallback if denominator is 0, NaN, or non-finite.
 */
export function safeDivide(numerator: number, denominator: number, fallback: number = 0): number {
  if (
    typeof numerator !== "number" ||
    typeof denominator !== "number" ||
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator === 0
  ) {
    return fallback;
  }
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : fallback;
}

/**
 * Normalizes a raw token count into a non-negative integer.
 */
export function normalizeTokenCount(raw: unknown): number {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw < 0) return 0;
    return Math.floor(raw);
  }
  if (typeof raw === "string") {
    const parsed = parseInt(raw.trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }
  return 0;
}

export interface ModelPricing {
  inputCostPerMillion?: number;
  outputCostPerMillion?: number;
  totalCostPerMillion?: number;
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface ComputedCost {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  costPerInputToken: number;
  costPerOutputToken: number;
  costPerTotalToken: number;
}

/**
 * Calculate cost per thousand tokens safely.
 */
export function calculateCostPerThousand(cost: number, tokens: number): number {
  const normalizedTokens = normalizeTokenCount(tokens);
  if (normalizedTokens === 0) return 0;
  return (safeDivide(cost, normalizedTokens, 0) * 1000);
}

/**
 * Compute detailed token costs from token usage and model pricing per million tokens.
 * Handles missing rates, negative tokens, and zero rates safely.
 */
export function computeTokenCosts(
  usage?: TokenUsage | null,
  pricing?: ModelPricing | null
): ComputedCost {
  const inputTokens = normalizeTokenCount(usage?.inputTokens);
  const outputTokens = normalizeTokenCount(usage?.outputTokens);
  const totalTokens = usage?.totalTokens !== undefined
    ? normalizeTokenCount(usage.totalTokens)
    : inputTokens + outputTokens;

  const inputRate = typeof pricing?.inputCostPerMillion === "number" && Number.isFinite(pricing.inputCostPerMillion)
    ? Math.max(0, pricing.inputCostPerMillion)
    : 0;

  const outputRate = typeof pricing?.outputCostPerMillion === "number" && Number.isFinite(pricing.outputCostPerMillion)
    ? Math.max(0, pricing.outputCostPerMillion)
    : 0;

  const inputCost = (inputTokens * inputRate) / 1_000_000;
  const outputCost = (outputTokens * outputRate) / 1_000_000;

  const totalRate = typeof pricing?.totalCostPerMillion === "number" && Number.isFinite(pricing.totalCostPerMillion)
    ? Math.max(0, pricing.totalCostPerMillion)
    : null;

  const totalCost = totalRate !== null
    ? (totalTokens * totalRate) / 1_000_000
    : inputCost + outputCost;

  return {
    inputCost,
    outputCost,
    totalCost,
    costPerInputToken: safeDivide(inputCost, inputTokens, 0),
    costPerOutputToken: safeDivide(outputCost, outputTokens, 0),
    costPerTotalToken: safeDivide(totalCost, totalTokens, 0),
  };
}

