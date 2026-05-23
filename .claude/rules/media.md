# Media Storage Rules

Loads when working on media imports, `file_ref` handling, or anything writing files to `<dbname>-media/`.

## The convention

Every database has a sibling folder named `<dbname>-media/`:

- `family.db` → `family-media/` (same directory)
- Helpers in `src/api/media.ts`:
  - `getMediaFolderName(dbPath)` → `'family-media'`
  - `getMediaDir(dbPath)` → absolute path to that folder

`media.file_ref` stores either:

- **Relative path** like `family-media/photo.jpg` — resolved against `dbDir` at read time.
- `null` — record exists but no file (citation-only).

`file_ref` is NEVER an absolute path in a settled database. Absolute paths only appear transiently mid-import; `consolidateMediaFolder` normalises them before the import IPC handler returns.

## Where files get copied

| Path | Behaviour |
|---|---|
| `media:attach` (UI) | Copies the picked file into `<dbname>-media/`, writes a relative ref |
| `archive:import` (.zip) | Copies the bundled `media/` contents into `<dbname>-media/` |
| `gedcom:import` | OBJE FILE refs stored as-is, then `consolidateMediaFolder` copies + rewrites |
| `import:holgerRun` | Importer remaps Windows paths, consolidate copies + rewrites |
| `import:genneyRun` (.gcc) | Same |
| `import:genneyRun` (.backup) | Bulk-copies the extracted `media/` folder into `<dbname>-media/` up front; consolidate is a no-op afterwards |

## When adding a new import path

1. Run the importer; let it write whatever `file_ref` shape is convenient (absolute paths to source files are fine).
2. After success, on the main thread:
   ```ts
   import { consolidateMediaFolder } from '../../api/media_consolidate';
   consolidateMediaFolder(getDb(), getCurrentDatabasePath());
   ```
3. Done. No `mediaDir` plumbing through the importer.

`consolidateMediaFolder` is idempotent and near-no-op when refs are already relative — safe to call after every import.

## What NOT to do

- Do NOT hardcode folder names like `'genney-media'`, `'media'`, `'photos'`. Use `getMediaDir(dbPath)` / `getMediaFolderName(dbPath)`.
- Do NOT leave absolute `file_ref` values in the DB after an import handler returns. Consolidate must run.
- Do NOT skip consolidate for "small" or "trusted" imports — O(n_media) and idempotent.
- Do NOT compute or persist resolved absolute paths from a `file_ref` (derived; render-time only).

## Prime Directive

Consolidating an absolute path into a relative one inside `<dbname>-media/` is a deterministic relocation of an authored value (the user explicitly imported the file), not an inference. It is the only transformation of `file_ref` allowed outside an explicit user action.
