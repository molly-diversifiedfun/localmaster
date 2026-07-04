import { HashRouter, Routes, Route } from "react-router-dom";
import { AppStateProvider } from "./state/app-state";
import { NavSidebar } from "./components/NavSidebar";
import { EngineStatusBanner } from "./components/EngineStatusBanner";
import { HomeImportScreen } from "./screens/HomeImportScreen";
import { AnalysisScreen } from "./screens/AnalysisScreen";
import { WorkspaceScreen } from "./screens/WorkspaceScreen";
import { BatchScreen } from "./screens/BatchScreen";
import { ExportScreen } from "./screens/ExportScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { AboutScreen } from "./screens/AboutScreen";

/**
 * HashRouter (not BrowserRouter) because the app is served from the
 * `tauri://` / `asset://` scheme in production, which has no server-side
 * history fallback for path-based routes.
 */
export default function App() {
  return (
    <AppStateProvider>
      <HashRouter>
        <div className="flex h-screen w-screen overflow-hidden">
          <NavSidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <EngineStatusBanner />
            <main className="flex-1 overflow-auto p-6">
              <Routes>
                <Route path="/" element={<HomeImportScreen />} />
                <Route path="/analysis" element={<AnalysisScreen />} />
                <Route path="/workspace" element={<WorkspaceScreen />} />
                <Route path="/batch" element={<BatchScreen />} />
                <Route path="/export" element={<ExportScreen />} />
                <Route path="/settings" element={<SettingsScreen />} />
                <Route path="/about" element={<AboutScreen />} />
              </Routes>
            </main>
          </div>
        </div>
      </HashRouter>
    </AppStateProvider>
  );
}
