import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AbCompareHero } from "./AbCompareHero";

describe("AbCompareHero", () => {
  it("renders a canvas for the layered A/B waveform", () => {
    render(
      <AbCompareHero
        originalBins={[[-0.5, 0.5]]}
        masterBins={[[-0.6, 0.6]]}
        currentTime={0}
        duration={30}
        onSeek={vi.fn()}
      />,
    );
    expect(screen.getByTestId("ab-compare-hero")).toBeInTheDocument();
  });

  it("calls onSeek with the click position as a fraction of width", () => {
    const onSeek = vi.fn();
    render(
      <AbCompareHero
        originalBins={[[-0.5, 0.5]]}
        masterBins={[[-0.6, 0.6]]}
        currentTime={0}
        duration={30}
        onSeek={onSeek}
      />,
    );
    const canvas = screen.getByTestId("ab-compare-hero");
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      width: 200,
      left: 0,
      top: 0,
      height: 220,
      right: 200,
      bottom: 220,
      x: 0,
      y: 0,
      toJSON: () => "",
    });

    fireEvent.click(canvas, { clientX: 100 });

    expect(onSeek).toHaveBeenCalledWith(0.5);
  });
});
