import type { SpectralBalance } from "@shared/types";

const BAND_LABELS: Record<keyof SpectralBalance, string> = {
  low: "Low",
  low_mid: "Low-Mid",
  mid: "Mid",
  high_mid: "High-Mid",
  high: "High",
};

interface SpectralBalanceBarsProps {
  balance: SpectralBalance;
}

/** Renders the 5-band spectral energy share as a set of horizontal bars (fractions of 1.0). */
export function SpectralBalanceBars({ balance }: SpectralBalanceBarsProps) {
  return (
    <div className="flex flex-col gap-2" data-testid="spectral-balance-bars">
      {(Object.keys(BAND_LABELS) as (keyof SpectralBalance)[]).map((band) => (
        <div key={band} className="flex items-center gap-2 text-xs">
          <span className="w-16 text-studio-text-dim">{BAND_LABELS[band]}</span>
          <div className="h-2 flex-1 rounded bg-studio-panel-raised">
            <div
              className="h-2 rounded bg-studio-accent"
              style={{ width: `${Math.min(balance[band] * 100, 100)}%` }}
            />
          </div>
          <span className="w-10 text-right font-mono text-studio-text-dim">
            {(balance[band] * 100).toFixed(0)}%
          </span>
        </div>
      ))}
    </div>
  );
}
