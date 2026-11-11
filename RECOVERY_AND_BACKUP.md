# Project Persistence, Backup & Crash Recovery Documentation

WiniSort never uses browser storage (`localStorage`, `IndexedDB`, or Service Worker `CacheStorage`) as a database for your media library. Instead, it uses a transparent, human-readable `.winisort/` directory inside your selected output root folder.

## `.winisort/` Directory Layout
- `project.json`: Versioned (`schemaVersion: "1.0.0"`) manifest storing project ID, timestamps, source metadata, destination folder definitions, bank placements, colors, shortcuts, media filter rules, smart sorting rules, and file assignment statuses by fingerprint. Never contains raw media bytes or base64 strings.
- `operations.jsonl`: Append-only JSON Lines journal recording every operation transition (`pending`, `completed`, `failed`, `undone`) with expected file size and destination filename.

## Crash Recovery Workflow
When you select or reconnect an Output Directory containing `.winisort/`:
1. WiniSort parses and validates `project.json` (applying schema migrations if needed).
2. WiniSort reads `operations.jsonl` and inspects any operation whose last recorded state was `pending` or `failed`.
3. For each unfinished operation, WiniSort inspects the actual file on disk inside the target destination folder:
   - **`verified-complete`**: The output file exists on disk and its byte size matches the expected source size. Recommended action: `mark-sorted`.
   - **`partial-write`**: The output file exists on disk, but its size differs from the source file (indicating an interrupted stream). Recommended action: `review-manual` (WiniSort never deletes uncertain files automatically).
   - **`missing-output`**: The operation was queued prior to interruption, and no output file was created. Recommended action: `retry-copy`.
