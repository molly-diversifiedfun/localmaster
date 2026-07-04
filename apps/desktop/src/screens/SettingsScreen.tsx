import { useState } from "react";
import { pickDirectory } from "../lib/tauri";
import {
  loadSettings,
  updateSettings,
  ENGINE_PORT,
  SAMPLE_RATE_POLICY,
} from "../lib/settings";
import type { BitDepth } from "@shared/types";

const BIT_DEPTHS: BitDepth[] = [16, 24, 32];

/** Settings screen: default export folder, default bit depth, engine/network posture (read-only). */
export function SettingsScreen() {
  const [settings, setSettings] = useState(loadSettings());

  async function handlePickDefaultDir() {
    const dir = await pickDirectory();
    if (dir) setSettings(updateSettings({ defaultExportDir: dir }));
  }

  function handleBitDepthChange(bitDepth: BitDepth) {
    setSettings(updateSettings({ defaultBitDepth: bitDepth }));
  }

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-studio-text-dim">Default export folder</span>
        <button
          type="button"
          onClick={handlePickDefaultDir}
          className="w-fit rounded bg-studio-panel-raised px-3 py-1.5 text-left hover:text-studio-accent"
        >
          {settings.defaultExportDir ?? "Not set — choose per export"}
        </button>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-studio-text-dim">Default bit depth</span>
        <select
          value={settings.defaultBitDepth}
          onChange={(e) =>
            handleBitDepthChange(Number(e.target.value) as BitDepth)
          }
          className="w-32 rounded border border-studio-border bg-studio-panel-raised px-2 py-1"
        >
          {BIT_DEPTHS.map((depth) => (
            <option key={depth} value={depth}>
              {depth}-bit
            </option>
          ))}
        </select>
      </label>

      <div className="text-sm">
        <span className="text-studio-text-dim">Sample-rate policy: </span>
        <span className="capitalize">{SAMPLE_RATE_POLICY}</span> (output always
        matches input)
      </div>

      <div className="text-sm">
        <span className="text-studio-text-dim">Engine port: </span>
        <span className="font-mono">{ENGINE_PORT}</span> (loopback only,
        read-only)
      </div>

      <p className="rounded border border-studio-border bg-studio-panel p-3 text-sm text-studio-accent">
        No telemetry. 100% local processing. Nothing you master ever leaves this
        machine.
      </p>
    </div>
  );
}
