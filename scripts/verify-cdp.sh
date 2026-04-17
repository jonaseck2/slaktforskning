#!/bin/bash
# Verify that Chrome DevTools Protocol is working after launching with dev-debug.sh.
# Run this in a SEPARATE terminal while the app is running.
#
# Usage: ./scripts/verify-cdp.sh [port]

CDP_PORT="${1:-9222}"

echo "Checking CDP on port $CDP_PORT..."
echo ""

VERSION=$(curl -s "http://127.0.0.1:$CDP_PORT/json/version" 2>/dev/null)
if [ -z "$VERSION" ]; then
  echo "FAIL: CDP not responding on port $CDP_PORT"
  echo ""
  echo "Make sure the app is running with CDP enabled:"
  echo "  ./scripts/dev-debug.sh $CDP_PORT"
  exit 1
fi

echo "SUCCESS: CDP is active"
echo "$VERSION" | python3 -m json.tool 2>/dev/null || echo "$VERSION"
echo ""

echo "Available targets:"
curl -s "http://127.0.0.1:$CDP_PORT/json/list" 2>/dev/null | python3 -m json.tool 2>/dev/null
echo ""

echo "Chrome DevTools MCP can connect with:"
echo "  npx chrome-devtools-mcp@latest --browserUrl http://127.0.0.1:$CDP_PORT"
