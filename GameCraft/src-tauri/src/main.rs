// GameCraft desktop app: a native Windows window (WebView2) showing the GameCraft UI, with the project/file
// API served in-process on the private `craft://` scheme by the shared Rust backend. No browser, no network port.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use craft_backend::{Config, Library};
use std::path::PathBuf;

fn main() {
    let exe_dir = std::env::current_exe().ok().and_then(|p| p.parent().map(PathBuf::from)).unwrap_or_default();
    // Read-only content ships next to the .exe; when run from the build folder, use the source tree.
    let source = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
    let res = |name: &str| {
        let p = exe_dir.join(name);
        if p.exists() { p } else { source.join(name) }
    };
    // Projects and the GameCraft <-> LogicCraft exchange folder live in %LOCALAPPDATA%\CraftApps
    // (Documents is often guarded by Windows "Controlled folder access", which blocks unknown apps).
    let data = dirs::data_local_dir().unwrap_or_else(|| exe_dir.clone()).join("CraftApps");
    let cfg = Config {
        projects_dir: data.join("GameCraft").join("projects"),
        exchange_dir: data.join("exchange"),
        libraries: vec![
            Library { id: "models".into(), dir: res("Assets"), label: "Your models (GameCraft/Assets)".into() },
            Library { id: "library".into(), dir: res("asset-library"), label: "Asset library (GameCraft/asset-library)".into() },
            // CraftPlayer.exe for File › Export game › Windows (not shown in the Asset browser).
            Library { id: "runtime".into(), dir: res("runtime"), label: "Game player".into() },
        ],
        extensions_dir: Some(res("extensions")),
    };
    cfg.ensure_dirs();

    tauri::Builder::default()
        .register_asynchronous_uri_scheme_protocol("craft", move |_ctx, request, responder| {
            let cfg = cfg.clone();
            // File reads can be large (.blend files); keep them off the UI thread.
            std::thread::spawn(move || responder.respond(craft_backend::handle(&cfg, &request)));
        })
        .run(tauri::generate_context!())
        .expect("GameCraft failed to start");
}
