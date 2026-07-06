import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: vi.fn((p: string) => p),
}));
vi.mock("@tauri-apps/plugin-shell", () => ({
  open: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));
vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { open as openWithDefaultApp } from "@tauri-apps/plugin-shell";
import { runDistributePlugin, DISTROKID_NEW_RELEASE_URL } from "./tauri";

describe("runDistributePlugin", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(openWithDefaultApp).mockReset();
  });

  it("invokes the Rust command with the bundle dir and does not open a fallback URL when a plugin ran", async () => {
    vi.mocked(invoke).mockResolvedValue({
      pluginInvoked: true,
      pluginId: "distrokid-uploader",
    });

    const result = await runDistributePlugin("/out/release_bundle");

    expect(invoke).toHaveBeenCalledWith("run_distribute_plugin", {
      bundleDir: "/out/release_bundle",
    });
    expect(result).toEqual({
      pluginInvoked: true,
      pluginId: "distrokid-uploader",
    });
    expect(openWithDefaultApp).not.toHaveBeenCalled();
  });

  it("opens the DistroKid new-release page when no plugin is configured", async () => {
    vi.mocked(invoke).mockResolvedValue({
      pluginInvoked: false,
      pluginId: null,
    });

    const result = await runDistributePlugin("/out/release_bundle");

    expect(openWithDefaultApp).toHaveBeenCalledWith(DISTROKID_NEW_RELEASE_URL);
    expect(result.pluginInvoked).toBe(false);
  });

  it("propagates a rejected invoke (plugin spawn/exit failure) without opening the fallback", async () => {
    vi.mocked(invoke).mockRejectedValue(
      "Plugin 'distrokid-uploader' exited with an error (code 1)",
    );

    await expect(runDistributePlugin("/out/release_bundle")).rejects.toBe(
      "Plugin 'distrokid-uploader' exited with an error (code 1)",
    );
    expect(openWithDefaultApp).not.toHaveBeenCalled();
  });
});
