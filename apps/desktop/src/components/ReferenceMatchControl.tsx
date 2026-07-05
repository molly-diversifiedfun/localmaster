import type { ChangeEvent } from "react";
import { pickWavFile } from "../lib/tauri";
import { basename } from "../lib/format";

interface ReferenceMatchControlProps {
  referencePath: string | null;
  /** 0..1, mapped to/from the 0-100% slider. */
  matchStrength: number;
  onReferenceChange: (path: string | null) => void;
  onStrengthChange: (strength: number) => void;
}

/**
 * Picker + strength slider + clear affordance for reference-matching,
 * rendered inside AdjustDrawer above PresetControlsPanel. Reference state
 * lives in shared app-state (mirrors `overrides`) and flows to /master and
 * /export exactly like preset overrides.
 */
export function ReferenceMatchControl({
  referencePath,
  matchStrength,
  onReferenceChange,
  onStrengthChange,
}: ReferenceMatchControlProps) {
  async function handlePick() {
    const path = await pickWavFile();
    if (path) onReferenceChange(path);
  }

  function handleStrengthInput(e: ChangeEvent<HTMLInputElement>) {
    if (!referencePath) return; // defense-in-depth: slider is also disabled
    onStrengthChange(Number(e.target.value) / 100);
  }

  const percent = Math.round(matchStrength * 100);

  return (
    <div className="flex flex-col gap-2" data-testid="reference-match-control">
      {referencePath ? (
        <div className="flex items-center justify-between gap-2">
          <span
            title={referencePath}
            className="truncate font-mono text-xs uppercase tracking-wide text-text-secondary"
          >
            {basename(referencePath)}
          </span>
          <button
            type="button"
            onClick={() => onReferenceChange(null)}
            data-testid="reference-clear"
            className="text-xs text-text-secondary underline hover:text-text"
          >
            Clear
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handlePick}
          className="w-fit rounded-md border border-border px-3 py-1.5 text-xs text-text-secondary hover:text-text"
        >
          Match a reference…
        </button>
      )}

      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="text-text-secondary">Match strength</span>
        <span className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={percent}
            disabled={!referencePath}
            onChange={handleStrengthInput}
            data-testid="reference-strength-slider"
          />
          <span className="w-10 text-right font-mono text-text-secondary">
            {percent}%
          </span>
        </span>
      </label>
    </div>
  );
}
