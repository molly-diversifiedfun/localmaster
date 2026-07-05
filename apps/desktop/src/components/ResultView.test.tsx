import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResultView } from "./ResultView";
import type { AnalysisReport, Preset } from "@shared/types";

vi.mock("../lib/tauri", () => ({
  pickWavFile: vi.fn(),
}));

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

const abFixture = {
  activeSide: "master" as const,
  isPlaying: false,
  currentTime: 0,
  play: vi.fn(),
  pause: vi.fn(),
  toggleSide: vi.fn(),
  seek: vi.fn(),
};

function renderResult(
  overrides: Partial<Parameters<typeof ResultView>[0]> = {},
) {
  return render(
    <ResultView
      path="/tracks/song.wav"
      inputAnalysis={analysisFixture}
      outputAnalysis={{ ...analysisFixture, integrated_lufs: -9 }}
      stageMeta={[]}
      warnings={[]}
      ab={abFixture}
      preset={presetFixture}
      overrides={{}}
      onOverridesChange={vi.fn()}
      overridesDirty={false}
      referencePath={null}
      matchStrength={0.35}
      onReferenceChange={vi.fn()}
      onStrengthChange={vi.fn()}
      referenceDirty={false}
      onRemaster={vi.fn()}
      onNewTrack={vi.fn()}
      error={null}
      {...overrides}
    />,
  );
}

describe("ResultView", () => {
  it("renders the track name, A/B hero, flip control, and before/after stamps", () => {
    renderResult();
    expect(screen.getByText("song.wav")).toBeInTheDocument();
    expect(screen.getByTestId("ab-compare-hero")).toBeInTheDocument();
    expect(screen.getByTestId("flip-control")).toBeInTheDocument();
    expect(screen.getAllByTestId("matrix-stamp")).toHaveLength(2);
  });

  it("renders warnings and the master error when present", () => {
    renderResult({ warnings: ["transient guard capped gain"], error: "boom" });
    expect(screen.getByTestId("warnings-list")).toHaveTextContent(
      "transient guard capped gain",
    );
    expect(screen.getByTestId("result-error")).toHaveTextContent("boom");
  });

  it("renders the reference-match stamp from stage-meta, brand-green like the Master stamp", () => {
    renderResult({
      stageMeta: [
        {
          stage: "reference_match",
          strength: 0.4,
          mid_band_deltas_db: { "63hz": 1 },
          side_band_deltas_db: { "63hz": -1 },
        },
      ],
    });
    expect(screen.getByTestId("reference-match-stamp")).toHaveTextContent(
      "40%",
    );
    const stamps = screen.getAllByTestId("matrix-stamp");
    const referenceStamp = stamps[stamps.length - 1];
    expect(referenceStamp).toHaveClass("text-brand");
  });

  it("renders no reference-match stamp when stage-meta has no such entry", () => {
    renderResult({ stageMeta: [{ stage: "loudness" }] });
    expect(
      screen.queryByTestId("reference-match-stamp"),
    ).not.toBeInTheDocument();
  });

  it("shows the Re-master CTA when overridesDirty is set", async () => {
    renderResult({ overridesDirty: true });
    await userEvent.click(screen.getByText("Adjust"));
    expect(screen.getByTestId("remaster-cta")).toBeInTheDocument();
  });

  it("shows the Re-master CTA when referenceDirty is set, even if overrides aren't dirty", async () => {
    renderResult({ referenceDirty: true, overridesDirty: false });
    await userEvent.click(screen.getByText("Adjust"));
    expect(screen.getByTestId("remaster-cta")).toBeInTheDocument();
  });

  it("hides the Re-master CTA when neither overrides nor reference are dirty", async () => {
    renderResult({ referenceDirty: false, overridesDirty: false });
    await userEvent.click(screen.getByText("Adjust"));
    expect(screen.queryByTestId("remaster-cta")).not.toBeInTheDocument();
  });

  it("calls onNewTrack when New track is clicked", async () => {
    const onNewTrack = vi.fn();
    renderResult({ onNewTrack });
    await userEvent.click(screen.getByText("New track"));
    expect(onNewTrack).toHaveBeenCalled();
  });
});
