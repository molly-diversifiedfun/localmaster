import type { AnalysisReport } from "@shared/types";

interface Flag {
  active: boolean;
  label: string;
}

function buildFlags(analysis: AnalysisReport): Flag[] {
  return [
    {
      active: analysis.has_clipping,
      label: `Clipping (${analysis.clipped_regions} regions)`,
    },
    { active: analysis.has_dc_offset, label: "DC offset" },
    { active: analysis.has_excessive_sub_bass, label: "Excessive sub-bass" },
    { active: analysis.has_harshness, label: "Harshness (2.5-6kHz)" },
    {
      active: analysis.has_stereo_imbalance,
      label: `Stereo imbalance (${analysis.stereo_imbalance_db.toFixed(1)} dB)`,
    },
  ];
}

interface IssueFlagsProps {
  analysis: AnalysisReport;
}

/** Lists detected issue flags from an AnalysisReport; shows a clean-bill message if none fire. */
export function IssueFlags({ analysis }: IssueFlagsProps) {
  const flags = buildFlags(analysis).filter((f) => f.active);

  if (flags.length === 0) {
    return (
      <p className="text-sm text-brand" data-testid="issue-flags-clean">
        No issues detected.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1" data-testid="issue-flags-list">
      {flags.map((flag) => (
        <li key={flag.label} className="text-sm text-error">
          {flag.label}
        </li>
      ))}
    </ul>
  );
}
