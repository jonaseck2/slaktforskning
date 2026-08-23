#!/usr/bin/env bash
# Blocks git commands that stage by tree shape instead of by explicit path.
#
# Why: on 2026-08-23 two `git add -A` calls swept nine files of the user's
# in-flight work into an unrelated docs commit, one of which reached
# origin/main via a PR merge. See .claude/skills/commit/SKILL.md
# "Stage by explicit path, always".
#
# Matches only at a command position (start, or after ; && || | { ( or a
# newline) so that grepping for the literal string in a file is not blocked.
set -uo pipefail

# --self-test runs the case table below and exits non-zero on any regression.
# A guard with no test is a wish — that is the lesson this hook encodes.
if [ "${1:-}" = "--self-test" ]; then
  self="$0"; fail=0
  check() { # check <expect: block|allow> <command>
    out=$(jq -nc --arg c "$2" '{tool_input:{command:$c}}' | "$self")
    got=$([ -n "$out" ] && echo block || echo allow)
    [ "$got" = "$1" ] || { printf 'FAIL expected %-5s got %-5s : %s\n' "$1" "$got" "$2"; fail=1; }
  }
  for c in 'git add -A' 'git add .' 'git add -u' 'git add --all' 'git add :/' \
           'git commit -a' 'git commit -am "wip"' 'git commit -a -m "wip"' \
           'git -C /tmp/wt add -A' 'npm test && git add -A' '(cd /tmp && git add .)' \
           '{ git add . ; }' 'git add -A; git commit -m x'; do check block "$c"; done
  for c in 'git add src/foo.ts' 'git add -p' 'git status' 'git commit -m "msg"' \
           'git commit --amend --no-edit' 'git -C /tmp/wt add a.ts b.ts' \
           '(cd /tmp && git add a.ts)' 'git add .claude/hooks/no-tree-staging.sh' \
           'git log --all --oneline' 'grep -rn "git add -A" .claude/' \
           'echo "never use git add -A"'; do check allow "$c"; done
  [ "$fail" = 0 ] && echo "no-tree-staging: 24/24 cases pass"
  exit "$fail"
fi

cmd=$(jq -r '.tool_input.command // ""' 2>/dev/null) || exit 0
[ -z "$cmd" ] && exit 0

sep='(^|[;&|(){}]|&&|\|\||\n)[[:space:]]*'
git='git([[:space:]]+-C[[:space:]]+[^[:space:]]+)*[[:space:]]+'

if printf '%s' "$cmd" | grep -qE "${sep}${git}add[[:space:]]+(-A|--all|-u|--update|\.|:/)([[:space:]]|[;&|)}]|$)" \
|| printf '%s' "$cmd" | grep -qE "${sep}${git}commit[[:space:]]+(-[a-zA-Z]*a[a-zA-Z]*)([[:space:]]|[;&|)}]|$)"; then
  jq -nc '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "Staging by tree shape is forbidden in this repo — the user commits in parallel and it steals their in-flight work (2026-08-23: nine files swept into a docs commit that reached origin/main). Run `git status`, then stage each file by name: git add <path> <path>. See .claude/skills/commit/SKILL.md."
    }
  }'
fi
exit 0
