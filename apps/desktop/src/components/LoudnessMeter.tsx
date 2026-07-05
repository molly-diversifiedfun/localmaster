interface LoudnessMeterProps {
  label: string;
  value: number;
  unit: string;
  /** Value range this meter bar represents, e.g. [-30, 0] dB. */
  min: number;
  max: number;
  targetValue?: number;
}

/** Horizontal bar meter for a single loudness/peak reading, with an optional target tick. */
export function LoudnessMeter({
  label,
  value,
  unit,
  min,
  max,
  targetValue,
}: LoudnessMeterProps) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const toPct = (v: number) => ((clamp(v) - min) / (max - min)) * 100;
  const valuePct = toPct(value);
  const targetPct = targetValue !== undefined ? toPct(targetValue) : null;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs uppercase tracking-wide text-text-secondary">
        <span>{label}</span>
        <span className="font-mono text-text">
          {value.toFixed(1)} {unit}
        </span>
      </div>
      <div className="relative h-3 w-full rounded-md bg-background">
        <div
          className="absolute inset-y-0 left-0 rounded-md bg-brand transition-[width] duration-base ease-default"
          style={{ width: `${valuePct}%` }}
        />
        {targetPct !== null && (
          <div
            className="absolute inset-y-0 w-0.5 bg-warning"
            style={{ left: `${targetPct}%` }}
            data-testid="loudness-target-tick"
          />
        )}
      </div>
    </div>
  );
}
