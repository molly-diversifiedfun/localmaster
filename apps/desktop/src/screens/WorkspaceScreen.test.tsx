import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useEffect, type ReactNode } from "react";
import { AppStateProvider, useAppState } from "../state/app-state";
import { WorkspaceScreen } from "./WorkspaceScreen";
import type { AnalysisReport, Preset, PresetsResponse } from "@shared/types";

vi.mock("../lib/api", () => ({
  getPresets: vi.fn(),
  masterAndWait: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

vi.mock("../hooks/useAbPlayback", () => ({
  useAbPlayback: () => ({
    activeSide: "master",
    isPlaying: false,
    play: vi.fn(),
    pause: vi.fn(),
    toggleSide: vi.fn(),
  }),
}));

import { getPresets } from "../lib/api";

const presetFixture: Preset = {
  id: "clean_dj",
  name: "Clean DJ Master",
  description: "DJ-ready loudness with transient priority.",
  target_lufs: -9,
  ceiling_dbtp: -1,
  gr_budget_db: 4,
  highpass_hz: 30,
  eq_bands: [],
  comp_threshold_db: -18,
  comp_ratio: 1.8,
  comp_attack_ms: 15,
  comp_release_ms: 150,
  comp_knee_db: 6,
  saturation_drive: 1.2,
  saturation_mix: 0.15,
  stereo_width: 1,
  mono_bass_hz: 100,
  limiter_lookahead_ms: 5,
  limiter_release_ms: 80,
  bit_depth: 24,
  remove_dc: true,
};

const presetsResponse: PresetsResponse = { presets: [presetFixture] };

const analysisFixture: AnalysisReport = {
  sample_rate: 44100,
  n_channels: 2,
  duration_seconds: 30,
  bit_depth: 24,
  integrated_lufs: -14,
  short_term_lufs: [],
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
  clipped_regions: 0,
  has_clipping: false,
  has_excessive_sub_bass: false,
  has_harshness: false,
  stereo_imbalance_db: 0,
  has_stereo_imbalance: false,
  leading_silence_seconds: 0,
  trailing_silence_seconds: 0,
  waveform_overview: [[-0.5, 0.5]],
};

function SetTrackReady({ children }: { children: ReactNode }) {
  const { setCurrentPath, setAnalysis } = useAppState();
  useEffect(() => {
    setCurrentPath("/tracks/song.wav");
    setAnalysis(analysisFixture);
  }, [setCurrentPath, setAnalysis]);
  return <>{children}</>;
}

function renderWorkspace() {
  return render(
    <MemoryRouter>
      <AppStateProvider>
        <SetTrackReady>
          <WorkspaceScreen />
        </SetTrackReady>
      </AppStateProvider>
    </MemoryRouter>,
  );
}

describe("WorkspaceScreen", () => {
  beforeEach(() => {
    vi.mocked(getPresets).mockReset();
    vi.mocked(getPresets).mockResolvedValue(presetsResponse);
  });

  it("prompts to analyze first when no analysis is available", () => {
    render(
      <MemoryRouter>
        <AppStateProvider>
          <WorkspaceScreen />
        </AppStateProvider>
      </MemoryRouter>,
    );

    expect(
      screen.getByText(/analyze a track before mastering/i),
    ).toBeInTheDocument();
  });

  it("fetches and renders the mocked presets in the preset selector", async () => {
    renderWorkspace();

    await waitFor(() =>
      expect(screen.getByTestId("preset-selector")).toBeInTheDocument(),
    );
    expect(screen.getByText("Clean DJ Master")).toBeInTheDocument();
    expect(getPresets).toHaveBeenCalledTimes(1);
  });

  it("renders editable preset controls once a preset is auto-selected", async () => {
    renderWorkspace();

    await waitFor(() =>
      expect(screen.getByTestId("preset-controls-panel")).toBeInTheDocument(),
    );
    expect(screen.getByText("Target LUFS")).toBeInTheDocument();
  });

  it("renders the original waveform from the current analysis", async () => {
    renderWorkspace();

    await waitFor(() =>
      expect(screen.getAllByTestId("waveform-canvas").length).toBeGreaterThan(
        0,
      ),
    );
  });
});
