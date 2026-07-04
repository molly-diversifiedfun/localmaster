/**
 * Thin fetch client for the LocalMaster engine HTTP API.
 * Contract: packages/shared/api-contract.md (frozen). Base URL is loopback-only.
 */
import type {
  AnalysisReport,
  AnalyzeJobAccepted,
  ApiErrorBody,
  BatchJobResult,
  BatchRequest,
  ExportJobResult,
  ExportRequest,
  HealthResponse,
  JobStateResponse,
  MasterJobResult,
  MasterRequest,
  PresetsResponse,
  ShutdownResponse,
} from "@shared/types";

export const ENGINE_BASE_URL = "http://127.0.0.1:48750";

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${ENGINE_BASE_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch (cause) {
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      "Could not reach the LocalMaster engine.",
    );
  }

  if (!response.ok) {
    const body = (await response
      .json()
      .catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(
      response.status,
      body?.error?.code ?? "UNKNOWN_ERROR",
      body?.error?.message ?? `Engine request failed (${response.status}).`,
    );
  }
  return response.json() as Promise<T>;
}

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/health");
}

export function shutdownEngine(): Promise<ShutdownResponse> {
  return request<ShutdownResponse>("/shutdown", { method: "POST" });
}

export function getPresets(): Promise<PresetsResponse> {
  return request<PresetsResponse>("/presets");
}

export function analyze(path: string): Promise<AnalyzeJobAccepted> {
  return request<AnalyzeJobAccepted>("/analyze", {
    method: "POST",
    body: JSON.stringify({ path }),
  });
}

export function master(req: MasterRequest): Promise<AnalyzeJobAccepted> {
  return request<AnalyzeJobAccepted>("/master", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export function exportMaster(req: ExportRequest): Promise<AnalyzeJobAccepted> {
  return request<AnalyzeJobAccepted>("/export", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export function batch(req: BatchRequest): Promise<AnalyzeJobAccepted> {
  return request<AnalyzeJobAccepted>("/batch", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export function getJob<TResult>(
  jobId: string,
): Promise<JobStateResponse<TResult>> {
  return request<JobStateResponse<TResult>>(`/jobs/${jobId}`);
}

export interface PollJobOptions {
  intervalMs?: number;
  onProgress?: (state: JobStateResponse<unknown>) => void;
  /** Injectable for tests; defaults to real timers via setTimeout. */
  sleep?: (ms: number) => Promise<void>;
  signal?: AbortSignal;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Polls GET /jobs/{id} until status is "done" or "error". Resolves with the
 * result on success; rejects with an ApiError carrying the engine's error
 * code/message on failure, or if the poll is aborted via `signal`.
 */
export async function pollJob<TResult>(
  jobId: string,
  options: PollJobOptions = {},
): Promise<TResult> {
  const {
    intervalMs = 500,
    onProgress,
    sleep = defaultSleep,
    signal,
  } = options;

  while (true) {
    if (signal?.aborted) {
      throw new ApiError(0, "ABORTED", "Job polling was cancelled.");
    }
    const state = await getJob<TResult>(jobId);
    onProgress?.(state as JobStateResponse<unknown>);

    if (state.status === "done") {
      if (state.result === null) {
        throw new ApiError(
          0,
          "EMPTY_RESULT",
          "Job finished but returned no result.",
        );
      }
      return state.result;
    }
    if (state.status === "error") {
      throw new ApiError(
        0,
        state.error?.code ?? "JOB_FAILED",
        state.error?.message ?? "Job failed.",
      );
    }
    await sleep(intervalMs);
  }
}

export async function analyzeAndWait(
  path: string,
  options?: PollJobOptions,
): Promise<AnalysisReport> {
  const { job_id } = await analyze(path);
  return pollJob<AnalysisReport>(job_id, options);
}

export async function masterAndWait(
  req: MasterRequest,
  options?: PollJobOptions,
): Promise<MasterJobResult> {
  const { job_id } = await master(req);
  return pollJob<MasterJobResult>(job_id, options);
}

export async function exportAndWait(
  req: ExportRequest,
  options?: PollJobOptions,
): Promise<ExportJobResult> {
  const { job_id } = await exportMaster(req);
  return pollJob<ExportJobResult>(job_id, options);
}

export async function batchAndWait(
  req: BatchRequest,
  options?: PollJobOptions,
): Promise<BatchJobResult> {
  const { job_id } = await batch(req);
  return pollJob<BatchJobResult>(job_id, options);
}
