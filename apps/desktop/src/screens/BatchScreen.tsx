import { useEffect, useState } from "react";
import { useAppState } from "../state/app-state";
import { getPresets, masterAndWait, exportAndWait, ApiError } from "../lib/api";
import { pickWavFiles, pickDirectory } from "../lib/tauri";
import { PresetSelector } from "../components/PresetSelector";
import { basename } from "../lib/format";
import type { BitDepth, ExportChecklist } from "@shared/types";

type TrackStatus = "pending" | "mastering" | "exporting" | "done" | "error";

interface TrackRow {
  path: string;
  status: TrackStatus;
  checklist: ExportChecklist | null;
  error: string | null;
}

const BIT_DEPTHS: BitDepth[] = [16, 24, 32];

/** Batch/Album screen: sequential per-track master+export against a shared preset (no batch API endpoint in v1). */
export function BatchScreen() {
  const { presets, setPresets, selectedPresetId, setSelectedPresetId } =
    useAppState();
  const [tracks, setTracks] = useState<TrackRow[]>([]);
  const [outDir, setOutDir] = useState<string | null>(null);
  const [bitDepth, setBitDepth] = useState<BitDepth>(24);
  const [isRunning, setIsRunning] = useState(false);

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
    const paths = await pickWavFiles();
    setTracks(
      paths.map((path) => ({
        path,
        status: "pending",
        checklist: null,
        error: null,
      })),
    );
  }

  async function handlePickOutDir() {
    const dir = await pickDirectory();
    if (dir) setOutDir(dir);
  }

  function updateTrack(path: string, patch: Partial<TrackRow>) {
    setTracks((rows) =>
      rows.map((row) => (row.path === path ? { ...row, ...patch } : row)),
    );
  }

  async function handleRunBatch() {
    if (!selectedPresetId || !outDir || tracks.length === 0) return;
    setIsRunning(true);
    for (const track of tracks) {
      updateTrack(track.path, { status: "mastering", error: null });
      try {
        await masterAndWait({ path: track.path, preset_id: selectedPresetId });
        updateTrack(track.path, { status: "exporting" });
        const result = await exportAndWait({
          path: track.path,
          preset_id: selectedPresetId,
          out_dir: outDir,
          bit_depth: bitDepth,
        });
        updateTrack(track.path, {
          status: "done",
          checklist: result.checklist,
        });
      } catch (err) {
        updateTrack(track.path, {
          status: "error",
          error: err instanceof ApiError ? err.message : "Failed.",
        });
      }
    }
    setIsRunning(false);
  }

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

      {tracks.length > 0 && (
        <table
          className="w-full text-left text-sm"
          data-testid="batch-summary-table"
        >
          <thead className="text-studio-text-dim">
            <tr>
              <th className="pb-2">Track</th>
              <th className="pb-2">Status</th>
              <th className="pb-2">Checklist</th>
            </tr>
          </thead>
          <tbody>
            {tracks.map((track) => (
              <tr key={track.path} className="border-t border-studio-border">
                <td className="py-2 pr-4">{basename(track.path)}</td>
                <td className="py-2 pr-4">
                  {track.status === "error"
                    ? `Error: ${track.error}`
                    : track.status}
                </td>
                <td className="py-2">
                  {(track.checklist &&
                    Object.entries(track.checklist)
                      .filter(([, ok]) => !ok)
                      .map(([key]) => key)
                      .join(", ")) ||
                    (track.checklist ? "All checks passed" : "--")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <button
        type="button"
        onClick={handleRunBatch}
        disabled={
          !selectedPresetId || !outDir || tracks.length === 0 || isRunning
        }
        className="w-fit rounded bg-studio-accent px-4 py-2 text-sm font-medium text-studio-bg hover:opacity-90 disabled:opacity-50"
      >
        Run batch
      </button>
    </div>
  );
}
