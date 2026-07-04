/** LocalStorage-persisted list of recently imported track paths. */

const RECENT_FILES_KEY = "localmaster.recentFiles.v1";
const MAX_RECENT = 10;

export function loadRecentFiles(): string[] {
  const raw = localStorage.getItem(RECENT_FILES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

export function addRecentFile(path: string): string[] {
  const existing = loadRecentFiles().filter((p) => p !== path);
  const updated = [path, ...existing].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(updated));
  return updated;
}

export function clearRecentFiles(): void {
  localStorage.removeItem(RECENT_FILES_KEY);
}
