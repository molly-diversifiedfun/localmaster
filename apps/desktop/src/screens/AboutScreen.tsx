import { THIRD_PARTY_NOTICES_PLACEHOLDER } from "../lib/third-party-notices";
import { AppShell } from "../components/AppShell";
import { NEUTRAL_RAIL_STAGES } from "../components/SignalRail";

/** About/Notices screen: license + product statement + bundled third-party notices. */
export function AboutScreen() {
  return (
    <AppShell stages={NEUTRAL_RAIL_STAGES}>
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-[clamp(1.5rem,4vw,3rem)] py-10">
        <h1 className="text-lg font-semibold">About LocalMaster</h1>

        <p className="text-sm text-text-secondary">
          LocalMaster is deterministic, analysis-driven DSP — not AI mastering.
          Every parameter is an editable default you can see and change; nothing
          is a black box.
        </p>

        <p className="text-sm text-text-secondary">
          Licensed under the MIT License.
        </p>

        <div>
          <h2 className="mb-2 text-sm font-medium text-text-secondary">
            Third-party notices
          </h2>
          <pre
            className="whitespace-pre-wrap rounded-md border border-border bg-surface p-3 text-xs text-text-secondary"
            data-testid="third-party-notices"
          >
            {THIRD_PARTY_NOTICES_PLACEHOLDER}
          </pre>
        </div>
      </div>
    </AppShell>
  );
}
