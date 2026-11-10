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
