import type { AnalysisReport, Preset } from "@shared/types";
import { WaveformCanvas } from "./WaveformCanvas";
import { IssueFlags } from "./IssueFlags";
import { MatrixStamp } from "./MatrixStamp";
import { PresetRow } from "./PresetRow";
import { basename, formatDuration, matrixStampValues } from "../lib/format";

interface TrackViewProps {
  path: string;
  analysis: AnalysisReport;
  presets: Preset[];
  selectedPresetId: string | null;
  onSelectPreset: (id: string) => void;
  onMaster: () => void;
  error: string | null;
}

function buildSilenceNote(analysis: AnalysisReport): string | null {
  const parts: string[] = [];
  if (analysis.leading_silence_seconds > 0.5) {
    parts.push(
      `${analysis.leading_silence_seconds.toFixed(1)}s leading silence`,
    );
  }
  if (analysis.trailing_silence_seconds > 0.5) {
    parts.push(
      `${analysis.trailing_silence_seconds.toFixed(1)}s trailing silence`,
    );
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * TRACK stage: title, matrix stamp, waveform, issue flags, silence note,
 * preset cards, single primary CTA. Renders right after /analyze completes.
 */
export function TrackView({
  path,
  analysis,
  presets,
  selectedPresetId,
  onSelectPreset,
  onMaster,
  error,
}: TrackViewProps) {
  const silenceNote = buildSilenceNote(analysis);

  return (
    <div
      className="mx-auto flex max-w-[1400px] flex-col gap-8 px-[clamp(1.5rem,4vw,3rem)] py-10"
      data-testid="track-view"
    >
      <div>
        <h1 className="text-lg font-semibold">{basename(path)}</h1>
        <p className="mt-1 text-sm text-text-secondary">
          {formatDuration(analysis.duration_seconds)} ·{" "}
          {analysis.n_channels === 2 ? "Stereo" : "Mono"}
        </p>
        <MatrixStamp values={matrixStampValues(analysis)} className="mt-2" />
        {silenceNote && (
          <p className="mt-2 text-xs text-warning">{silenceNote}</p>
        )}
      </div>

      <WaveformCanvas bins={analysis.waveform_overview} height={120} />

      <IssueFlags analysis={analysis} />

      {error && (
        <p className="text-sm text-error" data-testid="track-error">
          {error}
        </p>
      )}

      <div>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-text-secondary">
          Preset
        </h2>
        <PresetRow
          presets={presets}
          selectedPresetId={selectedPresetId}
          onSelect={onSelectPreset}
        />
      </div>

      <button
        type="button"
        onClick={onMaster}
        disabled={!selectedPresetId}
        className="w-fit rounded-md bg-brand px-6 py-3 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50"
      >
        Master this track
      </button>
    </div>
  );
}
