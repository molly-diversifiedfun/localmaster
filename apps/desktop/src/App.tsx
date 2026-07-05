import { HashRouter, Routes, Route } from "react-router-dom";
import { AppStateProvider } from "./state/app-state";
import { InstrumentScreen } from "./screens/InstrumentScreen";
import { BatchScreen } from "./screens/BatchScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { AboutScreen } from "./screens/AboutScreen";

/**
 * HashRouter (not BrowserRouter) because the app is served from the
 * `tauri://` / `asset://` scheme in production, which has no server-side
 * history fallback for path-based routes.
 *
 * Routes are intentionally few: "/" is the single-flow instrument
 * (drop -> analyze -> master -> export); "/batch" is the album flow;
 * "/settings" and "/about" sit behind small icons at the signal rail's
 * foot, not primary navigation.
 */
export default function App() {
  return (
    <AppStateProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<InstrumentScreen />} />
          <Route path="/batch" element={<BatchScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="/about" element={<AboutScreen />} />
        </Routes>
      </HashRouter>
    </AppStateProvider>
  );
}
