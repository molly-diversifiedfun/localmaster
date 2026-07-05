import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AppStateProvider, useAppState } from "../state/app-state";
import { InstrumentScreen } from "./InstrumentScreen";
import type {
  AnalysisReport,
  ExportJobResult,
  MasterJobResult,
  Preset,
  PresetsResponse,
} from "@shared/types";

vi.mock("../lib/api", () => ({
  getHealth: vi.fn().mockResolvedValue({
    status: "ok",
    version: "0.1.0",
    engine: "localmaster",
  }),
  getPresets: vi.fn(),
  analyzeAndWait: vi.fn(),
  masterAndWait: vi.fn(),
  exportAndWait: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
}));

vi.mock("../lib/tauri", () => ({
  pickWavFile: vi.fn(),
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

import {
  getPresets,
  analyzeAndWait,
  masterAndWait,
  exportAndWait,
  ApiError,
} from "../lib/api";
import { pickWavFile, pickWavFiles, pickDirectory } from "../lib/tauri";

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
const punchyPresetFixture: Preset = {
  ...presetFixture,
  id: "punchy_club",
  name: "Punchy Club",
  description: "High-energy club master.",
};
const presetsResponse: PresetsResponse = {
  presets: [presetFixture, punchyPresetFixture],
};

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

const exportResultFixture: ExportJobResult = {
  out_path: "/out/song__LocalMaster__clean_dj__-9.0LUFS__44100Hz__24bit.wav",
  json_report_path: "/out/song.json",
  txt_report_path: "/out/song.txt",
  checklist: {
    no_clipping: true,
    peak_within_ceiling: true,
    loudness_within_tolerance: true,
    valid_stereo: true,
    export_succeeded: true,
    output_is_wav: true,
  },
  output_analysis: analysisFixture,
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

/**
 * Seeds `referencePath` directly via shared app-state before InstrumentScreen
 * mounts its flow — the reference picker only lives in the post-master
 * AdjustDrawer, so this is the seam for regression-testing that state that
 * exists before the first master (e.g. a preset pick) leaves it untouched.
 */
function ReferenceSeeder({ path }: { path: string }) {
  const { setReferencePath } = useAppState();
  return (
    <button
      type="button"
      onClick={() => setReferencePath(path)}
      data-testid="seed-reference"
    >
      Seed reference (test only)
    </button>
  );
}

function renderInstrumentWithSeededReference(path: string) {
  return render(
    <MemoryRouter>
      <AppStateProvider>
        <ReferenceSeeder path={path} />
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
    vi.mocked(pickWavFile).mockReset();
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

/** Walks drop -> analyze -> track -> master, landing on the result view. */
async function walkToResult(
  masterResult: MasterJobResult = masterResultFixture,
) {
  vi.mocked(pickWavFiles).mockResolvedValue(["/tracks/song.wav"]);
  vi.mocked(analyzeAndWait).mockResolvedValue(analysisFixture);
  vi.mocked(masterAndWait).mockResolvedValue(masterResult);

  renderInstrument();
  await userEvent.click(screen.getByText("Choose file(s)…"));
  await waitFor(() =>
    expect(screen.getByTestId("preset-selector")).toBeInTheDocument(),
  );
  await userEvent.click(screen.getByText("Clean DJ Master"));
  await userEvent.click(screen.getByText("Master this track"));
  await waitFor(() =>
    expect(screen.getByTestId("result-view")).toBeInTheDocument(),
  );
}

describe("InstrumentScreen — reference matching", () => {
  beforeEach(() => {
    vi.mocked(getPresets).mockReset().mockResolvedValue(presetsResponse);
    vi.mocked(analyzeAndWait).mockReset();
    vi.mocked(masterAndWait).mockReset();
    vi.mocked(exportAndWait).mockReset();
    vi.mocked(pickWavFiles).mockReset();
    vi.mocked(pickWavFile).mockReset();
    vi.mocked(pickDirectory).mockReset();
  });

  it("sends reference_path and match_strength to masterAndWait after picking a reference and re-mastering", async () => {
    await walkToResult();
    vi.mocked(pickWavFile).mockResolvedValue("/refs/warehouse.wav");

    await userEvent.click(screen.getByText("Adjust"));
    await userEvent.click(screen.getByText("Match a reference…"));
    await waitFor(() =>
      expect(screen.getByTestId("reference-clear")).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByTestId("remaster-cta"));

    await waitFor(() =>
      expect(masterAndWait).toHaveBeenLastCalledWith(
        expect.objectContaining({
          reference_path: "/refs/warehouse.wav",
          match_strength: 0.35,
        }),
        expect.any(Object),
      ),
    );
  });

  it("persists the reference and strength across a re-master without re-picking", async () => {
    await walkToResult();
    vi.mocked(pickWavFile).mockResolvedValue("/refs/warehouse.wav");

    await userEvent.click(screen.getByText("Adjust"));
    await userEvent.click(screen.getByText("Match a reference…"));
    await waitFor(() =>
      expect(screen.getByTestId("reference-clear")).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByTestId("remaster-cta"));
    await waitFor(() => expect(masterAndWait).toHaveBeenCalledTimes(2));

    // ResultView unmounts during the "mastering" stage, so the drawer re-collapses; reopen it.
    await userEvent.click(screen.getByText("Adjust"));

    // Move the strength slider — no re-pick needed, the reference persists in shared app-state.
    fireEvent.change(screen.getByTestId("reference-strength-slider"), {
      target: { value: "60" },
    });
    await userEvent.click(screen.getByTestId("remaster-cta"));

    await waitFor(() =>
      expect(masterAndWait).toHaveBeenLastCalledWith(
        expect.objectContaining({
          reference_path: "/refs/warehouse.wav",
          match_strength: 0.6,
        }),
        expect.any(Object),
      ),
    );
  });

  it("renders the reference-match stamp when the master result carries reference_match stage-meta", async () => {
    await walkToResult({
      ...masterResultFixture,
      stage_meta: [
        {
          stage: "reference_match",
          strength: 0.5,
          mid_band_deltas_db: [1.2],
          side_band_deltas_db: [-0.8],
        },
      ],
    });

    expect(screen.getByTestId("reference-match-stamp")).toHaveTextContent(
      "50%",
    );
  });

  it("keeps the prior result and surfaces the error when a re-master with a bad reference fails", async () => {
    await walkToResult();
    vi.mocked(pickWavFile).mockResolvedValue("/refs/bad.wav");

    await userEvent.click(screen.getByText("Adjust"));
    await userEvent.click(screen.getByText("Match a reference…"));
    await waitFor(() =>
      expect(screen.getByTestId("reference-clear")).toBeInTheDocument(),
    );

    vi.mocked(masterAndWait).mockRejectedValueOnce(
      new ApiError(0, "INVALID_REFERENCE", "invalid reference file"),
    );
    await userEvent.click(screen.getByTestId("remaster-cta"));

    await waitFor(() =>
      expect(screen.getByTestId("result-error")).toHaveTextContent(
        "invalid reference file",
      ),
    );
    expect(screen.getByTestId("result-view")).toBeInTheDocument();
  });

  it("clears the reference when a new file is picked", async () => {
    await walkToResult();
    vi.mocked(pickWavFile).mockResolvedValue("/refs/warehouse.wav");

    await userEvent.click(screen.getByText("Adjust"));
    await userEvent.click(screen.getByText("Match a reference…"));
    await waitFor(() =>
      expect(screen.getByTestId("reference-clear")).toBeInTheDocument(),
    );

    vi.mocked(pickWavFiles).mockResolvedValue(["/tracks/new-track.wav"]);
    await userEvent.click(screen.getByText("New track"));
    await userEvent.click(screen.getByText("Choose file(s)…"));

    await waitFor(() =>
      expect(screen.getByTestId("track-view")).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByText("Clean DJ Master"));
    await userEvent.click(screen.getByText("Master this track"));
    await waitFor(() =>
      expect(screen.getByTestId("result-view")).toBeInTheDocument(),
    );

    expect(masterAndWait).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ reference_path: expect.anything() }),
      expect.any(Object),
    );
  });

  it("sends reference_path and match_strength to exportAndWait when exporting with a reference set", async () => {
    await walkToResult();
    vi.mocked(pickWavFile).mockResolvedValue("/refs/warehouse.wav");
    vi.mocked(pickDirectory).mockResolvedValue("/out");
    vi.mocked(exportAndWait).mockResolvedValue(exportResultFixture);

    await userEvent.click(screen.getByText("Adjust"));
    await userEvent.click(screen.getByText("Match a reference…"));
    await waitFor(() =>
      expect(screen.getByTestId("reference-clear")).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByText("Choose destination…"));
    await waitFor(() => expect(screen.getByText("/out")).toBeInTheDocument());
    await userEvent.click(screen.getByText("Export 24-bit WAV"));

    await waitFor(() =>
      expect(exportAndWait).toHaveBeenCalledWith(
        expect.objectContaining({
          reference_path: "/refs/warehouse.wav",
          match_strength: 0.35,
        }),
        expect.any(Object),
      ),
    );
  });

  it("keeps a reference untouched when a different preset is selected before mastering", async () => {
    vi.mocked(pickWavFiles).mockResolvedValue(["/tracks/song.wav"]);
    vi.mocked(analyzeAndWait).mockResolvedValue(analysisFixture);
    vi.mocked(masterAndWait).mockResolvedValue(masterResultFixture);

    renderInstrumentWithSeededReference("/refs/warehouse.wav");

    // Seed the reference AFTER landing on the track stage — selecting a file
    // itself resets any prior reference (acceptance criterion: new file clears it).
    await userEvent.click(screen.getByText("Choose file(s)…"));
    await waitFor(() =>
      expect(screen.getByTestId("preset-selector")).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByTestId("seed-reference"));

    // Selecting a different preset must reset overrides but leave the reference alone.
    await userEvent.click(screen.getByText("Punchy Club"));
    await userEvent.click(screen.getByText("Master this track"));

    await waitFor(() =>
      expect(masterAndWait).toHaveBeenCalledWith(
        expect.objectContaining({
          preset_id: "punchy_club",
          reference_path: "/refs/warehouse.wav",
          match_strength: 0.35,
        }),
        expect.any(Object),
      ),
    );
  });
});
