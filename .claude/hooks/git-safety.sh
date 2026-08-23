#!/usr/bin/env bash
# Blocks two git commands that have each destroyed in-flight work in this repo.
# Both have the same underlying cause: THE REPOSITORY MOVES between the moment
# state is observed and the moment the command runs. Other sessions and the
# human commit, push and switch branches continuously.
#
#   1. Staging by tree shape — the tree gained files since `git status`.
#      2026-08-23: nine files of someone else's in-flight work swept into an
#      unrelated docs commit, which reached origin/main via a PR merge.
#
#   2. Amending a PUBLISHED commit — HEAD moved since the commit was made.
#      2026-08-23: another session committed and pushed between a `git commit`
#      and its `--amend`; the amend rewrote THEIR commit.
#
# Both denials name an explicit-path alternative. See
# .claude/skills/commit/SKILL.md "Stage by explicit path, always".
#
# Matching is anchored at a command position — start of string, or after a
# shell separator — so that PROSE ABOUT these commands is not blocked. That
# matters: an earlier revision included "(" as a separator and then refused
# every command whose text merely documented the rule, including the edits to
# this file. A guard that cannot be discussed cannot be maintained.
# `--self-test` covers both directions.
set -uo pipefail

# ── self-test ───────────────────────────────────────────────────────────────
# A guard with no test is a wish — the lesson this hook exists to encode.
# Forbidden strings are assembled at runtime so this script can be edited
# through a shell without tripping itself.
if [ "${1:-}" = "--self-test" ]; then
  self="$0"; fail=0; A="add"; C="commit"
  check() { # check <expect: block|allow> <command>
    out=$(jq -nc --arg c "$2" '{tool_input:{command:$c}}' | "$self")
    got=$([ -n "$out" ] && echo block || echo allow)
    [ "$got" = "$1" ] || { printf 'FAIL expected %-5s got %-5s : %s\n' "$1" "$got" "$2"; fail=1; }
  }
  for c in "git $A -A" "git $A ." "git $A -u" "git $A --all" "git $A :/" \
           "git $C -a" "git $C -am 'wip'" "git $C -a -m 'wip'" \
           "git -C /tmp/wt $A -A" "npm test && git $A -A" \
           "cd /tmp && git $A ." "git $A -A; git $C -m x"; do check block "$c"; done
  for c in "git $A src/foo.ts" "git $A -p" "git status" "git $C -m 'msg'" \
           "git -C /tmp/wt $A a.ts b.ts" "git log --all --oneline" \
           "git $A .claude/hooks/git-safety.sh" \
           "grep -rn 'git $A -A' .claude/" \
           "echo 'never use git $A -A'" \
           "sed -i 's/x/y/' f.sh  # documents git $A -A inline"; do check allow "$c"; done
  [ "$fail" = 0 ] && echo "git-safety: 22/22 cases pass"
  exit "$fail"
fi

cmd=$(jq -r '.tool_input.command // ""' 2>/dev/null) || exit 0
[ -z "$cmd" ] && exit 0

deny() {
  jq -nc --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

# Separators deliberately exclude "(" and "{": including them made every
# sentence that mentions a forbidden command read as that command.
sep='(^|[;&|]|&&|\|\||\n)[[:space:]]*'
git='git([[:space:]]+-C[[:space:]]+[^[:space:]]+)*[[:space:]]+'
end='([[:space:]]|[;&|)}]|$)'

# ── 1. staging by tree shape ────────────────────────────────────────────────
if printf '%s' "$cmd" | grep -qE "${sep}${git}add[[:space:]]+(-A|--all|-u|--update|\.|:/)${end}" \
|| printf '%s' "$cmd" | grep -qE "${sep}${git}commit[[:space:]]+(-[a-zA-Z]*a[a-zA-Z]*)${end}"; then
  deny "Staging by tree shape is forbidden in this repo — the human and other sessions commit in parallel, and it steals their in-flight work (2026-08-23: nine files swept into an unrelated docs commit that reached origin/main). Run 'git status', then stage each file BY NAME. See .claude/skills/commit/SKILL.md."
fi

# ── 2. amending a published commit ──────────────────────────────────────────
# --amend rewrites whatever HEAD is NOW, not the commit you made a moment ago.
# A commit that already exists on a remote is either someone else's or shared
# history. Amending a local-only commit stays allowed.
if printf '%s' "$cmd" | grep -qE "${sep}${git}commit([[:space:]]|$).*--amend"; then
  repo=$(printf '%s' "$cmd" | sed -nE 's/.*-C[[:space:]]+([^[:space:]]+).*/\1/p')
  [ -n "$repo" ] || repo=.
  published=$(git -C "$repo" branch -r --contains HEAD 2>/dev/null | head -3 | tr -d ' ' | paste -sd, -)
  if [ -n "$published" ]; then
    subject=$(git -C "$repo" log -1 --format='%h %s' 2>/dev/null)
    deny "Refusing to amend a PUBLISHED commit. HEAD ($subject) already exists on: ${published}. This repo moves between commands — on 2026-08-23 another session pushed between a commit and its amend, and the amend rewrote their work. Make a NEW commit instead. If an amend is genuinely required on published history, the human does it. See .claude/skills/commit/SKILL.md."
  fi
fi
exit 0
