#!/usr/bin/env bash
# Start a virtual display on :99 for headless Electron / E2E tests.
# Run once per container session: source .devcontainer/xvfb-start.sh
#
# Usage:
#   source .devcontainer/xvfb-start.sh   # starts Xvfb and exports DISPLAY
#   npx playwright test                   # E2E tests pick up DISPLAY=:99

if pgrep -x Xvfb > /dev/null; then
  echo "Xvfb already running"
else
  Xvfb :99 -screen 0 1280x800x24 &
  echo "Xvfb started on :99"
fi

export DISPLAY=:99
