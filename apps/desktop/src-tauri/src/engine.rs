//! Manages the localmaster-engine sidecar process: spawn on startup, best-effort
//! graceful shutdown (POST /shutdown) then kill on app exit.

use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::Mutex;
use std::time::Duration;
use tauri::Manager;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

pub const ENGINE_PORT: u16 = 48750;
const ENGINE_HOST: &str = "127.0.0.1";

/// Holds the spawned sidecar child so it can be torn down on window close.
/// `None` when the sidecar binary wasn't found (e.g. running via `vite dev`
/// without a packaged engine) — the frontend's /health polling communicates
/// that state to the user instead of us panicking here.
pub struct EngineHandle(pub Mutex<Option<CommandChild>>);

pub fn spawn_engine(app: &tauri::AppHandle) {
    let shell = app.shell();
    match shell
        .sidecar("localmaster-engine")
        .and_then(|cmd| cmd.args(["--port", &ENGINE_PORT.to_string()]).spawn())
    {
        Ok((_receiver, child)) => {
            app.state::<EngineHandle>().0.lock().unwrap().replace(child);
        }
        Err(err) => {
            // Dev-mode fallback: no crash. The user runs the engine manually;
            // the frontend's EngineStatusBanner surfaces the run command.
            eprintln!(
                "localmaster-engine sidecar not started ({err}). Run it manually: \
                 cd apps/audio-engine && uv run uvicorn localmaster_engine.server.app:app \
                 --host 127.0.0.1 --port {ENGINE_PORT}"
            );
        }
    }
}

/// POSTs /shutdown with a raw HTTP/1.1 request (no async runtime / HTTP crate
/// needed for one best-effort request), then kills the child if still alive.
pub fn shutdown_engine(app: &tauri::AppHandle) {
    let _ = post_shutdown();
    if let Some(child) = app.state::<EngineHandle>().0.lock().unwrap().take() {
        let _ = child.kill();
    }
}

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
