#!/bin/bash
# Launch Electron app with Chrome DevTools Protocol enabled for external debugging.
#
# Usage (run from project root in a terminal that stays open):
#   ./scripts/dev-debug.sh              # CDP on port 9222, UI server on 19241
#   ./scripts/dev-debug.sh 9223 19242   # Custom ports (for parallel instances)
#
# Verify connection (in another terminal):
#   ./scripts/verify-cdp.sh
#   curl -s http://127.0.0.1:19241/status
#
# Connect Chrome DevTools MCP:
#   npx chrome-devtools-mcp@latest --browserUrl http://127.0.0.1:9222
#
# For parallel subagent instances, use different ports:
#   Terminal 1: ./scripts/dev-debug.sh 9222 19241
#   Terminal 2: ./scripts/dev-debug.sh 9223 19242
#
# NOTE: This script must run in a foreground terminal (not background/nohup).
#       Electron GUI apps need a window server connection on macOS.

CDP_PORT="${1:-9222}"
UI_PORT="${2:-19241}"

export SLAKTFORSKNING_CDP_PORT="$CDP_PORT"
export SLAKTFORSKNING_UI_PORT="$UI_PORT"

echo "Starting Släktforskning with:"
echo "  CDP port:    $CDP_PORT"
echo "  UI port:     $UI_PORT"
echo ""
echo "Verify (in another terminal):"
echo "  ./scripts/verify-cdp.sh $CDP_PORT"
echo "  curl -s http://127.0.0.1:$UI_PORT/status"
echo ""

npm start
