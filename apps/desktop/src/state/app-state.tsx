import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  AnalysisReport,
  MasterJobResult,
  Preset,
  PresetOverrides,
} from "@shared/types";

export interface AppState {
  currentPath: string | null;
  setCurrentPath: (path: string | null) => void;
  analysis: AnalysisReport | null;
  setAnalysis: (analysis: AnalysisReport | null) => void;
  presets: Preset[];
  setPresets: (presets: Preset[]) => void;
  selectedPresetId: string | null;
  setSelectedPresetId: (id: string | null) => void;
  overrides: PresetOverrides;
  setOverrides: (overrides: PresetOverrides) => void;
  masterResult: MasterJobResult | null;
  setMasterResult: (result: MasterJobResult | null) => void;
}

const AppStateContext = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisReport | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<PresetOverrides>({});
  const [masterResult, setMasterResult] = useState<MasterJobResult | null>(
    null,
  );

  const value = useMemo<AppState>(
    () => ({
      currentPath,
      setCurrentPath,
      analysis,
      setAnalysis,
      presets,
      setPresets,
      selectedPresetId,
      setSelectedPresetId,
      overrides,
      setOverrides,
      masterResult,
      setMasterResult,
    }),
    [currentPath, analysis, presets, selectedPresetId, overrides, masterResult],
  );

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider");
  return ctx;
}
