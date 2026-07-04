/**
 * Volume-matched A/B math. The engine returns `ab_gain_db` (always <= 0):
 * the amount to ADD to the mastered signal's playback gain so it matches
 * the original's perceived loudness — louder should never win an A/B.
 */

const MIN_DB_FOR_SILENCE = -1000;

export function dbToLinear(db: number): number {
  if (db <= MIN_DB_FOR_SILENCE) return 0;
  return 10 ** (db / 20);
}

export function linearToDb(linear: number): number {
  if (linear <= 0) return MIN_DB_FOR_SILENCE;
  return 20 * Math.log10(linear);
}

export type AbSide = "original" | "master";

export interface AbGainPlan {
  originalGain: number;
  masterGain: number;
}

/**
 * Original always plays at unity gain. The master side is attenuated by
 * `abGainDb` (expected <= 0) so neither side is louder than the other.
 * A positive `abGainDb` (contract violation) is clamped to 0 rather than
 * trusted, since boosting the master would defeat the volume-match guarantee.
 */
export function computeAbGainPlan(abGainDb: number): AbGainPlan {
  const safeGainDb = Math.min(abGainDb, 0);
  return {
    originalGain: 1,
    masterGain: dbToLinear(safeGainDb),
  };
}

/**
 * Both sides keep running in lockstep (see useAbPlayback) so switching A/B
 * never loses playback position; only the inactive side's GainNode is
 * silenced. This is the volume-matched gain pair actually applied to the
 * two GainNodes for a given active side.
 */
export function computeSideGains(
  activeSide: AbSide,
  abGainDb: number,
): AbGainPlan {
  const plan = computeAbGainPlan(abGainDb);
  return activeSide === "original"
    ? { originalGain: plan.originalGain, masterGain: 0 }
    : { originalGain: 0, masterGain: plan.masterGain };
}
