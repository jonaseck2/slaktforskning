#!/usr/bin/env python3
"""Audit which CLAUDE.md / .claude/rules/*.md files have actually fired.

Reads the InstructionsLoaded hook log written by log-instructions-loaded.py.
Reports which expected rule files have fired vs. never triggered, with the
load_reason mix per file.

Usage:
    python3 .claude/hooks/audit-rule-firing.py [--log <path>] [--days N]

Defaults to .claude/instructions-loaded.log, all entries.
"""

import argparse
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path


def parse_line(line):
    """Return dict or None.

    Format: <iso-ts> <load_reason> <memory_type> <file_path> [k=v]...
    """
    parts = line.strip().split(" ")
    if len(parts) < 4:
        return None
    record = {
        "ts": parts[0],
        "load_reason": parts[1],
        "memory_type": parts[2],
        "file_path": parts[3],
        "extras": {},
    }
    for token in parts[4:]:
        if "=" in token:
            k, v = token.split("=", 1)
            record["extras"][k] = v
    try:
        record["ts_dt"] = datetime.strptime(record["ts"], "%Y-%m-%dT%H:%M:%SZ").replace(
            tzinfo=timezone.utc
        )
    except ValueError:
        return None
    return record


def discover_expected_rules(project_dir):
    rules_dir = Path(project_dir) / ".claude" / "rules"
    if not rules_dir.is_dir():
        return []
    return sorted(p.name for p in rules_dir.glob("*.md"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--log", default=".claude/instructions-loaded.log")
    parser.add_argument(
        "--days", type=int, default=None, help="Only consider entries within N days"
    )
    parser.add_argument(
        "--project-dir",
        default=os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd()),
        help="Project root (used to discover expected rule files)",
    )
    args = parser.parse_args()

    log_path = Path(args.log)
    if not log_path.is_absolute():
        log_path = Path(args.project_dir) / log_path

    if not log_path.exists():
        print(f"No log at {log_path}. Hook hasn't fired yet, or log was cleared.")
        sys.exit(0)

    cutoff = None
    if args.days is not None:
        cutoff = datetime.now(timezone.utc) - timedelta(days=args.days)

    by_file = defaultdict(list)
    skipped = 0
    with log_path.open() as f:
        for raw in f:
            rec = parse_line(raw)
            if not rec:
                skipped += 1
                continue
            if cutoff and rec["ts_dt"] < cutoff:
                continue
            by_file[rec["file_path"]].append(rec)

    if not by_file:
        print(f"No log entries{' in window' if cutoff else ''}. Hook is wired but nothing fired yet.")
        sys.exit(0)

    expected_rules = discover_expected_rules(args.project_dir)

    # Header
    window = f" (last {args.days}d)" if args.days else " (all time)"
    print(f"InstructionsLoaded audit{window}")
    print(f"Log: {log_path}")
    total_loads = sum(len(v) for v in by_file.values())
    print(f"Total loads: {total_loads}, distinct files: {len(by_file)}, malformed: {skipped}")
    print()

    # Section: project rules
    project_dir_str = str(Path(args.project_dir).resolve())
    rules_seen_by_basename = {
        Path(fp).name: recs
        for fp, recs in by_file.items()
        if "/.claude/rules/" in fp
    }

    print("## .claude/rules/ — path-scoped rule files")
    print()
    if not expected_rules:
        print("(no rule files found in .claude/rules/)")
    else:
        for name in expected_rules:
            recs = rules_seen_by_basename.get(name)
            if recs:
                reasons = Counter(r["load_reason"] for r in recs)
                triggers = Counter(r["extras"].get("trigger", "") for r in recs if r["extras"].get("trigger"))
                print(f"  ✓ {name:<14} fired {len(recs):>4}× — reasons={dict(reasons)}")
                if triggers:
                    top = triggers.most_common(3)
                    print(f"     trigger files (top 3): {top}")
            else:
                print(f"  ✗ {name:<14} NEVER fired")
    print()

    # Section: CLAUDE.md
    claude_md_paths = [fp for fp in by_file if Path(fp).name == "CLAUDE.md"]
    print("## CLAUDE.md")
    print()
    if not claude_md_paths:
        print("  ✗ Never loaded — hook may not be wired correctly.")
    for fp in claude_md_paths:
        recs = by_file[fp]
        reasons = Counter(r["load_reason"] for r in recs)
        memory_types = Counter(r["memory_type"] for r in recs)
        print(f"  ✓ {fp}")
        print(f"     loaded {len(recs)}× — reasons={dict(reasons)} types={dict(memory_types)}")
    print()

    # Section: anything else (e.g. nested CLAUDE.md, plugin instructions)
    other = {
        fp: recs
        for fp, recs in by_file.items()
        if "/.claude/rules/" not in fp and Path(fp).name != "CLAUDE.md"
    }
    if other:
        print("## Other instruction files")
        print()
        for fp, recs in sorted(other.items(), key=lambda kv: -len(kv[1])):
            reasons = Counter(r["load_reason"] for r in recs)
            print(f"  • {fp}")
            print(f"     loaded {len(recs)}× — reasons={dict(reasons)}")
        print()

    # Summary recommendation
    never_fired = [
        name for name in expected_rules if name not in rules_seen_by_basename
    ]
    if never_fired:
        print("## Suggested follow-up")
        print()
        print("  Rule files that have not fired in the audit window:")
        for name in never_fired:
            print(f"    - {name}")
        print()
        print("  Possible causes (in rough likelihood order):")
        print("    1. No work happened in the matching paths during the window — wait longer.")
        print("    2. The `paths:` glob in the rule's frontmatter doesn't match the files actually being touched.")
        print("    3. The rule's content isn't worth keeping (no scenarios where it would help).")


if __name__ == "__main__":
    main()
