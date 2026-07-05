import type { Preset } from "@shared/types";

const DJ_DEFAULT_ID = "clean_dj";

interface PresetRowProps {
  presets: Preset[];
  selectedPresetId: string | null;
  onSelect: (presetId: string) => void;
}

/**
 * The 7 mastering presets as a row of cards (not a list) — Clean DJ Master
 * is preselected and labeled "DJ default". Replaces the old vertical
 * PresetSelector list now that the whole app is a single-flow instrument.
 */
export function PresetRow({
  presets,
  selectedPresetId,
  onSelect,
}: PresetRowProps) {
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
      data-testid="preset-selector"
    >
      {presets.map((preset) => {
        const isSelected = preset.id === selectedPresetId;
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => onSelect(preset.id)}
            className={`flex flex-col gap-1 rounded-md border px-4 py-3 text-left transition-colors duration-base ease-default ${
              isSelected
                ? "border-brand bg-brand/10"
                : "border-border bg-surface hover:border-text-secondary"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-text">
                {preset.name}
              </span>
              {preset.id === DJ_DEFAULT_ID && (
                <span className="font-mono text-[10px] uppercase tracking-wide text-text-secondary">
                  DJ default
                </span>
              )}
            </div>
            <p className="text-xs text-text-secondary">{preset.description}</p>
          </button>
        );
      })}
    </div>
  );
}
