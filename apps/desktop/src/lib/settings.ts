/** LocalStorage-persisted user settings. Everything here stays on-device. */
import type { BitDepth } from "@shared/types";

export interface AppSettings {
  defaultExportDir: string | null;
  defaultBitDepth: BitDepth;
}

const SETTINGS_KEY = "localmaster.settings.v1";
export const ENGINE_PORT = 48750;
export const SAMPLE_RATE_POLICY = "preserve";

export const DEFAULT_SETTINGS: AppSettings = {
  defaultExportDir: null,
  defaultBitDepth: 24,
};

export function loadSettings(): AppSettings {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return DEFAULT_SETTINGS;
  try {
    return {
      ...DEFAULT_SETTINGS,
      ...(JSON.parse(raw) as Partial<AppSettings>),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): AppSettings {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  return settings;
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  return saveSettings({ ...loadSettings(), ...patch });
}
