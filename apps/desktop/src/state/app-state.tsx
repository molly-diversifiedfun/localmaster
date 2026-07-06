import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  AnalysisReport,
  ExportProfile,
  MasterJobResult,
  Preset,
  PresetOverrides,
  TrackMetadata,
} from "@shared/types";
import { EMPTY_TRACK_METADATA } from "../components/TrackMetadataForm";

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
  referencePath: string | null;
  setReferencePath: (path: string | null) => void;
  matchStrength: number;
  setMatchStrength: (strength: number) => void;
  masterResult: MasterJobResult | null;
  setMasterResult: (result: MasterJobResult | null) => void;
  exportProfile: ExportProfile;
  setExportProfile: (profile: ExportProfile) => void;
  trackMetadata: TrackMetadata;
  setTrackMetadata: (metadata: TrackMetadata) => void;
}

/** Contract's conservative default — reference-matching stage strength. */
export const DEFAULT_MATCH_STRENGTH = 0.35;

/** Export profile defaults to "dj" — release is an explicit opt-in (ADR 003). */
export const DEFAULT_EXPORT_PROFILE: ExportProfile = "dj";

const AppStateContext = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisReport | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<PresetOverrides>({});
  const [referencePath, setReferencePath] = useState<string | null>(null);
  const [matchStrength, setMatchStrength] = useState<number>(
    DEFAULT_MATCH_STRENGTH,
  );
  const [masterResult, setMasterResult] = useState<MasterJobResult | null>(
    null,
  );
  const [exportProfile, setExportProfile] = useState<ExportProfile>(
    DEFAULT_EXPORT_PROFILE,
  );
  const [trackMetadata, setTrackMetadata] =
    useState<TrackMetadata>(EMPTY_TRACK_METADATA);

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
      referencePath,
      setReferencePath,
      matchStrength,
      setMatchStrength,
      masterResult,
      setMasterResult,
      exportProfile,
      setExportProfile,
      trackMetadata,
      setTrackMetadata,
    }),
    [
      currentPath,
      analysis,
      presets,
      selectedPresetId,
      overrides,
      referencePath,
      matchStrength,
      masterResult,
      exportProfile,
      trackMetadata,
    ],
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
