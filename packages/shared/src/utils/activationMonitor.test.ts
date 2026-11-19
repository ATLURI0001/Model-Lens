import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { OnlineSubspaceMonitor } from "./activationMonitor.ts";

describe("OnlineSubspaceMonitor", () => {
  it("initializes with valid dimension and default rank", () => {
    const monitor = new OnlineSubspaceMonitor({ dimension: 4, rank: 2 });
    assert.equal(monitor.dimension, 4);
    assert.equal(monitor.rank, 2);
    assert.equal(monitor.sampleCount, 0);

    const initialMetrics = monitor.evaluateAlignment();
    assert.equal(initialMetrics.alignmentScore, 1.0);
    assert.equal(initialMetrics.isDriftDetected, false);
  });

  it("throws on invalid dimension or rank", () => {
    assert.throws(() => new OnlineSubspaceMonitor({ dimension: 0 }), /Dimension must be a positive integer/);
    assert.throws(() => new OnlineSubspaceMonitor({ dimension: -5 }), /Dimension must be a positive integer/);
  });

  it("safely ignores non-finite vectors without corrupting state", () => {
    const monitor = new OnlineSubspaceMonitor({ dimension: 3 });
    monitor.update([1.0, 2.0, 3.0]);
    assert.equal(monitor.sampleCount, 1);

    // Should be safely skipped
    monitor.update([NaN, 2.0, 3.0]);
    monitor.update([1.0, Infinity, 3.0]);
    monitor.update([1.0, 2.0, -Infinity]);
    assert.equal(monitor.sampleCount, 1);

    monitor.update([2.0, 3.0, 4.0]);
    assert.equal(monitor.sampleCount, 2);
  });

  it("throws when vector dimension mismatches", () => {
    const monitor = new OnlineSubspaceMonitor({ dimension: 3 });
    assert.throws(() => monitor.update([1.0, 2.0]), /Vector dimension mismatch/);
    assert.throws(() => monitor.update([1.0, 2.0, 3.0, 4.0]), /Vector dimension mismatch/);
  });

  it("calibrates reference subspace and measures high alignment for stationary distribution", () => {
    const monitor = new OnlineSubspaceMonitor({ dimension: 4, rank: 2, driftThreshold: 0.8 });

    // Stream 50 samples along x1 and x2 axes
    for (let i = 0; i < 50; i++) {
      const v = [
        Math.sin(i * 0.2) * 5.0,
        Math.cos(i * 0.2) * 3.0,
        (Math.random() - 0.5) * 0.1,
        (Math.random() - 0.5) * 0.1,
      ];
      monitor.update(v);
    }

    // First evaluation sets reference subspace
    const metrics1 = monitor.evaluateAlignment();
    assert.equal(metrics1.alignmentScore, 1.0);
    assert.equal(metrics1.isDriftDetected, false);

    // Stream 50 more samples from the identical stationary distribution
    for (let i = 50; i < 100; i++) {
      const v = [
        Math.sin(i * 0.2) * 5.0,
        Math.cos(i * 0.2) * 3.0,
        (Math.random() - 0.5) * 0.1,
        (Math.random() - 0.5) * 0.1,
      ];
      monitor.update(v);
    }

    const metrics2 = monitor.evaluateAlignment();
    assert.ok(metrics2.alignmentScore >= 0.85, `Expected alignment >= 0.85, got ${metrics2.alignmentScore}`);
    assert.equal(metrics2.isDriftDetected, false);
  });

  it("detects drift when distribution rotates into an orthogonal subspace", () => {
    const monitor = new OnlineSubspaceMonitor({ dimension: 4, rank: 2, driftThreshold: 0.8 });

    // Ingest reference distribution along dimensions 0 and 1
    for (let i = 0; i < 40; i++) {
      monitor.update([Math.sin(i), Math.cos(i), 0.0, 0.0]);
    }
    const cal = monitor.evaluateAlignment();
    assert.equal(cal.alignmentScore, 1.0);

    // Reset online observed state and ingest data along dimensions 2 and 3 (orthogonal)
    monitor.reset();
    for (let i = 0; i < 40; i++) {
      monitor.update([0.0, 0.0, Math.sin(i), Math.cos(i)]);
    }

    const driftMetrics = monitor.evaluateAlignment();
    assert.ok(driftMetrics.alignmentScore < 0.2, `Expected alignment < 0.2, got ${driftMetrics.alignmentScore}`);
    assert.equal(driftMetrics.isDriftDetected, true);
  });
});
