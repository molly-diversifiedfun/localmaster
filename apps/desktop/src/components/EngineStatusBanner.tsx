import { useEffect, useState } from "react";
import { getHealth } from "../lib/api";

type EngineStatus = "checking" | "online" | "offline";

const RETRY_INTERVAL_MS = 3000;
const RUN_COMMAND =
  "cd apps/audio-engine && uv run uvicorn localmaster_engine.server.app:app --host 127.0.0.1 --port 48750";

function useEngineStatus(): EngineStatus {
  const [status, setStatus] = useState<EngineStatus>("checking");

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const check = () => {
      getHealth()
        .then(() => !cancelled && setStatus("online"))
        .catch(() => !cancelled && setStatus("offline"))
        .finally(() => {
          if (!cancelled) timer = setTimeout(check, RETRY_INTERVAL_MS);
        });
    };
    check();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return status;
}

/** Polls /health and warns the user with a copy-pasteable command when the engine sidecar isn't running. */
export function EngineStatusBanner() {
  const status = useEngineStatus();
  if (status !== "offline") return null;

  return (
    <div className="border-b border-studio-border bg-studio-danger/10 px-4 py-2 text-sm text-studio-danger">
      Engine not running — start it manually:{" "}
      <code className="rounded bg-studio-panel-raised px-1.5 py-0.5 font-mono text-xs">
        {RUN_COMMAND}
      </code>
    </div>
  );
}
