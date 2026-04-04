#!/usr/bin/env bash
# Install all required global Claude plugins and skills.
# Idempotent — safe to run on an existing machine or in the devcontainer.
# Run manually on a new machine, or automatically via devcontainer postCreateCommand.

echo "Installing required Claude plugins..."

# Plugins (via claude plugin install — idempotent)
PLUGINS=(
  superpowers        # planning, debugging, parallel agents, code review
  feature-dev        # feature development with codebase exploration
  code-review        # PR review workflow
  commit-commands    # commit / push / PR automation
  code-simplifier    # code quality cleanup
  mcp-server-dev     # MCP server development (this project has one)
  frontend-design    # Vue / Electron UI work
  skill-creator      # create and edit project skills
  chrome-devtools-mcp # Electron renderer debugging (Chromium-based)
  github             # PR and issue management
)

for plugin in "${PLUGINS[@]}"; do
  claude plugin install "$plugin"
done

echo ""
echo "Installing required legacy skills (browserbase)..."

# Legacy skills (npx skills add — idempotent). napkin is built-in, not needed here.
npx skills add browserbase/skills --skill browser -y -g
npx skills add browserbase/skills --skill fetch -y -g
npx skills add browserbase/skills --skill functions -y -g

echo ""
echo "✓ All required Claude skills installed."
