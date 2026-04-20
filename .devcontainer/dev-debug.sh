#!/bin/bash
# Launch Electron app with Chrome DevTools Protocol enabled for external debugging.
#
# Usage (run from project root in a terminal that stays open):
#   .devcontainer/dev-debug.sh              # CDP on port 9222, UI server on 19241
#   .devcontainer/dev-debug.sh 9223 19242   # Custom ports (for parallel instances)
#
# Verify connection (in another terminal):
#   .devcontainer/verify-cdp.sh
#   curl -s http://127.0.0.1:19241/status
#
# Connect Chrome DevTools MCP:
#   npx chrome-devtools-mcp@latest --browserUrl http://127.0.0.1:9222
#
# For parallel subagent instances, use different ports:
#   Terminal 1: .devcontainer/dev-debug.sh 9222 19241
#   Terminal 2: .devcontainer/dev-debug.sh 9223 19242
#
# NOTE: This script must run in a foreground terminal (not background/nohup).
#       Electron GUI apps need a window server connection on macOS.

CDP_PORT="${1:-9222}"
UI_PORT="${2:-19241}"

export SLAKTFORSKNING_CDP_PORT="$CDP_PORT"
export SLAKTFORSKNING_UI_PORT="$UI_PORT"

# Ensure native binaries match the current platform before launching.
bash "$(dirname "$0")/ensure-native-binaries.sh"

# In headless environments (devcontainer), ensure Xvfb is running.
# Check the process, not just $DISPLAY — remoteEnv pre-sets DISPLAY=:99 so the
# env var is always set even if Xvfb crashed or postStartCommand didn't finish.
if ! pgrep -x Xvfb > /dev/null; then
  Xvfb :99 -screen 0 1280x800x24 &
  sleep 0.5
  echo "Xvfb started on :99"
fi
export DISPLAY="${DISPLAY:-:99}"

echo "Starting Släktforskning with:"
echo "  CDP port:    $CDP_PORT"
echo "  UI port:     $UI_PORT"
echo ""
echo "Verify (in another terminal):"
echo "  .devcontainer/verify-cdp.sh $CDP_PORT"
echo "  curl -s http://127.0.0.1:$UI_PORT/status"
echo ""

npm start
