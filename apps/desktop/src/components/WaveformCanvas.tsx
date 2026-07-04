import { useEffect, useRef } from "react";
import type { WaveformBin } from "@shared/types";

interface WaveformCanvasProps {
  bins: WaveformBin[];
  color?: string;
  height?: number;
  className?: string;
}

/** Renders precomputed [min,max] envelope bins to a canvas — no audio decoding in the UI. */
export function WaveformCanvas({
  bins,
  color = "#5ee6c8",
  height = 96,
  className,
}: WaveformCanvasProps) {
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

    if (bins.length === 0) return;

    const mid = height / 2;
    const scale = height / 2;
    ctx.fillStyle = color;
    const step = width / bins.length;

    bins.forEach((bin, i) => {
      const [min, max] = bin;
      const x = i * step;
      const yTop = mid - max * scale;
      const yBottom = mid - min * scale;
      ctx.fillRect(x, yTop, Math.max(step, 1), Math.max(yBottom - yTop, 1));
    });
  }, [bins, color, height]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="waveform-canvas"
      className={className ?? "w-full"}
      style={{ height }}
    />
  );
}
