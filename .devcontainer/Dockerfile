FROM mcr.microsoft.com/devcontainers/javascript-node:22

# Electron system dependencies (required to build/package; also needed for E2E tests)
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Electron / Chromium runtime
    libnss3 \
    libnspr4 \
    libdbus-1-3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libgtk-3-0 \
    libpango-1.0-0 \
    libcairo2 \
    libx11-xcb1 \
    libxcb-dri3-0 \
    # Virtual display for headless E2E tests
    xvfb \
    # Java runtime — required for Genney Derby extraction
    default-jre-headless \
    # General dev utilities
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Pre-create .claude so the named volume inherits node ownership on first mount
RUN mkdir -p /home/node/.claude && chown -R node:node /home/node/.claude

# Helper: ensure native binaries match the container platform (Linux x64)
COPY ensure-native-binaries.sh /usr/local/bin/ensure-native-binaries
RUN chmod +x /usr/local/bin/ensure-native-binaries
