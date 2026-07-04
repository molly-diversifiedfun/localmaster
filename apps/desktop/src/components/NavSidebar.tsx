import { NavLink } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/", label: "Import", end: true },
  { to: "/analysis", label: "Analysis" },
  { to: "/workspace", label: "Workspace" },
  { to: "/batch", label: "Batch / Album" },
  { to: "/export", label: "Export" },
  { to: "/settings", label: "Settings" },
  { to: "/about", label: "About" },
];

/** Left rail navigation between the 7 MVP screens. */
export function NavSidebar() {
  return (
    <nav className="flex w-44 shrink-0 flex-col gap-1 border-r border-studio-border bg-studio-panel p-3">
      <div className="mb-3 px-2 text-sm font-semibold tracking-wide text-studio-text">
        LocalMaster
      </div>
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `rounded px-2 py-1.5 text-sm ${
              isActive
                ? "bg-studio-panel-raised text-studio-accent"
                : "text-studio-text-dim hover:text-studio-text"
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
