import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppState } from "../state/app-state";
import { getPresets, masterAndWait, ApiError } from "../lib/api";
import { PresetSelector } from "../components/PresetSelector";
import { PresetControlsPanel } from "../components/PresetControlsPanel";
import { WaveformCanvas } from "../components/WaveformCanvas";
import { LoudnessMeter } from "../components/LoudnessMeter";
import { JobProgress } from "../components/JobProgress";
import { useAbPlayback } from "../hooks/useAbPlayback";
import { basename } from "../lib/format";
import type { JobStateResponse } from "@shared/types";

type RenderStatus = "idle" | "queued" | "running" | "done" | "error";

/** The core Mastering Workspace: preset selection, live render, and volume-matched A/B. */
export function WorkspaceScreen() {
  const navigate = useNavigate();
  const {
    currentPath,
    analysis,
    presets,
    setPresets,
    selectedPresetId,
    setSelectedPresetId,
    overrides,
    setOverrides,
    masterResult,
    setMasterResult,
  } = useAppState();

  const [renderStatus, setRenderStatus] = useState<RenderStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  const ab = useAbPlayback(
    currentPath,
    masterResult?.preview_path ?? null,
    masterResult?.ab_gain_db ?? 0,
  );

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

  function handleSelectPreset(presetId: string) {
    setSelectedPresetId(presetId);
    setOverrides({});
    setMasterResult(null);
  }

  async function handleRender() {
    if (!currentPath || !selectedPresetId) return;
    setRenderStatus("queued");
    setRenderError(null);
    setMasterResult(null);
    try {
      const result = await masterAndWait(
        { path: currentPath, preset_id: selectedPresetId, overrides },
        {
          onProgress: (state: JobStateResponse<unknown>) => {
            setRenderStatus(state.status === "queued" ? "queued" : "running");
            setProgress(state.progress);
            setStage(state.stage);
          },
        },
      );
      setMasterResult(result);
      setRenderStatus("done");
    } catch (err) {
      setRenderStatus("error");
      setRenderError(err instanceof ApiError ? err.message : "Render failed.");
    }
  }

  const selectedPreset = presets.find((p) => p.id === selectedPresetId) ?? null;

  if (!currentPath || !analysis) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-studio-text-dim">
          Analyze a track before mastering it.
        </p>
        <button
          type="button"
          onClick={() => navigate(currentPath ? "/analysis" : "/")}
          className="w-fit rounded bg-studio-panel-raised px-3 py-1.5 text-sm hover:text-studio-accent"
        >
          {currentPath ? "Go to Analysis" : "Go to Import"}
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[220px_1fr_260px] gap-6">
      <div>
        <h2 className="mb-2 text-sm font-medium text-studio-text-dim">Track</h2>
        <p className="mb-4 truncate text-sm" title={currentPath}>
          {basename(currentPath)}
        </p>
        <h2 className="mb-2 text-sm font-medium text-studio-text-dim">
          Preset
        </h2>
        <PresetSelector
          presets={presets}
          selectedPresetId={selectedPresetId}
          onSelect={handleSelectPreset}
        />
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <p className="mb-1 text-xs text-studio-text-dim">Original</p>
          <WaveformCanvas bins={analysis.waveform_overview} height={64} />
        </div>
        <div>
          <p className="mb-1 text-xs text-studio-text-dim">Master preview</p>
          <WaveformCanvas
            bins={masterResult?.output_analysis.waveform_overview ?? []}
            color="#f2b84b"
            height={64}
          />
        </div>

        {masterResult && (
          <div className="grid grid-cols-2 gap-4">
            <LoudnessMeter
              label="Master LUFS"
              value={masterResult.output_analysis.integrated_lufs}
              unit="LUFS"
              min={-40}
              max={0}
              targetValue={selectedPreset?.target_lufs}
            />
            <LoudnessMeter
              label="Master True Peak"
              value={masterResult.output_analysis.true_peak_dbtp}
              unit="dBTP"
              min={-20}
              max={2}
              targetValue={selectedPreset?.ceiling_dbtp}
            />
          </div>
        )}

        <button
          type="button"
          onClick={handleRender}
          disabled={
            !selectedPresetId ||
            renderStatus === "queued" ||
            renderStatus === "running"
          }
          className="w-fit rounded bg-studio-accent px-4 py-2 text-sm font-medium text-studio-bg hover:opacity-90 disabled:opacity-50"
        >
          Render master
        </button>

        {masterResult && (
          <div className="flex items-center gap-3" data-testid="ab-controls">
            <button
              type="button"
              onClick={() => (ab.isPlaying ? ab.pause() : ab.play())}
              className="rounded bg-studio-panel-raised px-3 py-1.5 text-sm hover:text-studio-accent"
            >
              {ab.isPlaying ? "Pause" : "Play"}
            </button>
            <button
              type="button"
              onClick={ab.toggleSide}
              className="rounded bg-studio-panel-raised px-3 py-1.5 text-sm hover:text-studio-accent"
            >
              A/B: {ab.activeSide === "master" ? "Master" : "Original"} (click
              to switch)
            </button>
          </div>
        )}

        <JobProgress
          status={renderStatus}
          progress={progress}
          stage={stage}
          errorMessage={renderError}
        />

        {masterResult && masterResult.warnings.length > 0 && (
          <ul className="flex flex-col gap-1" data-testid="warnings-list">
            {masterResult.warnings.map((warning) => (
              <li key={warning} className="text-sm text-studio-warn">
                {warning}
              </li>
            ))}
          </ul>
        )}

        {masterResult && (
          <button
            type="button"
            onClick={() => navigate("/export")}
            className="w-fit rounded bg-studio-accent px-4 py-2 text-sm font-medium text-studio-bg hover:opacity-90"
          >
            Continue to Export
          </button>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-studio-text-dim">
          Controls
        </h2>
        {selectedPreset && (
          <PresetControlsPanel
            preset={selectedPreset}
            overrides={overrides}
            onChange={setOverrides}
          />
        )}
      </div>
    </div>
  );
}
