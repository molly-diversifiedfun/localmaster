import type { ExportChecklist, ReleaseChecklist } from "@shared/types";

type AnyChecklist = ExportChecklist | ReleaseChecklist;

const CHECKLIST_LABELS: Record<keyof ExportChecklist, string> = {
  no_clipping: "No clipping",
  peak_within_ceiling: "Peak within ceiling",
  loudness_within_tolerance: "Loudness within tolerance",
  valid_stereo: "Valid stereo image",
  export_succeeded: "Export succeeded",
  output_is_wav: "Output is WAV",
};

const RELEASE_ONLY_LABELS: Record<"accepted_streaming_specs", string> = {
  accepted_streaming_specs: "Accepted streaming specs",
};

const ALL_LABELS = { ...CHECKLIST_LABELS, ...RELEASE_ONLY_LABELS };

function isReleaseChecklist(
  checklist: AnyChecklist,
): checklist is ReleaseChecklist {
  return "accepted_streaming_specs" in checklist;
}

/**
 * DJ/Release readiness checklist, rendered in the matrix-stamp register:
 * mono, tracked, PASS/FAIL rows. The heading and the streaming-specs row
 * are derived from the checklist shape itself (a ReleaseChecklist carries
 * `accepted_streaming_specs`) rather than a separately-threaded profile
 * prop, so the label always reflects what the engine actually validated.
 */
export function DjChecklist({ checklist }: { checklist: AnyChecklist }) {
  const release = isReleaseChecklist(checklist);
  const keys = release
    ? ([
        ...Object.keys(CHECKLIST_LABELS),
        "accepted_streaming_specs",
      ] as (keyof AnyChecklist)[])
    : (Object.keys(CHECKLIST_LABELS) as (keyof AnyChecklist)[]);

  return (
    <div data-testid="dj-checklist">
      <p
        data-testid="checklist-heading"
        className="mb-1 font-mono text-xs uppercase tracking-wide text-text-secondary"
      >
        {release ? "Release readiness" : "DJ readiness"}
      </p>
      <ul className="flex flex-col gap-1">
        {keys.map((key) => (
          <li
            key={key as string}
            className={`font-mono text-xs uppercase tracking-wide ${
              checklist[key] ? "text-brand" : "text-error"
            }`}
          >
            {checklist[key] ? "PASS" : "FAIL"} ·{" "}
            {ALL_LABELS[key as keyof typeof ALL_LABELS]}
          </li>
        ))}
      </ul>
    </div>
  );
}
