import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AppStateProvider } from "../state/app-state";
import { InstrumentScreen } from "./InstrumentScreen";
import type {
  AnalysisReport,
  MasterJobResult,
  Preset,
  PresetsResponse,
} from "@shared/types";

vi.mock("../lib/api", () => ({
  getHealth: vi
    .fn()
    .mockResolvedValue({
      status: "ok",
      version: "0.1.0",
      engine: "localmaster",
    }),
  getPresets: vi.fn(),
  analyzeAndWait: vi.fn(),
  masterAndWait: vi.fn(),
  exportAndWait: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

vi.mock("../lib/tauri", () => ({
  pickWavFiles: vi.fn(),
  pickDirectory: vi.fn(),
  subscribeToFileDrop: vi.fn().mockRejectedValue(new Error("not in tauri")),
  openInDefaultApp: vi.fn(),
}));

vi.mock("../hooks/useAbPlayback", () => ({
  useAbPlayback: () => ({
    activeSide: "master",
    isPlaying: false,
    currentTime: 0,
    play: vi.fn(),
    pause: vi.fn(),
    toggleSide: vi.fn(),
    seek: vi.fn(),
  }),
}));

import { getPresets, analyzeAndWait, masterAndWait } from "../lib/api";
import { pickWavFiles } from "../lib/tauri";

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

const masterResultFixture: MasterJobResult = {
  preview_path: "/cache/preview.wav",
  input_analysis: analysisFixture,
  output_analysis: { ...analysisFixture, integrated_lufs: -9 },
  stage_meta: [],
  warnings: ["transient guard capped gain reduction"],
  ab_gain_db: -1.2,
};

function renderInstrument() {
  return render(
    <MemoryRouter>
      <AppStateProvider>
        <InstrumentScreen />
      </AppStateProvider>
    </MemoryRouter>,
  );
}

describe("InstrumentScreen", () => {
  beforeEach(() => {
    vi.mocked(getPresets).mockReset().mockResolvedValue(presetsResponse);
    vi.mocked(analyzeAndWait).mockReset();
    vi.mocked(masterAndWait).mockReset();
    vi.mocked(pickWavFiles).mockReset();
  });

  it("opens on the drop surface with no dashboard/nav-first chrome", () => {
    renderInstrument();
    expect(screen.getByTestId("drop-surface")).toBeInTheDocument();
    expect(screen.getByTestId("signal-rail")).toBeInTheDocument();
  });

  it("walks drop -> analyze -> track -> master -> result", async () => {
    vi.mocked(pickWavFiles).mockResolvedValue(["/tracks/song.wav"]);
    vi.mocked(analyzeAndWait).mockResolvedValue(analysisFixture);
    vi.mocked(masterAndWait).mockResolvedValue(masterResultFixture);

    renderInstrument();

    await userEvent.click(screen.getByText("Choose file(s)…"));

    await waitFor(() =>
      expect(screen.getByTestId("track-view")).toBeInTheDocument(),
    );
    expect(analyzeAndWait).toHaveBeenCalledWith("/tracks/song.wav");
    expect(screen.getAllByTestId("matrix-stamp")[0]).toHaveTextContent(
      "-14.0 LUFS",
    );

    await waitFor(() =>
      expect(screen.getByTestId("preset-selector")).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByText("Clean DJ Master"));
    await userEvent.click(screen.getByText("Master this track"));

    await waitFor(() =>
      expect(screen.getByTestId("result-view")).toBeInTheDocument(),
    );
    expect(masterAndWait).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/tracks/song.wav",
        preset_id: "clean_dj",
      }),
      expect.any(Object),
    );
    expect(screen.getByTestId("ab-compare-hero")).toBeInTheDocument();
    expect(screen.getByTestId("flip-control")).toBeInTheDocument();
    expect(screen.getByTestId("export-bar")).toBeInTheDocument();
    expect(screen.getByText(/transient guard/)).toBeInTheDocument();
  });

  it("routes a multi-file drop to the batch/album flow instead of the single-track flow", async () => {
    vi.mocked(pickWavFiles).mockResolvedValue([
      "/tracks/a.wav",
      "/tracks/b.wav",
    ]);

    renderInstrument();
    await userEvent.click(screen.getByText("Choose file(s)…"));

    // Single-track flow never starts analysis for a multi-file selection.
    await waitFor(() => expect(pickWavFiles).toHaveBeenCalled());
    expect(analyzeAndWait).not.toHaveBeenCalled();
  });

  it("shows an analysis error on the drop surface and lets the user retry", async () => {
    vi.mocked(pickWavFiles).mockResolvedValue(["/tracks/bad.wav"]);
    vi.mocked(analyzeAndWait).mockRejectedValue(new Error("engine offline"));

    renderInstrument();
    await userEvent.click(screen.getByText("Choose file(s)…"));

    await waitFor(() =>
      expect(screen.getByTestId("drop-error")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("drop-surface")).toBeInTheDocument();
  });
});
