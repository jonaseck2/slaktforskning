#!/usr/bin/env bash
# Ensure native binaries in node_modules match the container platform (Linux x64).
# When the workspace is mounted from a macOS host, platform-specific binaries
# (Electron, etc.) may be for the wrong architecture. This script detects
# mismatches and re-downloads the correct ones.

ELECTRON_DIR="node_modules/electron/dist"
ELECTRON_BIN="$ELECTRON_DIR/electron"

if [ ! -f "$ELECTRON_BIN" ] || ! file "$ELECTRON_BIN" | grep -q "ELF"; then
  echo "Electron binary missing or wrong platform — re-downloading for Linux..."
  rm -rf "$ELECTRON_DIR"
  node node_modules/electron/install.js
else
  echo "Electron binary OK (Linux ELF)"
fi
