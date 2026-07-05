import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FlipControl } from "./FlipControl";

describe("FlipControl", () => {
  it("shows Play when not playing and Pause when playing", () => {
    const { rerender } = render(
      <FlipControl
        activeSide="master"
        isPlaying={false}
        onFlip={vi.fn()}
        onTogglePlay={vi.fn()}
      />,
    );
    expect(screen.getByText("Play")).toBeInTheDocument();

    rerender(
      <FlipControl
        activeSide="master"
        isPlaying
        onFlip={vi.fn()}
        onTogglePlay={vi.fn()}
      />,
    );
    expect(screen.getByText("Pause")).toBeInTheDocument();
  });

  it("shows which side is being heard and flips on click", async () => {
    const onFlip = vi.fn();
    render(
      <FlipControl
        activeSide="original"
        isPlaying={false}
        onFlip={onFlip}
        onTogglePlay={vi.fn()}
      />,
    );
    expect(screen.getByText(/Hearing: ORIGINAL/)).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("flip-toggle"));
    expect(onFlip).toHaveBeenCalledTimes(1);
  });

  it("space toggles play/pause and 'a' flips, from the keyboard", async () => {
    const onFlip = vi.fn();
    const onTogglePlay = vi.fn();
    render(
      <FlipControl
        activeSide="master"
        isPlaying={false}
        onFlip={onFlip}
        onTogglePlay={onTogglePlay}
      />,
    );

    await userEvent.keyboard(" ");
    expect(onTogglePlay).toHaveBeenCalledTimes(1);

    await userEvent.keyboard("a");
    expect(onFlip).toHaveBeenCalledTimes(1);
  });

  it("ignores the shortcuts while a form field is focused", async () => {
    const onFlip = vi.fn();
    const onTogglePlay = vi.fn();
    render(
      <>
        <input type="number" aria-label="Target LUFS" />
        <FlipControl
          activeSide="master"
          isPlaying={false}
          onFlip={onFlip}
          onTogglePlay={onTogglePlay}
        />
      </>,
    );

    const input = screen.getByLabelText("Target LUFS");
    input.focus();
    await userEvent.keyboard(" ");
    await userEvent.keyboard("a");

    expect(onTogglePlay).not.toHaveBeenCalled();
    expect(onFlip).not.toHaveBeenCalled();
  });
});
