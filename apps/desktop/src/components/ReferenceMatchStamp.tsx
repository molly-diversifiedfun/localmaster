import type { ReferenceMatchStageMeta, StageMeta } from "@shared/types";
import { MatrixStamp } from "./MatrixStamp";
import { formatDb } from "../lib/format";

interface ReferenceMatchStampProps {
  stageMeta: StageMeta[];
}

function isReferenceMatchStageMeta(
  meta: StageMeta,
): meta is ReferenceMatchStageMeta {
  return meta.stage === "reference_match";
}

function formatBandDeltas(values: number[]): string {
  return values.map(formatDb).join(" ");
}

/**
 * Renders the reference_match stage-meta deltas (strength + mid/side band
 * shifts) after a master rendered with a reference. Nothing to show when no
 * reference was used, so it renders nothing rather than an empty shell.
 */
export function ReferenceMatchStamp({ stageMeta }: ReferenceMatchStampProps) {
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
      />
    </div>
  );
}
