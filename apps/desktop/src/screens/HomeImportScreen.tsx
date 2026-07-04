import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppState } from "../state/app-state";
import { pickWavFile, subscribeToFileDrop } from "../lib/tauri";
import { addRecentFile, loadRecentFiles } from "../lib/recent-files";
import { basename } from "../lib/format";

/** Home/Import screen: pick a WAV via native dialog or drag-and-drop, or reopen a recent file. */
export function HomeImportScreen() {
  const navigate = useNavigate();
  const { setCurrentPath, setAnalysis } = useAppState();
  const [recentFiles, setRecentFiles] = useState<string[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);

  useEffect(() => {
    setRecentFiles(loadRecentFiles());
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    subscribeToFileDrop((paths) => {
      setIsDragActive(false);
      const wav = paths.find((p) => p.toLowerCase().endsWith(".wav"));
      if (wav) selectTrack(wav);
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

  function selectTrack(path: string) {
    setCurrentPath(path);
    setAnalysis(null);
    setRecentFiles(addRecentFile(path));
    navigate("/analysis");
  }

  async function handleBrowse() {
    const path = await pickWavFile();
    if (path) selectTrack(path);
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-xl font-semibold">Import a track</h1>

      <div
        data-testid="drop-zone"
        onDragEnter={(e) => {
          e.preventDefault();
          setIsDragActive(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setIsDragActive(false)}
        onDrop={(e) => e.preventDefault()}
        className={`flex h-40 flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
          isDragActive
            ? "border-studio-accent bg-studio-accent/10"
            : "border-studio-border bg-studio-panel"
        }`}
      >
        <p className="text-sm text-studio-text-dim">Drag a WAV file here</p>
        <button
          type="button"
          onClick={handleBrowse}
          className="rounded bg-studio-accent px-4 py-2 text-sm font-medium text-studio-bg hover:opacity-90"
        >
          Choose WAV file…
        </button>
      </div>

      {recentFiles.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-medium text-studio-text-dim">
            Recent
          </h2>
          <ul className="flex flex-col gap-1" data-testid="recent-files-list">
            {recentFiles.map((path) => (
              <li key={path}>
                <button
                  type="button"
                  onClick={() => selectTrack(path)}
                  className="w-full truncate rounded px-2 py-1.5 text-left text-sm text-studio-text hover:bg-studio-panel-raised"
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
