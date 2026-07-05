import { useEffect, useState } from "react";
import { pickWavFiles, subscribeToFileDrop } from "../lib/tauri";
import { basename } from "../lib/format";

interface DropSurfaceProps {
  /** One path = single-track flow; more than one = hand off to the batch/album flow. */
  onFilesSelected: (paths: string[]) => void;
  recentFiles: string[];
  onSelectRecent: (path: string) => void;
  error?: string | null;
}

/**
 * LAUNCH screen: the app opens ready to receive a file — no dashboard, no
 * nav-first. Full-window drop affordance + recent files + (via AppShell)
 * engine status. Dropping/choosing more than one file routes to the
 * batch/album flow instead of this single-track flow.
 */
export function DropSurface({
  onFilesSelected,
  recentFiles,
  onSelectRecent,
  error,
}: DropSurfaceProps) {
  const [isDragActive, setIsDragActive] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    subscribeToFileDrop((paths) => {
      setIsDragActive(false);
      const wavs = paths.filter((p) => p.toLowerCase().endsWith(".wav"));
      if (wavs.length > 0) onFilesSelected(wavs);
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {
        /* Not running inside a Tauri webview (e.g. `vite dev` in a browser) — drop disabled. */
      });
    return () => unlisten?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleBrowse() {
    const paths = await pickWavFiles();
    if (paths.length > 0) onFilesSelected(paths);
  }

  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-8 px-[clamp(1.5rem,4vw,3rem)]"
      data-testid="drop-surface"
    >
      <div
        data-testid="drop-zone"
        onDragEnter={(e) => {
          e.preventDefault();
          setIsDragActive(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setIsDragActive(false)}
        onDrop={(e) => e.preventDefault()}
        className={`flex h-64 w-full max-w-2xl flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed transition-colors duration-base ease-default ${
          isDragActive ? "border-brand bg-brand/5" : "border-border bg-surface"
        }`}
      >
        <p className="text-lg text-text">Drop a WAV to master it</p>
        <button
          type="button"
          onClick={handleBrowse}
          className="rounded-md bg-brand px-5 py-2.5 text-sm font-medium text-background hover:opacity-90"
        >
          Choose file(s)…
        </button>
        <p className="text-xs text-text-secondary">
          Drop more than one file for an album batch
        </p>
      </div>

      {error && (
        <p className="text-sm text-error" data-testid="drop-error">
          {error}
        </p>
      )}

      {recentFiles.length > 0 && (
        <div className="w-full max-w-2xl">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
            Recent
          </h2>
          <ul className="flex flex-col gap-1" data-testid="recent-files-list">
            {recentFiles.map((path) => (
              <li key={path}>
                <button
                  type="button"
                  onClick={() => onSelectRecent(path)}
                  className="w-full truncate rounded-md px-2 py-1.5 text-left text-sm text-text hover:bg-background"
                  title={path}
                >
                  {basename(path)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
