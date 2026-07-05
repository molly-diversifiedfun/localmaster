import { useEffect, useReducer, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppState, DEFAULT_MATCH_STRENGTH } from "../state/app-state";
import {
  flowReducer,
  initialFlowState,
  deriveInitialStage,
  getRailStatus,
  type RailStageId,
} from "../state/flow-state";
import {
  analyzeAndWait,
  getPresets,
  masterAndWait,
  exportAndWait,
  ApiError,
} from "../lib/api";
import { pickDirectory, openInDefaultApp } from "../lib/tauri";
import { loadRecentFiles, addRecentFile } from "../lib/recent-files";
import { loadSettings } from "../lib/settings";
import { dirname } from "../lib/format";
import { useAbPlayback } from "../hooks/useAbPlayback";
import { AppShell } from "../components/AppShell";
import { DropSurface } from "../components/DropSurface";
import { TrackView } from "../components/TrackView";
import { ResultView } from "../components/ResultView";
import { ExportBar } from "../components/ExportBar";
import { JobProgress } from "../components/JobProgress";
import type { BitDepth, ExportJobResult, PresetOverrides } from "@shared/types";

const DJ_DEFAULT_ID = "clean_dj";
const RAIL_IDS: RailStageId[] = ["import", "analyze", "master", "export"];
const RAIL_LABELS: Record<RailStageId, string> = {
  import: "Import",
  analyze: "Analyze",
  master: "Master",
  export: "Export",
};

/**
 * The single-flow instrument: drop -> analyze -> track -> master -> result
 * -> export, all in one screen driven by the flow-state reducer. Replaces
 * the old HomeImport/Analysis/Workspace/Export screens.
 */
