import { useState } from "react";
import { pickDirectory } from "../lib/tauri";
import {
  loadSettings,
  updateSettings,
  ENGINE_PORT,
  SAMPLE_RATE_POLICY,
} from "../lib/settings";
import { AppShell } from "../components/AppShell";
import { NEUTRAL_RAIL_STAGES } from "../components/SignalRail";
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
    <AppShell stages={NEUTRAL_RAIL_STAGES}>
      <div className="mx-auto flex max-w-xl flex-col gap-6 px-[clamp(1.5rem,4vw,3rem)] py-10">
        <h1 className="text-lg font-semibold">Settings</h1>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-text-secondary">Default export folder</span>
          <button
            type="button"
            onClick={handlePickDefaultDir}
            className="w-fit rounded-md border border-border bg-surface px-3 py-1.5 text-left hover:text-brand"
          >
            {settings.defaultExportDir ?? "Not set — choose per export"}
          </button>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-text-secondary">Default bit depth</span>
          <select
            value={settings.defaultBitDepth}
            onChange={(e) =>
              handleBitDepthChange(Number(e.target.value) as BitDepth)
            }
            className="w-32 rounded-md border border-border bg-surface px-2 py-1"
          >
            {BIT_DEPTHS.map((depth) => (
              <option key={depth} value={depth}>
                {depth}-bit
              </option>
            ))}
          </select>
        </label>

        <div className="text-sm">
          <span className="text-text-secondary">Sample-rate policy: </span>
          <span className="capitalize">{SAMPLE_RATE_POLICY}</span> (output
          always matches input)
        </div>

        <div className="text-sm">
          <span className="text-text-secondary">Engine port: </span>
          <span className="font-mono">{ENGINE_PORT}</span> (loopback only,
          read-only)
        </div>

        <p className="rounded-md border border-border bg-surface p-3 text-sm text-brand">
          No telemetry. 100% local processing. Nothing you master ever leaves
          this machine.
        </p>
      </div>
    </AppShell>
  );
}
