import { useState } from "react";
import type { Preset, PresetOverrides } from "@shared/types";
import { PresetControlsPanel } from "./PresetControlsPanel";
import { ReferenceMatchControl } from "./ReferenceMatchControl";

interface AdjustDrawerProps {
  preset: Preset | null;
  overrides: PresetOverrides;
  onChange: (overrides: PresetOverrides) => void;
  referencePath: string | null;
  matchStrength: number;
  onReferenceChange: (path: string | null) => void;
  onStrengthChange: (strength: number) => void;
  /** True once the user has changed something since the last render — shows the Re-master CTA. */
  dirty: boolean;
  onRemaster: () => void;
}

/**
 * Progressive disclosure: collapsed by default so a user who never opens it
 * still gets a great result from the DJ-default preset. Opening it exposes
 * the existing override controls; changing anything surfaces "Re-master".
 */
export function AdjustDrawer({
  preset,
  overrides,
  onChange,
  referencePath,
  matchStrength,
  onReferenceChange,
  onStrengthChange,
  dirty,
  onRemaster,
}: AdjustDrawerProps) {
  const [open, setOpen] = useState(false);
  if (!preset) return null;

  return (
    <div
      className="rounded-md border border-border bg-surface"
      data-testid="adjust-drawer"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm text-text-secondary hover:text-text"
        aria-expanded={open}
      >
        <span>Adjust</span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="border-t border-border px-4 py-4">
          <ReferenceMatchControl
            referencePath={referencePath}
            matchStrength={matchStrength}
            onReferenceChange={onReferenceChange}
            onStrengthChange={onStrengthChange}
          />
          <div className="mt-4">
            <PresetControlsPanel
              preset={preset}
              overrides={overrides}
              onChange={onChange}
            />
          </div>
          {dirty && (
            <button
              type="button"
              onClick={onRemaster}
              data-testid="remaster-cta"
              className="mt-4 w-fit rounded-md bg-brand px-4 py-2 text-sm font-medium text-background hover:opacity-90"
            >
              Re-master
            </button>
          )}
        </div>
      )}
    </div>
  );
}
