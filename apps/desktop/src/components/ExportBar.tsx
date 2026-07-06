import type {
  BitDepth,
  ExportJobResult,
  ExportProfile,
  TrackMetadata,
} from "@shared/types";
import { JobProgress } from "./JobProgress";
import { DjChecklist } from "./DjChecklist";
import { TrackMetadataForm, isTrackMetadataValid } from "./TrackMetadataForm";

const BIT_DEPTHS: BitDepth[] = [16, 24, 32];

/**
 * Distribute is gated on whether a metadata.json sidecar actually exists,
 * NOT on the checklist shape -- `profile` and `metadata` are independent
 * request fields (api-contract.md), so a release-profile export with no
 * metadata would otherwise show Distribute against a bundle with nothing
 * for a plugin to read.
 */
function hasDistributableBundle(result: ExportJobResult): boolean {
  return result.metadata_path != null;
}

interface ExportBarProps {
  outDir: string | null;
  onPickOutDir: () => void;
  bitDepth: BitDepth;
  onBitDepthChange: (depth: BitDepth) => void;
  profile: ExportProfile;
  onProfileChange: (profile: ExportProfile) => void;
  metadata: TrackMetadata;
  onMetadataChange: (metadata: TrackMetadata) => void;
  onExport: () => void;
  isExporting: boolean;
  progress: number;
  stage: string | null;
  error: string | null;
  result: ExportJobResult | null;
  onReveal: (outPath: string) => void;
  onOpenJson: (path: string) => void;
  onOpenTxt: (path: string) => void;
  /** Invokes the local distribute plugin (ADR 003) against the just-written bundle dir. */
  onDistribute: () => void;
  isDistributing: boolean;
  distributeError: string | null;
}

/**
 * Pinned bottom bar, present once a master exists. On success it expands
 * upward to show the DJ readiness checklist (matrix-stamp motif), the
 * output path, and "Reveal in Finder".
 */
export function ExportBar({
  outDir,
  onPickOutDir,
  bitDepth,
  onBitDepthChange,
  profile,
  onProfileChange,
  metadata,
  onMetadataChange,
  onExport,
  isExporting,
  progress,
  stage,
  error,
  result,
  onReveal,
  onOpenJson,
  onOpenTxt,
  onDistribute,
  isDistributing,
  distributeError,
}: ExportBarProps) {
  const releaseBlocked =
    profile === "release" && !isTrackMetadataValid(metadata);

  return (
    <div className="border-t border-border bg-surface" data-testid="export-bar">
      {result && (
        <div
          className="flex flex-col gap-3 border-b border-border px-6 py-4"
          data-testid="export-success"
        >
          <DjChecklist checklist={result.checklist} />
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <span
              className="truncate font-mono text-text-secondary"
              title={result.out_path}
            >
              {result.out_path}
            </span>
            <button
              type="button"
              onClick={() => onReveal(result.out_path)}
              className="text-brand underline"
            >
              Reveal in Finder
            </button>
            <button
              type="button"
              onClick={() => onOpenJson(result.json_report_path)}
              className="text-text-secondary underline hover:text-text"
            >
              JSON report
            </button>
            <button
              type="button"
              onClick={() => onOpenTxt(result.txt_report_path)}
              className="text-text-secondary underline hover:text-text"
            >
              TXT report
            </button>
            {hasDistributableBundle(result) && (
              <button
                type="button"
                data-testid="distribute-button"
                onClick={onDistribute}
                disabled={isDistributing}
                className="text-brand underline disabled:opacity-50"
              >
                {isDistributing ? "Distributing…" : "Distribute…"}
              </button>
            )}
          </div>
          {distributeError && (
            <p className="text-xs text-error" data-testid="distribute-error">
              {distributeError}
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="px-6 pt-3 text-sm text-error" data-testid="export-error">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4 px-6 pt-4">
        <fieldset
          className="flex items-center gap-3 text-sm"
          data-testid="export-profile-toggle"
        >
          <legend className="sr-only">Export profile</legend>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="export-profile"
              value="dj"
              checked={profile === "dj"}
              onChange={() => onProfileChange("dj")}
            />
            <span className="text-text-secondary">DJ</span>
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="export-profile"
              value="release"
              checked={profile === "release"}
              onChange={() => onProfileChange("release")}
            />
            <span className="text-text-secondary">Release</span>
          </label>
        </fieldset>
      </div>

      {profile === "release" && (
        <div className="px-6 pb-2 pt-2">
          <TrackMetadataForm metadata={metadata} onChange={onMetadataChange} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4 px-6 py-4">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-text-secondary">Bit depth</span>
          <select
            value={bitDepth}
            onChange={(e) =>
              onBitDepthChange(Number(e.target.value) as BitDepth)
            }
            className="rounded-md border border-border bg-background px-2 py-1 font-mono text-xs text-text"
          >
            {BIT_DEPTHS.map((depth) => (
              <option key={depth} value={depth}>
                {depth}-bit
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={onPickOutDir}
          className="max-w-xs truncate rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:text-text"
          title={outDir ?? undefined}
        >
          {outDir ? outDir : "Choose destination…"}
        </button>

        <div className="flex-1" />

        {isExporting && (
          <div className="w-48">
            <JobProgress status="running" progress={progress} stage={stage} />
          </div>
        )}

        <button
          type="button"
          onClick={onExport}
          disabled={!outDir || isExporting || releaseBlocked}
          className="rounded-md bg-brand px-5 py-2.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
        >
          Export {bitDepth}-bit WAV
        </button>
      </div>
    </div>
  );
}
