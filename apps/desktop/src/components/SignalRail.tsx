import { Link } from "react-router-dom";
import type { RailStageId, RailStatus } from "../state/flow-state";

export interface RailStageItem {
  id: RailStageId;
  label: string;
  status: RailStatus;
}

/** Rail with every stage pending — used on Settings/About, which sit outside the flow. */
export const NEUTRAL_RAIL_STAGES: RailStageItem[] = [
  { id: "import", label: "Import", status: "pending" },
  { id: "analyze", label: "Analyze", status: "pending" },
  { id: "master", label: "Master", status: "pending" },
  { id: "export", label: "Export", status: "pending" },
];

function dotClasses(status: RailStatus): string {
  if (status === "done") return "bg-brand";
  if (status === "active") return "bg-brand opacity-70";
  return "bg-border";
}

function labelClasses(status: RailStatus): string {
  return status === "pending"
    ? "text-text-secondary/60"
    : "text-text-secondary";
}

/**
 * The left-weighted signal rail (layout.concept in the design manifest):
 * fixed, narrow, never centers. Shows the four linear stages of the
 * mastering flow — Import, Analyze, Master, Export — plus Settings/About
 * as small icons at the foot, per the "one signal path" anti-default.
 */
export function SignalRail({ stages }: { stages: RailStageItem[] }) {
  return (
    <nav
      className="flex w-20 shrink-0 flex-col items-center justify-between border-r border-border bg-surface py-4"
      data-testid="signal-rail"
    >
      <div className="flex flex-col items-center gap-8">
        <Link
          to="/"
          aria-label="LocalMaster — back to the current track"
          className="font-mono text-xs tracking-wide text-text-secondary hover:text-brand"
        >
          LM
        </Link>
        <ol className="flex flex-col gap-6">
          {stages.map((stage) => (
            <li
              key={stage.id}
              data-testid={`rail-stage-${stage.id}`}
              className="flex flex-col items-center gap-1.5"
            >
              <span
                className={`h-2 w-2 rounded-full transition-colors duration-slow ease-default ${dotClasses(stage.status)}`}
              />
              <span
                className={`text-[10px] font-medium uppercase tracking-wide transition-colors duration-slow ease-default ${labelClasses(stage.status)}`}
              >
                {stage.label}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex flex-col items-center gap-4">
        <Link
          to="/settings"
          aria-label="Settings"
          className="text-text-secondary hover:text-text"
        >
          <GearIcon />
        </Link>
        <Link
          to="/about"
          aria-label="About"
          className="font-mono text-xs text-text-secondary hover:text-text"
        >
          i
        </Link>
      </div>
    </nav>
  );
}

function GearIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="2.4" />
      <path d="M8 1.5v1.4M8 13.1v1.4M14.5 8h-1.4M2.9 8H1.5M12.5 3.5l-1 1M4.5 11.5l-1 1M12.5 12.5l-1-1M4.5 4.5l-1-1" />
    </svg>
  );
}
