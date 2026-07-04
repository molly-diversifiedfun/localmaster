import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  analyzeAndWait,
  batchAndWait,
  ENGINE_BASE_URL,
  getHealth,
  getJob,
  pollJob,
} from "./api";
import type { JobStateResponse } from "@shared/types";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("api client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs /health against the loopback engine URL", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ status: "ok", version: "0.1.0", engine: "localmaster" }),
    );

    const health = await getHealth();

    expect(fetchMock).toHaveBeenCalledWith(
      `${ENGINE_BASE_URL}/health`,
      expect.any(Object),
    );
    expect(health.status).toBe("ok");
  });

  it("throws an ApiError with the engine's code/message on a 4xx/5xx response", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: { code: "NOT_FOUND", message: "no such file" } },
        404,
      ),
    );

    await expect(getJob("missing-job")).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "no such file",
    });
  });

  it("wraps network failures (fetch rejecting) in an ApiError", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(getHealth()).rejects.toBeInstanceOf(ApiError);
  });
});

describe("pollJob", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockJobSequence(states: JobStateResponse<unknown>[]) {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    states.forEach((state) =>
      fetchMock.mockResolvedValueOnce(jsonResponse(state)),
    );
  }

  it("polls until status is done and resolves with the result", async () => {
    mockJobSequence([
      { status: "queued", progress: 0, stage: null, result: null, error: null },
      {
        status: "running",
        progress: 0.5,
        stage: "limiter",
        result: null,
        error: null,
      },
      {
        status: "done",
        progress: 1,
        stage: null,
        result: { ok: true },
        error: null,
      },
    ]);

    const progressUpdates: JobStateResponse<unknown>[] = [];
    const result = await pollJob("job-1", {
      sleep: async () => undefined,
      onProgress: (state) => progressUpdates.push(state),
    });

    expect(result).toEqual({ ok: true });
    expect(progressUpdates.map((s) => s.status)).toEqual([
      "queued",
      "running",
      "done",
    ]);
  });

  it("rejects with the job's error code/message when status is error", async () => {
    mockJobSequence([
      {
        status: "error",
        progress: 0.2,
        stage: "analyze",
        result: null,
        error: { code: "DECODE_ERROR", message: "unsupported bit depth" },
      },
    ]);

    await expect(
      pollJob("job-2", { sleep: async () => undefined }),
    ).rejects.toMatchObject({
      code: "DECODE_ERROR",
      message: "unsupported bit depth",
    });
  });

  it("stops polling (rejects) when the abort signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      pollJob("job-3", {
        sleep: async () => undefined,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "ABORTED" });
  });

  it("analyzeAndWait chains POST /analyze into job polling", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse({ job_id: "job-4" }));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        status: "done",
        progress: 1,
        stage: null,
        result: { integrated_lufs: -14 },
        error: null,
      }),
    );

    const report = await analyzeAndWait("/tracks/song.wav", {
      sleep: async () => undefined,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${ENGINE_BASE_URL}/analyze`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(report).toEqual({ integrated_lufs: -14 });
  });

  it("batchAndWait chains POST /batch into job polling, reporting the two-pass stage names", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse({ job_id: "job-5" }));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        status: "running",
        progress: 0.3,
        stage: "pass1:track1.wav",
        result: null,
        error: null,
      }),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        status: "running",
        progress: 0.7,
        stage: "pass2:track1.wav",
        result: null,
        error: null,
      }),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        status: "done",
        progress: 1,
        stage: null,
        result: {
          shared_target_lufs: -14.2,
          warnings: ["track2.wav landed above target (transient guard)"],
          exports: [
            {
              out_path: "/out/track1.wav",
              json_report_path: "/out/track1.json",
              txt_report_path: "/out/track1.txt",
              checklist: {
                no_clipping: true,
                peak_within_ceiling: true,
                loudness_within_tolerance: true,
                valid_stereo: true,
                export_succeeded: true,
                output_is_wav: true,
              },
              output_analysis: {},
            },
          ],
        },
        error: null,
      }),
    );

    const stages: (string | null)[] = [];
    const result = await batchAndWait(
      {
        paths: ["/tracks/track1.wav", "/tracks/track2.wav"],
        preset_id: "clean_dj",
        out_dir: "/out",
        bit_depth: 24,
      },
      {
        sleep: async () => undefined,
        onProgress: (state) => stages.push(state.stage),
      },
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${ENGINE_BASE_URL}/batch`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(stages).toEqual(["pass1:track1.wav", "pass2:track1.wav", null]);
    expect(result.shared_target_lufs).toBe(-14.2);
    expect(result.exports).toHaveLength(1);
  });
});
