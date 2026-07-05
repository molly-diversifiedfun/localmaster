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
      <p className="text-sm text-error" data-testid="job-progress-error">
        Failed: {errorMessage ?? "Unknown error"}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1" data-testid="job-progress">
      <div className="flex justify-between font-mono text-xs uppercase tracking-wide text-text-secondary">
        <span>{stage ?? status}</span>
        <span>{Math.round(progress * 100)}%</span>
      </div>
      <div className="h-1.5 w-full rounded-md bg-background">
        <div
          className="h-1.5 rounded-md bg-brand transition-[width] duration-base ease-default"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
    </div>
  );
}
