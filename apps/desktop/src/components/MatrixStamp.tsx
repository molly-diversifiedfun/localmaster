interface MatrixStampProps {
  /** Measured values, e.g. ["-9.4 LUFS", "-1.1 dBTP", "24bit/48k"]. */
  values: string[];
  /** True for two beats after a fresh render result — brand green instead of quiet gray. */
  fresh?: boolean;
  className?: string;
}

/**
 * The signature element: every measured state renders as a stamped mono
 * block, like the matrix numbers etched into vinyl deadwax. Per the design
 * manifest (.design/localmaster-desktop.md) — wide-tracked IBM Plex Mono,
 * text-secondary at rest, brand green when the value is a fresh result.
 */
export function MatrixStamp({
  values,
  fresh = false,
  className,
}: MatrixStampProps) {
  return (
    <div
      data-testid="matrix-stamp"
      className={`font-mono text-xs uppercase tracking-wide transition-colors duration-base ease-default ${
        fresh ? "text-brand" : "text-text-secondary"
      } ${className ?? ""}`}
    >
      {values.join(" · ")}
    </div>
  );
}
