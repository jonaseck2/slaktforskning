#!/bin/bash
# Set up SSH commit signing and DCO Signed-off-by automation.
# Runs in postCreateCommand; no-ops gracefully if GIT_SIGNING_KEY is unset.
set -e

if [ -z "$GIT_SIGNING_KEY" ]; then
  echo "GIT_SIGNING_KEY not set — skipping commit signing setup"
  exit 0
fi

# Write the private key
mkdir -p ~/.ssh
printf '%s\n' "$GIT_SIGNING_KEY" > ~/.ssh/git_signing_key
chmod 600 ~/.ssh/git_signing_key

# Configure SSH signing
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/git_signing_key
git config --global commit.gpgsign true

# Auto-add Signed-off-by for DCO compliance
mkdir -p ~/.config/git/hooks
cat > ~/.config/git/hooks/prepare-commit-msg << 'EOF'
#!/bin/sh
NAME=$(git config --get user.name)
EMAIL=$(git config --get user.email)
SOB="Signed-off-by: $NAME <$EMAIL>"
grep -qs "^$SOB" "$1" || git interpret-trailers --in-place --trailer "$SOB" "$1"
EOF
chmod +x ~/.config/git/hooks/prepare-commit-msg
git config --global core.hooksPath ~/.config/git/hooks

echo "Commit signing and DCO sign-off configured"
