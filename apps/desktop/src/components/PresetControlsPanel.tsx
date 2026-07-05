import type { Preset, PresetOverrides } from "@shared/types";

type NumericField = Extract<
  keyof Preset,
  | "target_lufs"
  | "ceiling_dbtp"
  | "gr_budget_db"
  | "comp_threshold_db"
  | "comp_ratio"
  | "comp_attack_ms"
  | "comp_release_ms"
  | "comp_knee_db"
  | "saturation_drive"
  | "saturation_mix"
  | "stereo_width"
  | "limiter_lookahead_ms"
  | "limiter_release_ms"
>;

interface FieldConfig {
  key: NumericField;
  label: string;
  step: number;
  group: "Loudness" | "Compressor" | "Character" | "Limiter";
}

const FIELDS: FieldConfig[] = [
  { key: "target_lufs", label: "Target LUFS", step: 0.5, group: "Loudness" },
  {
    key: "ceiling_dbtp",
    label: "Ceiling (dBTP)",
    step: 0.1,
    group: "Loudness",
  },
  {
    key: "gr_budget_db",
    label: "GR budget (dB)",
    step: 0.5,
    group: "Loudness",
  },
  {
    key: "comp_threshold_db",
    label: "Threshold (dB)",
    step: 0.5,
    group: "Compressor",
  },
  { key: "comp_ratio", label: "Ratio", step: 0.1, group: "Compressor" },
  { key: "comp_attack_ms", label: "Attack (ms)", step: 1, group: "Compressor" },
  {
    key: "comp_release_ms",
    label: "Release (ms)",
    step: 5,
    group: "Compressor",
  },
  { key: "comp_knee_db", label: "Knee (dB)", step: 0.5, group: "Compressor" },
  {
    key: "saturation_drive",
    label: "Saturation drive",
    step: 0.1,
    group: "Character",
  },
  {
    key: "saturation_mix",
    label: "Saturation mix",
    step: 0.05,
    group: "Character",
  },
  {
    key: "stereo_width",
    label: "Stereo width",
    step: 0.02,
    group: "Character",
  },
  {
    key: "limiter_lookahead_ms",
    label: "Lookahead (ms)",
    step: 0.5,
    group: "Limiter",
  },
  {
    key: "limiter_release_ms",
    label: "Release (ms)",
    step: 5,
    group: "Limiter",
  },
];

interface PresetControlsPanelProps {
  preset: Preset;
  overrides: PresetOverrides;
  onChange: (overrides: PresetOverrides) => void;
}

/** Right-panel editable preset fields; edited values are sent as `overrides` on /master and /export. */
export function PresetControlsPanel({
  preset,
  overrides,
  onChange,
}: PresetControlsPanelProps) {
  function setField(key: NumericField, value: number) {
    onChange({ ...overrides, [key]: value });
  }

  const groups = [...new Set(FIELDS.map((f) => f.group))];

  return (
    <div className="flex flex-col gap-4" data-testid="preset-controls-panel">
      {groups.map((group) => (
        <div key={group}>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
            {group}
          </h3>
          <div className="flex flex-col gap-2">
            {FIELDS.filter((f) => f.group === group).map((field) => {
              const value = overrides[field.key] ?? preset[field.key];
              return (
                <label
                  key={field.key}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <span className="text-text-secondary">{field.label}</span>
                  <input
                    type="number"
                    step={field.step}
                    value={value}
                    onChange={(e) =>
                      setField(field.key, Number(e.target.value))
                    }
                    className="w-20 rounded-md border border-border bg-background px-1.5 py-0.5 text-right font-mono text-text"
                  />
                </label>
              );
            })}
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange({})}
        className="w-fit text-xs text-text-secondary underline hover:text-text"
      >
        Reset to preset defaults
      </button>
    </div>
  );
}
