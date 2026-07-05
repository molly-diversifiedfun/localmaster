import type { BitDepth, ExportJobResult } from "@shared/types";
import { JobProgress } from "./JobProgress";
import { DjChecklist } from "./DjChecklist";

const BIT_DEPTHS: BitDepth[] = [16, 24, 32];

interface ExportBarProps {
  outDir: string | null;
  onPickOutDir: () => void;
  bitDepth: BitDepth;
  onBitDepthChange: (depth: BitDepth) => void;
  onExport: () => void;
  isExporting: boolean;
  progress: number;
  stage: string | null;
  error: string | null;
  result: ExportJobResult | null;
  onReveal: (outPath: string) => void;
  onOpenJson: (path: string) => void;
  onOpenTxt: (path: string) => void;
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
  onExport,
  isExporting,
  progress,
  stage,
  error,
  result,
  onReveal,
  onOpenJson,
  onOpenTxt,
}: ExportBarProps) {
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
          </div>
        </div>
      )}

      {error && (
        <p className="px-6 pt-3 text-sm text-error" data-testid="export-error">
          {error}
        </p>
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
          disabled={!outDir || isExporting}
          className="rounded-md bg-brand px-5 py-2.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
        >
          Export {bitDepth}-bit WAV
        </button>
      </div>
    </div>
  );
}
