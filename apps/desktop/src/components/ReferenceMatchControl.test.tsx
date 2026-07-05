import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReferenceMatchControl } from "./ReferenceMatchControl";

vi.mock("../lib/tauri", () => ({
  pickWavFile: vi.fn(),
}));

import { pickWavFile } from "../lib/tauri";

describe("ReferenceMatchControl", () => {
  beforeEach(() => {
    vi.mocked(pickWavFile).mockReset();
  });

  it("shows only the pick button when no reference is set", () => {
    render(
      <ReferenceMatchControl
        referencePath={null}
        matchStrength={0.35}
        onReferenceChange={vi.fn()}
        onStrengthChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Match a reference…")).toBeInTheDocument();
    expect(screen.queryByTestId("reference-clear")).not.toBeInTheDocument();
  });

  it("stores the picked path via onReferenceChange", async () => {
    vi.mocked(pickWavFile).mockResolvedValue("/refs/warehouse.wav");
    const onReferenceChange = vi.fn();
    render(
      <ReferenceMatchControl
        referencePath={null}
        matchStrength={0.35}
        onReferenceChange={onReferenceChange}
        onStrengthChange={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByText("Match a reference…"));

    expect(onReferenceChange).toHaveBeenCalledWith("/refs/warehouse.wav");
  });

  it("renders the basename with a title tooltip of the full path once set, plus a clear control", () => {
    render(
      <ReferenceMatchControl
        referencePath="/refs/warehouse.wav"
        matchStrength={0.35}
        onReferenceChange={vi.fn()}
        onStrengthChange={vi.fn()}
      />,
    );
    const stamp = screen.getByTitle("/refs/warehouse.wav");
    expect(stamp).toHaveTextContent("warehouse.wav");
    expect(screen.getByTestId("reference-clear")).toBeInTheDocument();
    expect(screen.queryByText("Match a reference…")).not.toBeInTheDocument();
  });

  it("a cancelled dialog (null) is a no-op", async () => {
    vi.mocked(pickWavFile).mockResolvedValue(null);
    const onReferenceChange = vi.fn();
    render(
      <ReferenceMatchControl
        referencePath={null}
        matchStrength={0.35}
        onReferenceChange={onReferenceChange}
        onStrengthChange={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByText("Match a reference…"));

    expect(onReferenceChange).not.toHaveBeenCalled();
  });

  it("clear resets the reference to null", async () => {
    const onReferenceChange = vi.fn();
    render(
      <ReferenceMatchControl
        referencePath="/refs/warehouse.wav"
        matchStrength={0.35}
        onReferenceChange={onReferenceChange}
        onStrengthChange={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByTestId("reference-clear"));

    expect(onReferenceChange).toHaveBeenCalledWith(null);
  });

  it("disables the strength slider while no reference is set", () => {
    render(
      <ReferenceMatchControl
        referencePath={null}
        matchStrength={0.35}
        onReferenceChange={vi.fn()}
        onStrengthChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("reference-strength-slider")).toBeDisabled();
  });

  it("enables the slider once a reference is set, at the 35% initial position", () => {
    render(
      <ReferenceMatchControl
        referencePath="/refs/warehouse.wav"
        matchStrength={0.35}
        onReferenceChange={vi.fn()}
        onStrengthChange={vi.fn()}
      />,
    );
    const slider = screen.getByTestId("reference-strength-slider");
    expect(slider).toBeEnabled();
    expect(slider).toHaveValue("35");
    expect(screen.getByText("35%")).toBeInTheDocument();
  });

  it("maps a slider change to matchStrength as value/100", () => {
    const onStrengthChange = vi.fn();
    render(
      <ReferenceMatchControl
        referencePath="/refs/warehouse.wav"
        matchStrength={0.35}
        onReferenceChange={vi.fn()}
        onStrengthChange={onStrengthChange}
      />,
    );
    fireEvent.change(screen.getByTestId("reference-strength-slider"), {
      target: { value: "60" },
    });
    expect(onStrengthChange).toHaveBeenCalledWith(0.6);
  });

  it("ignores a strength change when no reference is set (defense-in-depth)", () => {
    const onStrengthChange = vi.fn();
    render(
      <ReferenceMatchControl
        referencePath={null}
        matchStrength={0.35}
        onReferenceChange={vi.fn()}
        onStrengthChange={onStrengthChange}
      />,
    );
    fireEvent.change(screen.getByTestId("reference-strength-slider"), {
      target: { value: "60" },
    });
    expect(onStrengthChange).not.toHaveBeenCalled();
  });
});
