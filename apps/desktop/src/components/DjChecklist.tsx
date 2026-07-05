import type { ExportChecklist } from "@shared/types";

const CHECKLIST_LABELS: Record<keyof ExportChecklist, string> = {
  no_clipping: "No clipping",
  peak_within_ceiling: "Peak within ceiling",
  loudness_within_tolerance: "Loudness within tolerance",
  valid_stereo: "Valid stereo image",
  export_succeeded: "Export succeeded",
  output_is_wav: "Output is WAV",
};

/** DJ readiness checklist rendered in the matrix-stamp register: mono, tracked, PASS/FAIL rows. */
export function DjChecklist({ checklist }: { checklist: ExportChecklist }) {
  return (
    <ul className="flex flex-col gap-1" data-testid="dj-checklist">
      {(Object.keys(CHECKLIST_LABELS) as (keyof ExportChecklist)[]).map(
        (key) => (
          <li
            key={key}
            className={`font-mono text-xs uppercase tracking-wide ${
              checklist[key] ? "text-brand" : "text-error"
            }`}
          >
            {checklist[key] ? "PASS" : "FAIL"} · {CHECKLIST_LABELS[key]}
          </li>
        ),
      )}
    </ul>
  );
}
