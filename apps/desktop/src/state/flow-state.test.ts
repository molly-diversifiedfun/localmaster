import { describe, expect, it } from "vitest";
import {
  deriveInitialStage,
  flowReducer,
  getRailStatus,
  initialFlowState,
  type FlowState,
} from "./flow-state";

describe("flowReducer", () => {
  it("walks the full happy path: drop -> analyze -> track -> master -> result -> export -> exported", () => {
    let state: FlowState = initialFlowState;
    expect(state.stage).toBe("drop");

    state = flowReducer(state, { type: "DROP_FILE" });
    expect(state.stage).toBe("analyzing");

    state = flowReducer(state, { type: "ANALYSIS_SUCCESS" });
    expect(state.stage).toBe("track");
    expect(state.error).toBeNull();

    state = flowReducer(state, { type: "START_MASTER" });
    expect(state.stage).toBe("mastering");

    state = flowReducer(state, {
      type: "MASTER_PROGRESS",
      progress: 0.5,
      stageLabel: "limiter",
    });
    expect(state.stage).toBe("mastering");
    expect(state.progress).toBe(0.5);
    expect(state.jobStageLabel).toBe("limiter");

    state = flowReducer(state, { type: "MASTER_SUCCESS" });
    expect(state.stage).toBe("result");

    state = flowReducer(state, { type: "START_EXPORT" });
    expect(state.stage).toBe("exporting");

    state = flowReducer(state, {
      type: "EXPORT_PROGRESS",
      progress: 0.9,
      stageLabel: "render",
    });
    expect(state.progress).toBe(0.9);

    state = flowReducer(state, { type: "EXPORT_SUCCESS" });
    expect(state.stage).toBe("exported");
  });

  it("sends analysis errors back to drop with the message preserved", () => {
    let state = flowReducer(initialFlowState, { type: "DROP_FILE" });
    state = flowReducer(state, {
      type: "ANALYSIS_ERROR",
      message: "Could not reach the LocalMaster engine.",
    });
    expect(state.stage).toBe("drop");
    expect(state.error).toBe("Could not reach the LocalMaster engine.");
  });

  it("sends master errors back to track (not all the way to drop) so overrides survive", () => {
    let state = flowReducer(initialFlowState, { type: "DROP_FILE" });
    state = flowReducer(state, { type: "ANALYSIS_SUCCESS" });
    state = flowReducer(state, { type: "START_MASTER" });
    state = flowReducer(state, {
      type: "MASTER_ERROR", hadMasterResult: false,
      message: "Render failed.",
    });
    expect(state.stage).toBe("track");
    expect(state.error).toBe("Render failed.");
  });

  it("sends export errors back to result (master stays intact) rather than resetting", () => {
    let state = flowReducer(initialFlowState, { type: "DROP_FILE" });
    state = flowReducer(state, { type: "ANALYSIS_SUCCESS" });
    state = flowReducer(state, { type: "START_MASTER" });
    state = flowReducer(state, { type: "MASTER_SUCCESS" });
    state = flowReducer(state, { type: "START_EXPORT" });
    state = flowReducer(state, {
      type: "EXPORT_ERROR",
      message: "Disk full.",
    });
    expect(state.stage).toBe("result");
    expect(state.error).toBe("Disk full.");
  });

  it("RESET returns to the initial drop state", () => {
    let state = flowReducer(initialFlowState, { type: "DROP_FILE" });
    state = flowReducer(state, { type: "ANALYSIS_SUCCESS" });
    state = flowReducer(state, { type: "RESET" });
    expect(state).toEqual(initialFlowState);
  });

  it("starting a new master render clears stale progress/error from a prior attempt", () => {
    let state = flowReducer(initialFlowState, { type: "DROP_FILE" });
    state = flowReducer(state, { type: "ANALYSIS_SUCCESS" });
    state = flowReducer(state, { type: "START_MASTER" });
    state = flowReducer(state, { type: "MASTER_ERROR", hadMasterResult: false, message: "boom" });
    state = flowReducer(state, { type: "START_MASTER" });
    expect(state.error).toBeNull();
    expect(state.progress).toBe(0);
  });
});

describe("deriveInitialStage", () => {
  it("resumes at result when a master render already exists", () => {
    expect(deriveInitialStage(true, true)).toBe("result");
  });

  it("resumes at track when only analysis exists", () => {
    expect(deriveInitialStage(true, false)).toBe("track");
  });

  it("starts at drop when nothing has happened yet", () => {
    expect(deriveInitialStage(false, false)).toBe("drop");
  });
});

describe("getRailStatus", () => {
  it("marks import active while on drop and done afterward", () => {
    expect(getRailStatus("drop", "import")).toBe("active");
    expect(getRailStatus("track", "import")).toBe("done");
    expect(getRailStatus("exported", "import")).toBe("done");
  });

  it("marks analyze pending, then active, then done", () => {
    expect(getRailStatus("drop", "analyze")).toBe("pending");
    expect(getRailStatus("analyzing", "analyze")).toBe("active");
    expect(getRailStatus("track", "analyze")).toBe("done");
    expect(getRailStatus("result", "analyze")).toBe("done");
  });

  it("marks master pending, then active, then done", () => {
    expect(getRailStatus("track", "master")).toBe("pending");
    expect(getRailStatus("mastering", "master")).toBe("active");
    expect(getRailStatus("result", "master")).toBe("done");
  });

  it("marks export pending until exporting/exported", () => {
    expect(getRailStatus("result", "export")).toBe("pending");
    expect(getRailStatus("exporting", "export")).toBe("active");
    expect(getRailStatus("exported", "export")).toBe("done");
  });
});

describe("re-master failure", () => {
  it("returns to result (not track) when a prior master exists, so the working master stays accessible", () => {
    let state = initialFlowState;
    state = flowReducer(state, { type: "DROP_FILE" });
    state = flowReducer(state, { type: "ANALYSIS_SUCCESS" });
    state = flowReducer(state, { type: "START_MASTER" });
    state = flowReducer(state, { type: "MASTER_SUCCESS" });
    state = flowReducer(state, { type: "START_MASTER" }); // re-master via Adjust drawer
    state = flowReducer(state, {
      type: "MASTER_ERROR",
      message: "boom",
      hadMasterResult: true,
    });
    expect(state.stage).toBe("result");
    expect(state.error).toBe("boom");
    expect(state.errorSource).toBe("master");
  });

  it("still returns to track when the FIRST master fails", () => {
    let state = flowReducer(initialFlowState, { type: "DROP_FILE" });
    state = flowReducer(state, { type: "ANALYSIS_SUCCESS" });
    state = flowReducer(state, { type: "START_MASTER" });
    state = flowReducer(state, {
      type: "MASTER_ERROR",
      message: "boom",
      hadMasterResult: false,
    });
    expect(state.stage).toBe("track");
  });

  it("tags export errors with errorSource so the ExportBar owns them", () => {
    let state = flowReducer(initialFlowState, { type: "DROP_FILE" });
    state = flowReducer(state, { type: "ANALYSIS_SUCCESS" });
    state = flowReducer(state, { type: "START_MASTER" });
    state = flowReducer(state, { type: "MASTER_SUCCESS" });
    state = flowReducer(state, { type: "START_EXPORT" });
    state = flowReducer(state, { type: "EXPORT_ERROR", message: "disk full" });
    expect(state.stage).toBe("result");
    expect(state.errorSource).toBe("export");
  });
});
