import { THIRD_PARTY_NOTICES_PLACEHOLDER } from "../lib/third-party-notices";

/** About/Notices screen: license + product statement + bundled third-party notices. */
export function AboutScreen() {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-xl font-semibold">About LocalMaster</h1>

      <p className="text-sm text-studio-text-dim">
        LocalMaster is deterministic, analysis-driven DSP — not AI mastering.
        Every parameter is an editable default you can see and change; nothing
        is a black box.
      </p>

      <p className="text-sm text-studio-text-dim">
        Licensed under the MIT License.
      </p>

      <div>
        <h2 className="mb-2 text-sm font-medium text-studio-text-dim">
          Third-party notices
        </h2>
        <pre
          className="whitespace-pre-wrap rounded border border-studio-border bg-studio-panel p-3 text-xs text-studio-text-dim"
          data-testid="third-party-notices"
        >
          {THIRD_PARTY_NOTICES_PLACEHOLDER}
        </pre>
      </div>
    </div>
  );
}
