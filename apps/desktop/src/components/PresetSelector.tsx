import type { Preset } from "@shared/types";

interface PresetSelectorProps {
  presets: Preset[];
  selectedPresetId: string | null;
  onSelect: (presetId: string) => void;
}

/** Left-panel list of the 7 mastering presets. */
export function PresetSelector({
  presets,
  selectedPresetId,
  onSelect,
}: PresetSelectorProps) {
  return (
    <ul className="flex flex-col gap-1" data-testid="preset-selector">
      {presets.map((preset) => (
        <li key={preset.id}>
          <button
            type="button"
            onClick={() => onSelect(preset.id)}
            className={`w-full rounded px-2 py-2 text-left text-sm ${
              selectedPresetId === preset.id
                ? "bg-studio-panel-raised text-studio-accent"
                : "text-studio-text-dim hover:text-studio-text"
            }`}
          >
            <div className="font-medium">{preset.name}</div>
            <div className="text-xs opacity-80">{preset.description}</div>
          </button>
        </li>
      ))}
    </ul>
  );
}
