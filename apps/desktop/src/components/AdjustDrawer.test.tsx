import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdjustDrawer } from "./AdjustDrawer";
import type { Preset } from "@shared/types";

vi.mock("../lib/tauri", () => ({
  pickWavFile: vi.fn(),
}));

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

function renderDrawer(
  overrides: Partial<Parameters<typeof AdjustDrawer>[0]> = {},
) {
  return render(
    <AdjustDrawer
      preset={presetFixture}
      overrides={{}}
      onChange={vi.fn()}
      referencePath={null}
      matchStrength={0.35}
      onReferenceChange={vi.fn()}
      onStrengthChange={vi.fn()}
      dirty={false}
      onRemaster={vi.fn()}
      {...overrides}
    />,
  );
}

describe("AdjustDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when there is no preset", () => {
    const { container } = render(
      <AdjustDrawer
        preset={null}
        overrides={{}}
        onChange={vi.fn()}
        referencePath={null}
        matchStrength={0.35}
        onReferenceChange={vi.fn()}
        onStrengthChange={vi.fn()}
        dirty={false}
        onRemaster={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("starts collapsed, revealing the reference control and preset panel once opened", async () => {
    renderDrawer();
    expect(
      screen.queryByTestId("reference-match-control"),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("Adjust"));

    expect(screen.getByTestId("reference-match-control")).toBeInTheDocument();
    expect(screen.getByTestId("preset-controls-panel")).toBeInTheDocument();
  });

  it("hides the Re-master CTA when not dirty and shows it when dirty", async () => {
    const { rerender } = renderDrawer({ dirty: false });
    await userEvent.click(screen.getByText("Adjust"));
    expect(screen.queryByTestId("remaster-cta")).not.toBeInTheDocument();

    rerender(
      <AdjustDrawer
        preset={presetFixture}
        overrides={{}}
        onChange={vi.fn()}
        referencePath={null}
        matchStrength={0.35}
        onReferenceChange={vi.fn()}
        onStrengthChange={vi.fn()}
        dirty
        onRemaster={vi.fn()}
      />,
    );
    expect(screen.getByTestId("remaster-cta")).toBeInTheDocument();
  });

  it("calls onRemaster when the Re-master CTA is clicked", async () => {
    const onRemaster = vi.fn();
    renderDrawer({ dirty: true, onRemaster });
    await userEvent.click(screen.getByText("Adjust"));

    await userEvent.click(screen.getByTestId("remaster-cta"));

    expect(onRemaster).toHaveBeenCalled();
  });

  it("passes reference state through to ReferenceMatchControl", async () => {
    renderDrawer({ referencePath: "/refs/warehouse.wav", matchStrength: 0.6 });
    await userEvent.click(screen.getByText("Adjust"));

    expect(screen.getByTitle("/refs/warehouse.wav")).toHaveTextContent(
      "warehouse.wav",
    );
    expect(screen.getByTestId("reference-strength-slider")).toHaveValue("60");
  });

  it("forwards a clear click to onReferenceChange", async () => {
    const onReferenceChange = vi.fn();
    renderDrawer({
      referencePath: "/refs/warehouse.wav",
      onReferenceChange,
    });
    await userEvent.click(screen.getByText("Adjust"));

    await userEvent.click(screen.getByTestId("reference-clear"));

    expect(onReferenceChange).toHaveBeenCalledWith(null);
  });
});
