import type { ReactNode } from "react";
import { SignalRail, type RailStageItem } from "./SignalRail";
import { EngineStatusBanner } from "./EngineStatusBanner";

interface AppShellProps {
  stages: RailStageItem[];
  children: ReactNode;
  /** Pinned bottom region — the Export bar once a master exists. */
  footer?: ReactNode;
}

/** Shared page chrome: the signal rail on the left, engine status banner, scrollable content, optional pinned footer. */
export function AppShell({ stages, children, footer }: AppShellProps) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-text">
      <SignalRail stages={stages} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <EngineStatusBanner />
        <main className="flex-1 overflow-auto">{children}</main>
        {footer}
      </div>
    </div>
  );
}
