import { useEffect, useState } from "react";
import { useAppState } from "../state/app-state";
import { getPresets, batchAndWait, ApiError } from "../lib/api";
import { pickWavFiles, pickDirectory } from "../lib/tauri";
import { PresetSelector } from "../components/PresetSelector";
import { JobProgress } from "../components/JobProgress";
import { basename } from "../lib/format";
import type { BatchJobResult, BitDepth } from "@shared/types";

type BatchStatus = "idle" | "queued" | "running" | "done" | "error";

const BIT_DEPTHS: BitDepth[] = [16, 24, 32];

/** Batch/Album screen: one POST /batch job (two-pass shared-target loudness) across all selected tracks. */
export function BatchScreen() {
  const { presets, setPresets, selectedPresetId, setSelectedPresetId } =
    useAppState();
  const [paths, setPaths] = useState<string[]>([]);
  const [outDir, setOutDir] = useState<string | null>(null);
  const [bitDepth, setBitDepth] = useState<BitDepth>(24);

  const [status, setStatus] = useState<BatchStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BatchJobResult | null>(null);

  useEffect(() => {
    if (presets.length > 0) return;
    getPresets()
      .then((res) => {
        setPresets(res.presets);
        if (!selectedPresetId && res.presets[0])
          setSelectedPresetId(res.presets[0].id);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handlePickFiles() {
    const selected = await pickWavFiles();
    setPaths(selected);
    setResult(null);
    setStatus("idle");
  }

  async function handlePickOutDir() {
    const dir = await pickDirectory();
    if (dir) setOutDir(dir);
  }

  async function handleRunBatch() {
    if (!selectedPresetId || !outDir || paths.length === 0) return;
    setStatus("queued");
    setError(null);
    setResult(null);
    try {
      const batchResult = await batchAndWait(
        {
          paths,
          preset_id: selectedPresetId,
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
      setResult(batchResult);
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(err instanceof ApiError ? err.message : "Batch failed.");
    }
  }

  const isRunning = status === "queued" || status === "running";

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <h1 className="text-xl font-semibold">Batch / Album</h1>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handlePickFiles}
          className="w-fit rounded bg-studio-panel-raised px-3 py-1.5 text-sm hover:text-studio-accent"
        >
          Choose WAV files…
        </button>
        <button
          type="button"
          onClick={handlePickOutDir}
          className="w-fit rounded bg-studio-panel-raised px-3 py-1.5 text-sm hover:text-studio-accent"
        >
          {outDir ? `Output: ${outDir}` : "Choose output folder…"}
        </button>
        <select
          value={bitDepth}
          onChange={(e) => setBitDepth(Number(e.target.value) as BitDepth)}
          className="rounded border border-studio-border bg-studio-panel-raised px-2 py-1 text-sm"
        >
          {BIT_DEPTHS.map((depth) => (
            <option key={depth} value={depth}>
              {depth}-bit
            </option>
          ))}
        </select>
      </div>

      <div className="w-64">
        <PresetSelector
          presets={presets}
          selectedPresetId={selectedPresetId}
          onSelect={setSelectedPresetId}
        />
      </div>

      {paths.length > 0 && !result && (
        <ul
          className="flex flex-col gap-1 text-sm text-studio-text-dim"
          data-testid="batch-file-list"
        >
          {paths.map((path) => (
            <li key={path}>{basename(path)}</li>
          ))}
        </ul>
      )}

      <JobProgress
        status={status}
        progress={progress}
        stage={stage}
        errorMessage={error}
      />

      {result && (
        <div className="flex flex-col gap-3">
          <p
            className="text-sm text-studio-accent"
            data-testid="shared-target-headline"
          >
            Album matched to {result.shared_target_lufs.toFixed(1)} LUFS
          </p>

          {result.warnings.length > 0 && (
            <ul
              className="flex flex-col gap-1"
              data-testid="batch-warnings-list"
            >
              {result.warnings.map((warning) => (
                <li key={warning} className="text-sm text-studio-warn">
                  {warning}
                </li>
              ))}
            </ul>
          )}

          <table
            className="w-full text-left text-sm"
            data-testid="batch-summary-table"
          >
            <thead className="text-studio-text-dim">
              <tr>
                <th className="pb-2">Track</th>
                <th className="pb-2">Checklist</th>
              </tr>
            </thead>
            <tbody>
              {result.exports.map((exportResult, i) => {
                const path = paths[i] ?? exportResult.out_path;
                const failedChecks = Object.entries(
                  exportResult.checklist,
                ).filter(([, ok]) => !ok);
                return (
                  <tr key={path} className="border-t border-studio-border">
                    <td className="py-2 pr-4">{basename(path)}</td>
                    <td className="py-2">
                      {failedChecks.length === 0
                        ? "All checks passed"
                        : failedChecks.map(([key]) => key).join(", ")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <button
        type="button"
        onClick={handleRunBatch}
        disabled={
          !selectedPresetId || !outDir || paths.length === 0 || isRunning
        }
        className="w-fit rounded bg-studio-accent px-4 py-2 text-sm font-medium text-studio-bg hover:opacity-90 disabled:opacity-50"
      >
        Run batch
      </button>
    </div>
  );
}
