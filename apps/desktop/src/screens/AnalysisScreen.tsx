import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppState } from "../state/app-state";
import { analyzeAndWait, ApiError } from "../lib/api";
import { WaveformCanvas } from "../components/WaveformCanvas";
import { LoudnessMeter } from "../components/LoudnessMeter";
import { SpectralBalanceBars } from "../components/SpectralBalanceBars";
import { IssueFlags } from "../components/IssueFlags";
import { basename, formatDuration } from "../lib/format";

/** Track Analysis screen: runs POST /analyze on the current track and renders the report. */
export function AnalysisScreen() {
  const navigate = useNavigate();
  const { currentPath, analysis, setAnalysis } = useAppState();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentPath) return;
    if (analysis) return;
    setIsLoading(true);
    setError(null);
    analyzeAndWait(currentPath)
      .then(setAnalysis)
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : "Analysis failed.");
      })
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath]);

  if (!currentPath) {
    return (
      <EmptyState
        message="No track selected."
        actionLabel="Go to Import"
        onAction={() => navigate("/")}
      />
    );
  }

  if (isLoading) {
    return (
      <p className="text-sm text-studio-text-dim">
        Analyzing {basename(currentPath)}…
      </p>
    );
  }

  if (error) {
    return <p className="text-sm text-studio-danger">{error}</p>;
  }

  if (!analysis) return null;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{basename(currentPath)}</h1>
        <p className="text-sm text-studio-text-dim">
          {formatDuration(analysis.duration_seconds)} · {analysis.sample_rate}{" "}
          Hz · {analysis.n_channels === 2 ? "Stereo" : "Mono"}
        </p>
      </div>

      <WaveformCanvas bins={analysis.waveform_overview} />

      <div className="grid grid-cols-3 gap-4">
        <LoudnessMeter
          label="Integrated LUFS"
          value={analysis.integrated_lufs}
          unit="LUFS"
          min={-40}
          max={0}
        />
        <LoudnessMeter
          label="True Peak"
          value={analysis.true_peak_dbtp}
          unit="dBTP"
          min={-20}
          max={2}
        />
        <LoudnessMeter
          label="LRA"
          value={analysis.loudness_range_lu}
          unit="LU"
          min={0}
          max={20}
        />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-studio-text-dim">
          Spectral balance
        </h2>
        <SpectralBalanceBars balance={analysis.spectral_balance} />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-studio-text-dim">
          Issues
        </h2>
        <IssueFlags analysis={analysis} />
      </div>

      <button
        type="button"
        onClick={() => navigate("/workspace")}
        className="w-fit rounded bg-studio-accent px-4 py-2 text-sm font-medium text-studio-bg hover:opacity-90"
      >
        Continue to Workspace
      </button>
    </div>
  );
}

function EmptyState({
  message,
  actionLabel,
  onAction,
}: {
  message: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-studio-text-dim">{message}</p>
      <button
        type="button"
        onClick={onAction}
        className="w-fit rounded bg-studio-panel-raised px-3 py-1.5 text-sm hover:text-studio-accent"
      >
        {actionLabel}
      </button>
    </div>
  );
}
