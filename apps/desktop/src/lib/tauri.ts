/**
 * Thin wrappers around Tauri plugin APIs so the rest of the app never
 * imports `@tauri-apps/*` directly — keeps components mockable in tests
 * and isolates us from plugin API changes to one file.
 */
import { open } from "@tauri-apps/plugin-dialog";
import { open as openWithDefaultApp } from "@tauri-apps/plugin-shell";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
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

/** Artwork picker for TrackMetadataForm — release bundle cover art. */
export async function pickImageFile(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg"] }],
  });
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

/** DistroKid's new-release upload page — the ADR 003 fallback when no local
 * distribute plugin is configured in ~/.localmaster/plugins.json. */
export const DISTROKID_NEW_RELEASE_URL = "https://distrokid.com/new/";

export interface DistributePluginResult {
  pluginInvoked: boolean;
  pluginId: string | null;
}

/**
 * Runs the user's configured local distribute plugin (ADR 003 —
 * ~/.localmaster/plugins.json, a plugin id -> command map) against a
 * release bundle directory via the Rust `run_distribute_plugin` command.
 * When no plugin is configured, falls back to opening DistroKid's
 * new-release page in the OS default browser. A plugin spawn/exit failure
 * rejects (surfaced to the caller) instead of silently falling back.
 */
export async function runDistributePlugin(
  bundleDir: string,
): Promise<DistributePluginResult> {
  const result = await invoke<DistributePluginResult>("run_distribute_plugin", {
    bundleDir,
  });
  if (!result.pluginInvoked) {
    await openWithDefaultApp(DISTROKID_NEW_RELEASE_URL);
  }
  return result;
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
