import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useEffect, type ReactNode } from "react";
import { AppStateProvider, useAppState } from "../state/app-state";
import { AnalysisScreen } from "./AnalysisScreen";
import type { AnalysisReport } from "@shared/types";

vi.mock("../lib/api", () => ({
  analyzeAndWait: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

import { analyzeAndWait } from "../lib/api";

const analysisFixture: AnalysisReport = {
  sample_rate: 44100,
  n_channels: 2,
  duration_seconds: 30,
  bit_depth: 24,
  integrated_lufs: -14,
  short_term_lufs: [-14, -13.5],
  loudness_range_lu: 6,
  true_peak_dbtp: -1,
  sample_peak_dbfs: -1.2,
  spectral_balance: {
    low: 0.2,
    low_mid: 0.2,
    mid: 0.2,
    high_mid: 0.2,
    high: 0.2,
  },
  dc_offset: [0, 0],
  has_dc_offset: false,
  clipped_regions: 2,
  has_clipping: true,
  has_excessive_sub_bass: false,
  has_harshness: true,
  stereo_imbalance_db: 0.1,
  has_stereo_imbalance: false,
  waveform_overview: [[-0.5, 0.5]],
};

function SetCurrentPath({
  path,
  children,
}: {
  path: string;
  children: ReactNode;
}) {
  const { setCurrentPath } = useAppState();
  useEffect(() => setCurrentPath(path), [path, setCurrentPath]);
  return <>{children}</>;
}

function renderWithTrackSelected(path: string) {
  return render(
    <MemoryRouter>
      <AppStateProvider>
        <SetCurrentPath path={path}>
          <AnalysisScreen />
        </SetCurrentPath>
      </AppStateProvider>
    </MemoryRouter>,
  );
}

describe("AnalysisScreen", () => {
  beforeEach(() => {
    vi.mocked(analyzeAndWait).mockReset();
  });

  it("shows an empty state prompting import when no track is selected", () => {
    render(
      <MemoryRouter>
        <AppStateProvider>
          <AnalysisScreen />
        </AppStateProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText(/no track selected/i)).toBeInTheDocument();
  });

  it("runs analysis on mount and renders the resulting issue flags", async () => {
    vi.mocked(analyzeAndWait).mockResolvedValue(analysisFixture);

    renderWithTrackSelected("/tracks/song.wav");

    await waitFor(() =>
      expect(screen.getByTestId("issue-flags-list")).toBeInTheDocument(),
    );

    expect(screen.getByText(/clipping \(2 regions\)/i)).toBeInTheDocument();
    expect(screen.getByText(/harshness/i)).toBeInTheDocument();
    expect(screen.queryByText(/dc offset/i)).not.toBeInTheDocument();
    expect(analyzeAndWait).toHaveBeenCalledWith("/tracks/song.wav");
  });

  it("renders the waveform canvas and loudness readouts once analysis resolves", async () => {
    vi.mocked(analyzeAndWait).mockResolvedValue(analysisFixture);

    renderWithTrackSelected("/tracks/song.wav");

    await waitFor(() =>
      expect(screen.getByTestId("waveform-canvas")).toBeInTheDocument(),
    );
    expect(screen.getByText(/-14\.0 LUFS/)).toBeInTheDocument();
  });
});
