#!/usr/bin/env python3
"""Hook: log every InstructionsLoaded event so we can verify path-scoped rules trigger correctly.

Reads the hook payload from stdin, appends a one-line summary to
.claude/instructions-loaded.log. Observability only — cannot block loads.
"""

import json
import os
import sys
from datetime import datetime, timezone


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        return

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    parts = [
        ts,
        data.get("load_reason", "?"),
        data.get("memory_type", "?"),
        data.get("file_path", "?"),
    ]
    trigger = data.get("trigger_file_path")
    if trigger:
        parts.append(f"trigger={trigger}")
    globs = data.get("globs") or []
    if globs:
        parts.append(f"globs={','.join(globs)}")
    parent = data.get("parent_file_path")
    if parent:
        parts.append(f"parent={parent}")

    project_dir = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
    log_path = os.path.join(project_dir, ".claude", "instructions-loaded.log")
    try:
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(" ".join(parts) + "\n")
    except OSError:
        pass


if __name__ == "__main__":
    main()
