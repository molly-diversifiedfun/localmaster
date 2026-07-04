import { describe, expect, it } from "vitest";
import {
  computeAbGainPlan,
  computeSideGains,
  dbToLinear,
  linearToDb,
} from "./ab-gain";

describe("dbToLinear / linearToDb", () => {
  it("converts 0 dB to unity gain", () => {
    expect(dbToLinear(0)).toBeCloseTo(1, 6);
  });

  it("converts -6 dB to roughly half amplitude", () => {
    expect(dbToLinear(-6)).toBeCloseTo(0.5012, 3);
  });

  it("round-trips linear <-> dB", () => {
    expect(linearToDb(dbToLinear(-9.5))).toBeCloseTo(-9.5, 6);
  });

  it("treats non-positive linear values as silence", () => {
    expect(linearToDb(0)).toBeLessThan(-100);
    expect(linearToDb(-1)).toBeLessThan(-100);
  });
});

describe("computeAbGainPlan", () => {
  it("keeps the original at unity gain", () => {
    expect(computeAbGainPlan(-3).originalGain).toBe(1);
  });

  it("attenuates the master by the engine's ab_gain_db", () => {
    const plan = computeAbGainPlan(-6);
    expect(plan.masterGain).toBeCloseTo(dbToLinear(-6), 6);
  });

  it("never boosts the master, even if ab_gain_db is positive (contract violation)", () => {
    const plan = computeAbGainPlan(3);
    expect(plan.masterGain).toBeLessThanOrEqual(1);
    expect(plan.masterGain).toBeCloseTo(1, 6);
  });

  it("silences the master fully at a large negative gain", () => {
    const plan = computeAbGainPlan(-1000);
    expect(plan.masterGain).toBe(0);
  });
});

describe("computeSideGains", () => {
  it("mutes the master and plays the original at unity when original is active", () => {
    const gains = computeSideGains("original", -4.5);
    expect(gains.originalGain).toBe(1);
    expect(gains.masterGain).toBe(0);
  });

  it("mutes the original and plays the master at the volume-matched gain when master is active", () => {
    const gains = computeSideGains("master", -4.5);
    expect(gains.originalGain).toBe(0);
    expect(gains.masterGain).toBeCloseTo(dbToLinear(-4.5), 6);
  });

  it("applies the gain to the correct side for both sides from the same ab_gain_db", () => {
    const abGainDb = -2.75;
    const original = computeSideGains("original", abGainDb);
    const master = computeSideGains("master", abGainDb);
    // Exactly one side is audible at a time.
    expect(original.masterGain).toBe(0);
    expect(master.originalGain).toBe(0);
    expect(original.originalGain).toBeGreaterThan(0);
    expect(master.masterGain).toBeGreaterThan(0);
  });
});
