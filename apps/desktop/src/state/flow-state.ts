/**
 * The single-track mastering flow, modeled as a linear state machine:
 * drop -> analyzing -> track -> mastering -> result -> exporting -> exported.
 * Kept framework-free so it's testable without mounting React, and so the
 * left signal rail can derive its stage indicators from one source of truth.
 */

export type FlowStage =
  | "drop"
  | "analyzing"
  | "track"
  | "mastering"
  | "result"
  | "exporting"
  | "exported";

export type FlowErrorSource = "analysis" | "master" | "export" | null;

export interface FlowState {
  stage: FlowStage;
  error: string | null;
  errorSource: FlowErrorSource;
  progress: number;
  jobStageLabel: string | null;
}

export type FlowAction =
  | { type: "DROP_FILE" }
  | { type: "ANALYSIS_SUCCESS" }
  | { type: "ANALYSIS_ERROR"; message: string }
  | { type: "START_MASTER" }
  | { type: "MASTER_PROGRESS"; progress: number; stageLabel: string | null }
  | { type: "MASTER_SUCCESS" }
  | { type: "MASTER_ERROR"; message: string; hadMasterResult: boolean }
  | { type: "START_EXPORT" }
  | { type: "EXPORT_PROGRESS"; progress: number; stageLabel: string | null }
  | { type: "EXPORT_SUCCESS" }
  | { type: "EXPORT_ERROR"; message: string }
  | { type: "RESET" };

export const initialFlowState: FlowState = {
  stage: "drop",
  error: null,
  errorSource: null,
  progress: 0,
  jobStageLabel: null,
};

/**
 * Recovers the correct stage on remount (e.g. returning from Settings/About)
 * from what's already in shared app state, instead of always restarting at
 * "drop" and losing a track the user already analyzed or mastered.
 */
export function deriveInitialStage(
  hasAnalysis: boolean,
  hasMasterResult: boolean,
): FlowStage {
  if (hasMasterResult) return "result";
  if (hasAnalysis) return "track";
  return "drop";
}

export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case "DROP_FILE":
      return { ...initialFlowState, stage: "analyzing" };
    case "ANALYSIS_SUCCESS":
      return { ...state, stage: "track", error: null, errorSource: null };
    case "ANALYSIS_ERROR":
      return {
        ...state,
        stage: "drop",
        error: action.message,
        errorSource: "analysis",
      };
    case "START_MASTER":
      return {
        ...state,
        stage: "mastering",
        error: null,
        errorSource: null,
        progress: 0,
        jobStageLabel: null,
      };
    case "MASTER_PROGRESS":
      return {
        ...state,
        progress: action.progress,
        jobStageLabel: action.stageLabel,
      };
    case "MASTER_SUCCESS":
      return { ...state, stage: "result", error: null, errorSource: null };
    case "MASTER_ERROR":
      // A failed RE-master must not evict a still-valid earlier result:
      // fall back to "result" when one exists, "track" only on first failure.
      return {
        ...state,
        stage: action.hadMasterResult ? "result" : "track",
        error: action.message,
        errorSource: "master",
      };
    case "START_EXPORT":
      return {
        ...state,
        stage: "exporting",
        error: null,
        errorSource: null,
        progress: 0,
        jobStageLabel: null,
      };
    case "EXPORT_PROGRESS":
      return {
        ...state,
        progress: action.progress,
        jobStageLabel: action.stageLabel,
      };
    case "EXPORT_SUCCESS":
      return { ...state, stage: "exported", error: null, errorSource: null };
    case "EXPORT_ERROR":
      return {
        ...state,
        stage: "result",
        error: action.message,
        errorSource: "export",
      };
    case "RESET":
      return initialFlowState;
    default:
      return state;
  }
}

export type RailStatus = "pending" | "active" | "done";
export type RailStageId = "import" | "analyze" | "master" | "export";

const STAGE_ORDER: FlowStage[] = [
  "drop",
  "analyzing",
  "track",
  "mastering",
  "result",
  "exporting",
  "exported",
];

/** Maps the flow stage onto the four rail stages' pending/active/done status. */
export function getRailStatus(stage: FlowStage, rail: RailStageId): RailStatus {
  const index = STAGE_ORDER.indexOf(stage);
  switch (rail) {
    case "import":
      return stage === "drop" ? "active" : "done";
    case "analyze":
      if (stage === "analyzing") return "active";
      return index > STAGE_ORDER.indexOf("analyzing") ? "done" : "pending";
    case "master":
      if (stage === "mastering") return "active";
      return index > STAGE_ORDER.indexOf("mastering") ? "done" : "pending";
    case "export":
      if (stage === "exporting") return "active";
      return stage === "exported" ? "done" : "pending";
    default:
      return "pending";
  }
}
