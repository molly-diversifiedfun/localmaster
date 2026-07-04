import { useState } from "react";
import { useAppState } from "../state/app-state";
import { exportAndWait, ApiError } from "../lib/api";
import { pickDirectory, openInDefaultApp } from "../lib/tauri";
import { loadSettings } from "../lib/settings";
import { JobProgress } from "../components/JobProgress";
import type { BitDepth, ExportJobResult } from "@shared/types";

const BIT_DEPTHS: BitDepth[] = [16, 24, 32];

const CHECKLIST_LABELS: Record<keyof ExportJobResult["checklist"], string> = {
  no_clipping: "No clipping",
  peak_within_ceiling: "Peak within ceiling",
  loudness_within_tolerance: "Loudness within tolerance",
  valid_stereo: "Valid stereo image",
  export_succeeded: "Export succeeded",
  output_is_wav: "Output is WAV",
};

/** Export screen: bit depth + destination, runs POST /export, shows the DJ readiness checklist. */
export function ExportScreen() {
  const { currentPath, selectedPresetId, overrides } = useAppState();
  const settings = loadSettings();
  const [outDir, setOutDir] = useState<string | null>(
    settings.defaultExportDir,
  );
  const [bitDepth, setBitDepth] = useState<BitDepth>(settings.defaultBitDepth);
  const [status, setStatus] = useState<
    "idle" | "queued" | "running" | "done" | "error"
  >("idle");
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExportJobResult | null>(null);

  async function handlePickOutDir() {
    const dir = await pickDirectory();
    if (dir) setOutDir(dir);
  }

  async function handleExport() {
    if (!currentPath || !selectedPresetId || !outDir) return;
    setStatus("queued");
    setError(null);
    setResult(null);
    try {
      const exportResult = await exportAndWait(
        {
          path: currentPath,
          preset_id: selectedPresetId,
          overrides,
          out_dir: outDir,
          bit_depth: bitDepth,
        },
        {
          onProgress: (state) => {
            setStatus(state.status === "queued" ? "queued" : "running");
            setProgress(state.progress);
            setStage(state.stage);
          },
        },
      );
      setResult(exportResult);
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(err instanceof ApiError ? err.message : "Export failed.");
    }
  }

  if (!currentPath || !selectedPresetId) {
    return (
      <p className="text-sm text-studio-text-dim">
        Render a master in the Workspace first.
      </p>
    );
  }

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="text-xl font-semibold">Export</h1>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-studio-text-dim">Bit depth</span>
        <select
          value={bitDepth}
          onChange={(e) => setBitDepth(Number(e.target.value) as BitDepth)}
          className="w-32 rounded border border-studio-border bg-studio-panel-raised px-2 py-1"
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
        onClick={handlePickOutDir}
        className="w-fit rounded bg-studio-panel-raised px-3 py-1.5 text-sm hover:text-studio-accent"
      >
        {outDir ? `Output: ${outDir}` : "Choose output folder…"}
      </button>

      <button
        type="button"
        onClick={handleExport}
        disabled={!outDir || status === "queued" || status === "running"}
        className="w-fit rounded bg-studio-accent px-4 py-2 text-sm font-medium text-studio-bg hover:opacity-90 disabled:opacity-50"
      >
        Export master
      </button>

      <JobProgress
        status={status}
        progress={progress}
        stage={stage}
        errorMessage={error}
      />

      {result && (
        <div className="flex flex-col gap-3" data-testid="export-result">
          <h2 className="text-sm font-medium text-studio-text-dim">
            DJ readiness checklist
          </h2>
          <ul className="flex flex-col gap-1 text-sm">
            {(
              Object.keys(
                CHECKLIST_LABELS,
              ) as (keyof ExportJobResult["checklist"])[]
            ).map((key) => (
              <li
                key={key}
                className={
                  result.checklist[key]
                    ? "text-studio-accent"
                    : "text-studio-danger"
                }
              >
                {result.checklist[key] ? "✓" : "✗"} {CHECKLIST_LABELS[key]}
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-1 text-sm">
            <button
              type="button"
              onClick={() => openInDefaultApp(result.out_path)}
              className="w-fit text-studio-accent underline"
            >
              Open exported WAV
            </button>
            <button
              type="button"
              onClick={() => openInDefaultApp(result.json_report_path)}
              className="w-fit text-studio-accent underline"
            >
              Open JSON report
            </button>
            <button
              type="button"
              onClick={() => openInDefaultApp(result.txt_report_path)}
              className="w-fit text-studio-accent underline"
            >
              Open TXT report
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
