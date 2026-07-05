import { useEffect, useRef } from "react";
import type { WaveformBin } from "@shared/types";

const ORIGINAL_COLOR = "#99A49E"; // text-secondary — neutral gray
const MASTER_COLOR = "#42D799"; // brand signal green
const PLAYHEAD_COLOR = "#E9EDEB"; // text
const MASTER_ALPHA = 0.6;

interface AbCompareHeroProps {
  originalBins: WaveformBin[];
  masterBins: WaveformBin[];
  currentTime: number;
  duration: number;
  onSeek: (fraction: number) => void;
  height?: number;
}

function drawLayer(
  ctx: CanvasRenderingContext2D,
  bins: WaveformBin[],
  width: number,
  height: number,
  color: string,
  alpha: number,
) {
  if (bins.length === 0) return;
  const mid = height / 2;
  const scale = height / 2;
  const step = width / bins.length;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  bins.forEach((bin, i) => {
    const [min, max] = bin;
    const x = i * step;
    const yTop = mid - max * scale;
    const yBottom = mid - min * scale;
    ctx.fillRect(x, yTop, Math.max(step, 1), Math.max(yBottom - yTop, 1));
  });
  ctx.globalAlpha = 1;
}

/**
 * RESULT hero: original waveform in neutral gray, master overlaid in brand
 * green at ~60% alpha, click-to-seek, playhead line — the volume-matched
 * A/B compare visual (design manifest: layout.concept, signature_element).
 */
export function AbCompareHero({
  originalBins,
  masterBins,
  currentTime,
  duration,
  onSeek,
  height = 220,
}: AbCompareHeroProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.clientWidth || canvas.width;
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);

    drawLayer(ctx, originalBins, width, height, ORIGINAL_COLOR, 1);
    drawLayer(ctx, masterBins, width, height, MASTER_COLOR, MASTER_ALPHA);

    if (duration > 0) {
      const x = (currentTime / duration) * width;
      ctx.fillStyle = PLAYHEAD_COLOR;
      ctx.fillRect(x - 1, 0, 2, height);
    }
  }, [originalBins, masterBins, currentTime, duration, height]);

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
    onSeek(fraction);
  }

  return (
    <canvas
      ref={canvasRef}
      data-testid="ab-compare-hero"
      onClick={handleClick}
      className="w-full cursor-pointer"
      style={{ height }}
    />
  );
}
