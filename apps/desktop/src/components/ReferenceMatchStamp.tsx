import type { ReferenceMatchStageMeta, StageMeta } from "@shared/types";
import { MatrixStamp } from "./MatrixStamp";
import { formatDb } from "../lib/format";

interface ReferenceMatchStampProps {
  stageMeta: StageMeta[];
  /** True for two beats after a fresh render result — passed straight to MatrixStamp. */
  fresh?: boolean;
}

/** The engine reports band deltas as a label->dB record (e.g. `{"63hz": -13.7}`), not an array. */
function isBandDeltaRecord(value: unknown): value is Record<string, number> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((v) => typeof v === "number")
  );
}

/** Validates shape, not just `stage`, so a malformed entry degrades to rendering nothing. */
function isReferenceMatchStageMeta(
  meta: StageMeta,
): meta is ReferenceMatchStageMeta {
  return (
    meta.stage === "reference_match" &&
    typeof meta.strength === "number" &&
    isBandDeltaRecord(meta.mid_band_deltas_db) &&
    isBandDeltaRecord(meta.side_band_deltas_db)
  );
}

/** Renders in the record's own key order (the engine's band order), e.g. "63hz -13.7 dB". */
function formatBandDeltas(bands: Record<string, number>): string {
  return Object.entries(bands)
    .map(([label, value]) => `${label} ${formatDb(value)}`)
    .join(" ");
}

/**
 * Renders the reference_match stage-meta deltas (strength + mid/side band
 * shifts) after a master rendered with a reference. Nothing to show when no
 * reference was used, so it renders nothing rather than an empty shell.
 */
export function ReferenceMatchStamp({
  stageMeta,
  fresh = false,
}: ReferenceMatchStampProps) {
  const match = stageMeta.find(isReferenceMatchStageMeta);
  if (!match) return null;

  const percent = Math.round(match.strength * 100);

  return (
    <div className="flex flex-col gap-1" data-testid="reference-match-stamp">
      <p className="text-xs uppercase tracking-wide text-text-secondary">
        Reference match · {percent}%
      </p>
      <MatrixStamp
        values={[
          `Mid ${formatBandDeltas(match.mid_band_deltas_db)}`,
          `Side ${formatBandDeltas(match.side_band_deltas_db)}`,
        ]}
        fresh={fresh}
      />
    </div>
  );
}
