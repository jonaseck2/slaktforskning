// One-shot rescue tool: convert a SQLite database from WAL journaling
// back to the default DELETE journaling. Use only when something
// (such as the Tauri spike) has WAL-tagged a file that node-sqlite3-wasm
// then refuses to open with SQLITE_CANTOPEN — see the investigation in
// docs/plans/tauri-port-evaluation-baseline.md.
//
// Usage: walfix <path-to.db>
//
// The operation is destructive only of the journal-mode header bytes
// (write_version=2 → 1, read_version=2 → 1). All authored rows are
// preserved. Take a backup first if you care; this binary does not.

use rusqlite::Connection;
use std::env;
use std::process::ExitCode;

fn main() -> ExitCode {
    let args: Vec<String> = env::args().collect();
    if args.len() != 2 {
        eprintln!("usage: walfix <path-to.db>");
        return ExitCode::from(2);
    }
    let path = &args[1];
    let conn = match Connection::open(path) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("open {path}: {e}");
            return ExitCode::from(1);
        }
    };
    // Checkpoint any pending WAL frames into the main DB first; without this,
    // setting journal_mode=DELETE on a hot WAL would lose anything not yet
    // checkpointed. PASSIVE checkpoint is fine because no other process
    // should hold the file (caller's responsibility).
    if let Err(e) = conn.pragma_update(None, "wal_checkpoint", "TRUNCATE") {
        eprintln!("checkpoint warning: {e}");
    }
    let mode: String = match conn.pragma_update_and_check(
        None, "journal_mode", "DELETE", |row| row.get(0),
    ) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("set journal_mode=DELETE: {e}");
            return ExitCode::from(1);
        }
    };
    println!("journal_mode now: {mode}");
    if mode.to_lowercase() != "delete" {
        eprintln!("expected 'delete' but got '{mode}'");
        return ExitCode::from(1);
    }
    ExitCode::SUCCESS
}
