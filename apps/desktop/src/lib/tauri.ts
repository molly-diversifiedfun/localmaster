/**
 * Thin wrappers around Tauri plugin APIs so the rest of the app never
 * imports `@tauri-apps/*` directly — keeps components mockable in tests
 * and isolates us from plugin API changes to one file.
 */
import { open } from "@tauri-apps/plugin-dialog";
import { open as openWithDefaultApp } from "@tauri-apps/plugin-shell";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";

export async function pickWavFile(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    filters: [{ name: "Audio", extensions: ["wav"] }],
  });
  return typeof selected === "string" ? selected : null;
}

export async function pickWavFiles(): Promise<string[]> {
  const selected = await open({
    multiple: true,
    filters: [{ name: "Audio", extensions: ["wav"] }],
  });
  if (!selected) return [];
  return Array.isArray(selected) ? selected : [selected];
}

export async function pickDirectory(): Promise<string | null> {
  const selected = await open({ directory: true, multiple: false });
  return typeof selected === "string" ? selected : null;
}

/** Local file path -> a URL the webview's <audio>/<img> tags can load. */
export function toPlayableUrl(localPath: string): string {
  return convertFileSrc(localPath);
}

/** Opens a local file with the OS default handler (e.g. a report .txt/.json). */
export async function openInDefaultApp(path: string): Promise<void> {
  await openWithDefaultApp(path);
}

/**
 * Native OS file drops (Finder drag-and-drop) don't expose real filesystem
 * paths through the browser's HTML5 DataTransfer API in a webview for
 * security reasons — Tauri surfaces them via a window-level event instead.
 * Returns an unlisten function.
 */
export async function subscribeToFileDrop(
  onDrop: (paths: string[]) => void,
): Promise<() => void> {
  const webview = getCurrentWebview();
  return webview.onDragDropEvent((event) => {
    if (event.payload.type === "drop") {
      onDrop(event.payload.paths);
    }
  });
}
