//! Manages the localmaster-engine sidecar process: spawn on startup, best-effort
//! graceful shutdown (POST /shutdown) then kill on app exit.
//!
//! The frozen engine ships as a PyInstaller ONEDIR bundle (an executable plus
//! an `_internal/` support folder, not a single flat binary), so it's bundled
//! as a Tauri resource rather than an `externalBin` sidecar — the resource
//! dir preserves the folder as-is under `Resources/resources/localmaster-engine/`.
//! We spawn it with `std::process::Command` by its absolute resolved path,
//! which keeps PyInstaller's `_internal` resolution (relative to the real
//! executable path) working unmodified.

use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::Child;
use std::sync::Mutex;
use std::time::Duration;
use tauri::Manager;

pub const ENGINE_PORT: u16 = 48750;
const ENGINE_HOST: &str = "127.0.0.1";

/// Holds the spawned sidecar child so it can be torn down on window close.
/// `None` when the bundled engine wasn't found (e.g. running via `vite dev`
/// without a packaged app) — the frontend's /health polling communicates
/// that state to the user instead of us panicking here.
pub struct EngineHandle(pub Mutex<Option<Child>>);

/// Resolves the frozen engine executable inside the app's resource dir.
/// Returns `None` (not an error) when unbundled, e.g. plain `cargo run` /
/// `tauri dev`, where no resources have been copied.
fn engine_executable_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    let resource_dir = app.path().resource_dir().ok()?;
    let exe = resource_dir
        .join("resources")
        .join("localmaster-engine")
        .join("localmaster-engine");
    exe.exists().then_some(exe)
}

pub fn spawn_engine(app: &tauri::AppHandle) {
    let Some(exe) = engine_executable_path(app) else {
        // Dev-mode fallback: no crash. The user runs the engine manually;
        // the frontend's EngineStatusBanner surfaces the run command.
        eprintln!(
            "localmaster-engine sidecar not found in app resources. Run it manually: \
             cd apps/audio-engine && uv run uvicorn localmaster_engine.server.app:app \
             --host 127.0.0.1 --port {ENGINE_PORT}"
        );
        return;
    };

    match std::process::Command::new(&exe)
        .args(["--port", &ENGINE_PORT.to_string()])
        .spawn()
    {
        Ok(child) => {
            app.state::<EngineHandle>().0.lock().unwrap().replace(child);
        }
        Err(err) => {
            eprintln!("failed to spawn localmaster-engine sidecar at {exe:?}: {err}");
        }
    }
}

/// Tears down ONLY an engine this app spawned. When `EngineHandle` is `None`
/// (dev mode: the user runs uvicorn on the shared port themselves), we must
/// not POST /shutdown — that would SIGTERM a process another actor owns.
pub fn shutdown_engine(app: &tauri::AppHandle) {
    if let Some(mut child) = app.state::<EngineHandle>().0.lock().unwrap().take() {
        let _ = post_shutdown();
        let _ = child.kill();
        let _ = child.wait();
    }
}

/// Raw HTTP/1.1 request — no async runtime / HTTP crate needed for one
/// best-effort loopback call.

fn post_shutdown() -> std::io::Result<()> {
    let mut stream = TcpStream::connect((ENGINE_HOST, ENGINE_PORT))?;
    stream.set_read_timeout(Some(Duration::from_millis(500)))?;
    stream.set_write_timeout(Some(Duration::from_millis(500)))?;
    let request = format!(
        "POST /shutdown HTTP/1.1\r\nHost: {ENGINE_HOST}:{ENGINE_PORT}\r\n\
         Content-Length: 0\r\nConnection: close\r\n\r\n"
    );
    stream.write_all(request.as_bytes())?;
    let mut discard = [0u8; 512];
    let _ = stream.read(&mut discard);
    Ok(())
}
