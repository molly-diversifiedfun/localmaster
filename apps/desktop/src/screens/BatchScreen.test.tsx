import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AppStateProvider } from "../state/app-state";
import { BatchScreen } from "./BatchScreen";
import type { BatchJobResult, Preset, PresetsResponse } from "@shared/types";

vi.mock("../lib/api", () => ({
  getPresets: vi.fn(),
  batchAndWait: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

vi.mock("../lib/tauri", () => ({
  pickWavFiles: vi.fn(),
  pickDirectory: vi.fn(),
}));

import { getPresets, batchAndWait } from "../lib/api";
import { pickWavFiles, pickDirectory } from "../lib/tauri";

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

const passingChecklist = {
  no_clipping: true,
  peak_within_ceiling: true,
  loudness_within_tolerance: true,
  valid_stereo: true,
  export_succeeded: true,
  output_is_wav: true,
};

const batchResultFixture: BatchJobResult = {
  shared_target_lufs: -14.2,
  warnings: ["track2.wav landed above target (transient guard)"],
  exports: [
    {
      out_path: "/out/track1__LocalMaster.wav",
      json_report_path: "/out/track1.json",
      txt_report_path: "/out/track1.txt",
      checklist: passingChecklist,
      // Minimal stub — BatchScreen only reads `.checklist` off each export.
      output_analysis: {} as never,
    },
    {
      out_path: "/out/track2__LocalMaster.wav",
      json_report_path: "/out/track2.json",
      txt_report_path: "/out/track2.txt",
      checklist: { ...passingChecklist, loudness_within_tolerance: false },
      output_analysis: {} as never,
    },
  ],
};

function renderBatchScreen() {
  return render(
    <MemoryRouter>
      <AppStateProvider>
        <BatchScreen />
      </AppStateProvider>
    </MemoryRouter>,
  );
}

describe("BatchScreen", () => {
  beforeEach(() => {
    vi.mocked(getPresets).mockReset().mockResolvedValue(presetsResponse);
    vi.mocked(batchAndWait).mockReset();
    vi.mocked(pickWavFiles).mockReset();
    vi.mocked(pickDirectory).mockReset();
  });

  it("fetches presets and lists picked files before running", async () => {
    vi.mocked(pickWavFiles).mockResolvedValue([
      "/tracks/track1.wav",
      "/tracks/track2.wav",
    ]);

    renderBatchScreen();
    await waitFor(() =>
      expect(screen.getByTestId("preset-selector")).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByText("Choose WAV files…"));

    await waitFor(() =>
      expect(screen.getByTestId("batch-file-list")).toBeInTheDocument(),
    );
    expect(screen.getByText("track1.wav")).toBeInTheDocument();
    expect(screen.getByText("track2.wav")).toBeInTheDocument();
  });

  it("runs a single POST /batch job and renders the shared-target headline, warnings, and per-track checklist", async () => {
    vi.mocked(pickWavFiles).mockResolvedValue([
      "/tracks/track1.wav",
      "/tracks/track2.wav",
    ]);
    vi.mocked(pickDirectory).mockResolvedValue("/out");
    vi.mocked(batchAndWait).mockResolvedValue(batchResultFixture);

    renderBatchScreen();
    await waitFor(() =>
      expect(screen.getByTestId("preset-selector")).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByText("Choose WAV files…"));
    await userEvent.click(screen.getByText("Choose output folder…"));
    await userEvent.click(screen.getByText("Run batch"));

    await waitFor(() =>
      expect(screen.getByTestId("shared-target-headline")).toBeInTheDocument(),
    );

    expect(batchAndWait).toHaveBeenCalledTimes(1);
    expect(batchAndWait).toHaveBeenCalledWith(
      expect.objectContaining({
        paths: ["/tracks/track1.wav", "/tracks/track2.wav"],
        preset_id: "clean_dj",
        out_dir: "/out",
      }),
      expect.any(Object),
    );

    expect(screen.getByText("Album matched to -14.2 LUFS")).toBeInTheDocument();
    expect(screen.getByTestId("batch-warnings-list")).toBeInTheDocument();

    const table = screen.getByTestId("batch-summary-table");
    expect(table).toHaveTextContent("track1.wav");
    expect(table).toHaveTextContent("All checks passed");
    expect(table).toHaveTextContent("track2.wav");
    expect(table).toHaveTextContent("loudness_within_tolerance");
  });

  it("shows a job error when the batch job fails", async () => {
    vi.mocked(pickWavFiles).mockResolvedValue(["/tracks/track1.wav"]);
    vi.mocked(pickDirectory).mockResolvedValue("/out");
    vi.mocked(batchAndWait).mockRejectedValue(new Error("engine offline"));

    renderBatchScreen();
    await waitFor(() =>
      expect(screen.getByTestId("preset-selector")).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByText("Choose WAV files…"));
    await userEvent.click(screen.getByText("Choose output folder…"));
    await userEvent.click(screen.getByText("Run batch"));

    await waitFor(() =>
      expect(screen.getByTestId("job-progress-error")).toBeInTheDocument(),
    );
  });
});
