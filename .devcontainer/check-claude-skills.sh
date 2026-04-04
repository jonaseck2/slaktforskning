#!/usr/bin/env bash
# Check that required global Claude skills are installed.
# Run manually on a new machine, or automatically via devcontainer postCreateCommand.

SKILLS_DIR="${HOME}/.claude/skills"

# name:install-command pairs
declare -A REQUIRED=(
  [napkin]="npx skills add browserbase/skills --skill napkin -y -g"
  [browser]="npx skills add browserbase/skills --skill browser -y -g"
  [fetch]="npx skills add browserbase/skills --skill fetch -y -g"
  [functions]="npx skills add browserbase/skills --skill functions -y -g"
  [frontend-design]="npx skills add anthropics/skills --skill frontend-design -y -g"
)

MISSING=()
for skill in "${!REQUIRED[@]}"; do
  if [[ ! -d "${SKILLS_DIR}/${skill}" ]]; then
    MISSING+=("$skill")
  fi
done

if [[ ${#MISSING[@]} -eq 0 ]]; then
  echo "✓ All required Claude skills are installed."
  exit 0
fi

echo "⚠ Missing Claude skills:"
for skill in "${MISSING[@]}"; do
  echo "  - ${skill}"
  echo "    Install: ${REQUIRED[$skill]}"
done
echo ""
echo "Run the install commands above to restore full Claude capabilities."
exit 1
