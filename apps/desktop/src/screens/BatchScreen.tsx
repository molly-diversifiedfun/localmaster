import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAppState } from "../state/app-state";
import { getPresets, batchAndWait, ApiError } from "../lib/api";
import { pickWavFiles, pickDirectory } from "../lib/tauri";
import { PresetRow } from "../components/PresetRow";
import { JobProgress } from "../components/JobProgress";
import { DjChecklist } from "../components/DjChecklist";
import { AppShell } from "../components/AppShell";
import { getRailStatus, type RailStageId } from "../state/flow-state";
import { basename } from "../lib/format";
import type { BatchJobResult, BitDepth } from "@shared/types";

type BatchStatus = "idle" | "queued" | "running" | "done" | "error";

const BIT_DEPTHS: BitDepth[] = [16, 24, 32];
const DJ_DEFAULT_ID = "clean_dj";
const RAIL_IDS: RailStageId[] = ["import", "analyze", "master", "export"];
const RAIL_LABELS: Record<RailStageId, string> = {
  import: "Import",
  analyze: "Analyze",
  master: "Master",
  export: "Export",
};

interface BatchLocationState {
  paths?: string[];
}

/** Batch/album flow: one preset, one POST /batch job (two-pass shared-target loudness) across all selected tracks. */
export function BatchScreen() {
  const location = useLocation();
  const { presets, setPresets, selectedPresetId, setSelectedPresetId } =
    useAppState();
  const initialPaths =
    (location.state as BatchLocationState | null)?.paths ?? [];
  const [paths, setPaths] = useState<string[]>(initialPaths);
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
        const djDefault =
          res.presets.find((p) => p.id === DJ_DEFAULT_ID) ?? res.presets[0];
        if (!selectedPresetId && djDefault) setSelectedPresetId(djDefault.id);
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

  const flowStage =
    status === "done"
      ? "exported"
      : isRunning
        ? "exporting"
        : paths.length > 0
          ? "track"
          : "drop";
  const railStages = RAIL_IDS.map((id) => ({
    id,
    label: RAIL_LABELS[id],
    status: getRailStatus(flowStage, id),
  }));

  return (
    <AppShell stages={railStages}>
      <div
        className="mx-auto flex max-w-[1400px] flex-col gap-8 px-[clamp(1.5rem,4vw,3rem)] py-10"
        data-testid="batch-screen"
      >
        <h1 className="text-lg font-semibold">Master an album</h1>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handlePickFiles}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-secondary hover:text-text"
          >
            Choose WAV files…
          </button>
          <button
            type="button"
            onClick={handlePickOutDir}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-secondary hover:text-text"
          >
            {outDir ? `Output: ${outDir}` : "Choose output folder…"}
          </button>
          <select
            value={bitDepth}
            onChange={(e) => setBitDepth(Number(e.target.value) as BitDepth)}
            className="rounded-md border border-border bg-surface px-2 py-1 text-sm text-text"
          >
            {BIT_DEPTHS.map((depth) => (
              <option key={depth} value={depth}>
                {depth}-bit
              </option>
            ))}
          </select>
        </div>

        <PresetRow
          presets={presets}
          selectedPresetId={selectedPresetId}
          onSelect={setSelectedPresetId}
        />

        {paths.length > 0 && !result && (
          <ul
            className="flex flex-col gap-1 text-sm text-text-secondary"
            data-testid="batch-file-list"
          >
            {paths.map((path, i) => (
              <li key={`${path}-${i}`}>{basename(path)}</li>
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
          <div className="flex flex-col gap-4">
            <p
              className="font-mono text-sm uppercase tracking-wide text-brand"
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
                  <li key={warning} className="text-sm text-warning">
                    {warning}
                  </li>
                ))}
              </ul>
            )}

            <table
              className="w-full text-left text-sm"
              data-testid="batch-summary-table"
            >
              <thead className="text-text-secondary">
                <tr>
                  <th className="pb-2">Track</th>
                  <th className="pb-2">Checklist</th>
                </tr>
              </thead>
              <tbody>
                {result.exports.map((exportResult, i) => {
                  const path = paths[i] ?? exportResult.out_path;
                  return (
                    <tr key={`${path}-${i}`} className="border-t border-border">
                      <td className="py-2 pr-4 align-top">{basename(path)}</td>
                      <td className="py-2">
                        <DjChecklist checklist={exportResult.checklist} />
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
          className="w-fit rounded-md bg-brand px-6 py-3 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50"
        >
          Master album
        </button>
      </div>
    </AppShell>
  );
}
