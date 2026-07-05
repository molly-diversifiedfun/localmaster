import { useEffect } from "react";
import type { AbSide } from "../lib/ab-gain";

interface FlipControlProps {
  activeSide: AbSide;
  isPlaying: boolean;
  onFlip: () => void;
  onTogglePlay: () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/**
 * Big flip control for the volume-matched A/B: shows which side is playing,
 * flips on click, and honors the keyboard shortcuts (space = play/pause,
 * A = flip) from anywhere except a focused form field.
 */
export function FlipControl({
  activeSide,
  isPlaying,
  onFlip,
  onTogglePlay,
}: FlipControlProps) {
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.code === "Space") {
        e.preventDefault();
        onTogglePlay();
      } else if (e.key.toLowerCase() === "a") {
        onFlip();
      }
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [onFlip, onTogglePlay]);

  return (
    <div className="flex items-center gap-3" data-testid="flip-control">
      <button
        type="button"
        onClick={onTogglePlay}
        className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text hover:text-brand"
      >
        {isPlaying ? "Pause" : "Play"}
      </button>
      <button
        type="button"
        onClick={onFlip}
        data-testid="flip-toggle"
        className={`rounded-md px-4 py-2 text-sm font-medium transition-colors duration-base ease-default ${
          activeSide === "master"
            ? "bg-brand text-background"
            : "border border-border bg-surface text-text"
        }`}
      >
        Hearing: {activeSide === "master" ? "MASTER" : "ORIGINAL"}
        <span className="ml-2 text-xs opacity-70">
          space to play · A to flip
        </span>
      </button>
    </div>
  );
}
