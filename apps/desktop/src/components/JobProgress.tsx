interface JobProgressProps {
  status: "idle" | "queued" | "running" | "done" | "error";
  progress: number;
  stage: string | null;
  errorMessage?: string | null;
}

/** Progress bar + stage label for an in-flight engine job (master/export/analyze). */
export function JobProgress({
  status,
  progress,
  stage,
  errorMessage,
}: JobProgressProps) {
  if (status === "idle") return null;

  if (status === "error") {
    return (
      <p
        className="text-sm text-studio-danger"
        data-testid="job-progress-error"
      >
        Failed: {errorMessage ?? "Unknown error"}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1" data-testid="job-progress">
      <div className="flex justify-between text-xs text-studio-text-dim">
        <span>{stage ?? status}</span>
        <span>{Math.round(progress * 100)}%</span>
      </div>
      <div className="h-1.5 w-full rounded bg-studio-panel-raised">
        <div
          className="h-1.5 rounded bg-studio-accent transition-[width]"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
    </div>
  );
}
