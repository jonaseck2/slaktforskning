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
    # General dev utilities
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*
