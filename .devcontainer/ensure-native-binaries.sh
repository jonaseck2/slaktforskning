#!/usr/bin/env bash
# Ensure native binaries in node_modules match the current platform.
# When the workspace is mounted from a macOS host, platform-specific binaries
# (Electron, etc.) may be for the wrong architecture. This script detects
# mismatches and re-downloads the correct ones.

ELECTRON_DIR="node_modules/electron/dist"
ELECTRON_BIN="$ELECTRON_DIR/electron"

OS="$(uname -s)"

case "$OS" in
  Linux)
    EXPECTED_FORMAT="ELF"
    ;;
  Darwin)
    EXPECTED_FORMAT="Mach-O"
    ;;
  *)
    echo "Unknown OS: $OS — skipping binary check"
    exit 0
    ;;
esac

if [ ! -f "$ELECTRON_BIN" ] || ! file "$ELECTRON_BIN" | grep -q "$EXPECTED_FORMAT"; then
  echo "Electron binary missing or wrong platform (expected $EXPECTED_FORMAT on $OS) — re-downloading..."
  rm -rf "$ELECTRON_DIR"
  node node_modules/electron/install.js
else
  echo "Electron binary OK ($EXPECTED_FORMAT on $OS)"
fi