export function InstrumentScreen() {
  const navigate = useNavigate();
  const {
    currentPath,
    setCurrentPath,
    analysis,
    setAnalysis,
    presets,
    setPresets,
    selectedPresetId,
    setSelectedPresetId,
    overrides,
    setOverrides,
    referencePath,
    setReferencePath,
    matchStrength,
    setMatchStrength,
    masterResult,
    setMasterResult,
  } = useAppState();

  const [flow, dispatch] = useReducer(flowReducer, undefined, () => ({
    ...initialFlowState,
    stage: deriveInitialStage(!!analysis, !!masterResult),
  }));

  const [recentFiles, setRecentFiles] = useState<string[]>([]);
  const [overridesDirty, setOverridesDirty] = useState(false);
  const [referenceDirty, setReferenceDirty] = useState(false);
  const [exportResult, setExportResult] = useState<ExportJobResult | null>(
    null,
  );
  const [outDir, setOutDir] = useState<string | null>(
    () => loadSettings().defaultExportDir,
  );
  const [bitDepth, setBitDepth] = useState<BitDepth>(
    () => loadSettings().defaultBitDepth,
  );

  const ab = useAbPlayback(
    currentPath,
    masterResult?.preview_path ?? null,
    masterResult?.ab_gain_db ?? 0,
  );

  useEffect(() => {
    setRecentFiles(loadRecentFiles());
  }, []);

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

  function selectFiles(paths: string[]) {
    if (paths.length > 1) {
      navigate("/batch", { state: { paths } });
      return;
    }
    const path = paths[0];
    if (!path) return;
    setCurrentPath(path);
    setAnalysis(null);
    setMasterResult(null);
    setExportResult(null);
    setOverrides({});
    setOverridesDirty(false);
    setReferencePath(null);
    setMatchStrength(DEFAULT_MATCH_STRENGTH);
    setReferenceDirty(false);
    setRecentFiles(addRecentFile(path));
    dispatch({ type: "DROP_FILE" });
    runAnalysis(path);
  }

  async function runAnalysis(path: string) {
    try {
      const result = await analyzeAndWait(path);
      setAnalysis(result);
      dispatch({ type: "ANALYSIS_SUCCESS" });
    } catch (err) {
      dispatch({
        type: "ANALYSIS_ERROR",
        message: err instanceof ApiError ? err.message : "Analysis failed.",
      });
    }
  }

  function handleSelectPreset(presetId: string) {
    setSelectedPresetId(presetId);
    setOverrides({});
    setOverridesDirty(false);
  }

  function handleOverridesChange(next: PresetOverrides) {
    setOverrides(next);
    if (flow.stage === "result") setOverridesDirty(true);
  }

  function handleReferenceChange(path: string | null) {
    setReferencePath(path);
    if (flow.stage === "result") setReferenceDirty(true);
  }

  function handleStrengthChange(strength: number) {
    if (!referencePath) return; // defense-in-depth: control is also disabled
    setMatchStrength(strength);
    if (flow.stage === "result") setReferenceDirty(true);
  }

  /** Optional reference fields, spread into /master and /export bodies only when a reference is set. */
  function referenceFields() {
    return referencePath
      ? { reference_path: referencePath, match_strength: matchStrength }
      : {};
  }

  async function handleMaster() {
    if (!currentPath || !selectedPresetId) return;
    dispatch({ type: "START_MASTER" });
    try {
      const result = await masterAndWait(
        {
          path: currentPath,
          preset_id: selectedPresetId,
          overrides,
          ...referenceFields(),
        },
        {
          onProgress: (state) =>
            dispatch({
              type: "MASTER_PROGRESS",
              progress: state.progress,
              stageLabel: state.stage,
            }),
        },
      );
      setMasterResult(result);
      setExportResult(null); // the old export's checklist/paths no longer describe this master
      setOverridesDirty(false);
      setReferenceDirty(false);
      dispatch({ type: "MASTER_SUCCESS" });
    } catch (err) {
      dispatch({
        type: "MASTER_ERROR",
        message:
          err instanceof ApiError ? err.message : "Master render failed.",
        hadMasterResult: masterResult !== null,
      });
    }
  }

  async function handleExport() {
    if (!currentPath || !selectedPresetId || !outDir) return;
    dispatch({ type: "START_EXPORT" });
    try {
      const result = await exportAndWait(
        {
          path: currentPath,
          preset_id: selectedPresetId,
          overrides,
          ...referenceFields(),
          out_dir: outDir,
          bit_depth: bitDepth,
        },
        {
          onProgress: (state) =>
            dispatch({
              type: "EXPORT_PROGRESS",
              progress: state.progress,
              stageLabel: state.stage,
            }),
        },
      );
      setExportResult(result);
      dispatch({ type: "EXPORT_SUCCESS" });
    } catch (err) {
      dispatch({
        type: "EXPORT_ERROR",
        message: err instanceof ApiError ? err.message : "Export failed.",
      });
    }
  }

  function handleNewTrack() {
    setCurrentPath(null);
    setAnalysis(null);
    setMasterResult(null);
    setExportResult(null);
    setOverrides({});
    setOverridesDirty(false);
    setReferencePath(null);
    setMatchStrength(DEFAULT_MATCH_STRENGTH);
    setReferenceDirty(false);
    dispatch({ type: "RESET" });
  }

  const selectedPreset = presets.find((p) => p.id === selectedPresetId) ?? null;
  const hasMaster =
    flow.stage === "result" ||
    flow.stage === "exporting" ||
    flow.stage === "exported";

  const railStages = RAIL_IDS.map((id) => ({
    id,
    label: RAIL_LABELS[id],
    status: getRailStatus(flow.stage, id),
  }));

  return (
    <AppShell
      stages={railStages}
      footer={
        hasMaster && (
          <ExportBar
            outDir={outDir}
            onPickOutDir={async () => {
              const dir = await pickDirectory();
              if (dir) setOutDir(dir);
            }}
            bitDepth={bitDepth}
            onBitDepthChange={setBitDepth}
            onExport={handleExport}
            isExporting={flow.stage === "exporting"}
            progress={flow.progress}
            stage={flow.jobStageLabel}
            error={flow.errorSource === "export" ? flow.error : null}
            result={exportResult}
            onReveal={(outPath) => openInDefaultApp(dirname(outPath))}
            onOpenJson={openInDefaultApp}
            onOpenTxt={openInDefaultApp}
          />
        )
      }
    >
      {flow.stage === "drop" && (
        <DropSurface
          onFilesSelected={selectFiles}
          recentFiles={recentFiles}
          onSelectRecent={(path) => selectFiles([path])}
          error={flow.error}
        />
      )}

      {flow.stage === "analyzing" && currentPath && (
        <div
          className="flex h-full flex-col items-center justify-center gap-3"
          data-testid="analyzing-view"
        >
          <p className="text-sm text-text-secondary">
            Analyzing {currentPath.split(/[\\/]/).pop()}…
          </p>
        </div>
      )}

      {flow.stage === "track" && analysis && currentPath && (
        <TrackView
          path={currentPath}
          analysis={analysis}
          presets={presets}
          selectedPresetId={selectedPresetId}
          onSelectPreset={handleSelectPreset}
          onMaster={handleMaster}
          error={flow.error}
        />
      )}

      {flow.stage === "mastering" && (
        <div
          className="flex h-full flex-col items-center justify-center gap-4 px-12"
          data-testid="mastering-view"
        >
          <p className="text-sm text-text-secondary">
            Mastering with {selectedPreset?.name ?? "the selected preset"}…
          </p>
          <div className="w-full max-w-md">
            <JobProgress
              status="running"
              progress={flow.progress}
              stage={flow.jobStageLabel}
            />
          </div>
        </div>
      )}

      {hasMaster && masterResult && currentPath && (
        <ResultView
          path={currentPath}
          inputAnalysis={masterResult.input_analysis}
          outputAnalysis={masterResult.output_analysis}
          stageMeta={masterResult.stage_meta}
          warnings={masterResult.warnings}
          ab={ab}
          preset={selectedPreset}
          overrides={overrides}
          onOverridesChange={handleOverridesChange}
          overridesDirty={overridesDirty}
          referencePath={referencePath}
          matchStrength={matchStrength}
          onReferenceChange={handleReferenceChange}
          onStrengthChange={handleStrengthChange}
          referenceDirty={referenceDirty}
          onRemaster={handleMaster}
          onNewTrack={handleNewTrack}
          error={flow.errorSource === "master" ? flow.error : null}
        />
      )}
    </AppShell>
  );
}
