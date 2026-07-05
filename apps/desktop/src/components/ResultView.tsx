import type { AnalysisReport, Preset, PresetOverrides } from "@shared/types";
import type { useAbPlayback } from "../hooks/useAbPlayback";
import { AbCompareHero } from "./AbCompareHero";
import { FlipControl } from "./FlipControl";
import { MatrixStamp } from "./MatrixStamp";
import { AdjustDrawer } from "./AdjustDrawer";
import { basename, matrixStampValues } from "../lib/format";

interface ResultViewProps {
  path: string;
  inputAnalysis: AnalysisReport;
  outputAnalysis: AnalysisReport;
  warnings: string[];
  ab: ReturnType<typeof useAbPlayback>;
  preset: Preset | null;
  overrides: PresetOverrides;
  onOverridesChange: (overrides: PresetOverrides) => void;
  overridesDirty: boolean;
  onRemaster: () => void;
  onNewTrack: () => void;
  error: string | null;
}

/**
 * RESULT stage: the layered A/B waveform is the hero, flip control below it,
 * before/after matrix stamps side by side, amber warnings, and the
 * collapsed Adjust drawer for progressive disclosure.
 */
export function ResultView({
  path,
  inputAnalysis,
  outputAnalysis,
  warnings,
  ab,
  preset,
  overrides,
  onOverridesChange,
  overridesDirty,
  onRemaster,
  onNewTrack,
  error,
}: ResultViewProps) {
  return (
    <div
      className="mx-auto flex max-w-[1400px] flex-col gap-6 px-[clamp(1.5rem,4vw,3rem)] py-8"
      data-testid="result-view"
    >
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{basename(path)}</h1>
        <button
          type="button"
          onClick={onNewTrack}
          className="text-xs text-text-secondary underline hover:text-text"
        >
          New track
        </button>
      </div>

      <AbCompareHero
        originalBins={inputAnalysis.waveform_overview}
        masterBins={outputAnalysis.waveform_overview}
        currentTime={ab.currentTime}
        duration={inputAnalysis.duration_seconds}
        onSeek={ab.seek}
      />

      <FlipControl
        activeSide={ab.activeSide}
        isPlaying={ab.isPlaying}
        onFlip={ab.toggleSide}
        onTogglePlay={() => (ab.isPlaying ? ab.pause() : ab.play())}
      />

      <div className="grid grid-cols-2 gap-6">
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-text-secondary">
            Original
          </p>
          <MatrixStamp values={matrixStampValues(inputAnalysis)} />
        </div>
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-text-secondary">
            Master
          </p>
          <MatrixStamp values={matrixStampValues(outputAnalysis)} fresh />
        </div>
      </div>

      {warnings.length > 0 && (
        <ul className="flex flex-col gap-1" data-testid="warnings-list">
          {warnings.map((warning) => (
            <li key={warning} className="text-sm text-warning">
              {warning}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="text-sm text-error" data-testid="result-error">
          {error}
        </p>
      )}

      <AdjustDrawer
        preset={preset}
        overrides={overrides}
        onChange={onOverridesChange}
        dirty={overridesDirty}
        onRemaster={onRemaster}
      />
    </div>
  );
}
