# SesliTab OMR Gateway — Audiveris runtime image for Render.
#
# Build:  docker build -t seslitab-gateway .
# Run:    docker run -p 3001:3001 --env-file .env seslitab-gateway
#
# Ubuntu 24.04 base with official Audiveris 5.11.0 .deb from the
# Audiveris GitHub release repository. The Audiveris .deb bundles its
# required Java runtime, so no separate JRE is installed.

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# OS dependencies: curl for download, dpkg for install, ca-certificates for HTTPS
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install official Audiveris 5.11.0 from the GitHub release .deb
# Ubuntu 24.04 x86_64 asset. HTTPS only; fail build on download error.
RUN curl -fL --retry 3 -o /tmp/audiveris.deb \
    "https://github.com/Audiveris/audiveris/releases/download/5.11.0/audiveris-5.11.0-linux-x86_64.deb" \
  && dpkg -i /tmp/audiveris.deb 2>/dev/null || apt-get update && apt-get install -f -y \
  && rm -f /tmp/audiveris.deb \
  && rm -rf /var/lib/apt/lists/*

# Verify installation without running Audiveris (GUI app fails -version in headless build)
RUN test -x /opt/audiveris/bin/Audiveris \
  && dpkg -s audiveris | grep -q 'Status: install ok installed' \
  && rm -rf /var/lib/apt/lists/*

# Create non-root application user
RUN groupadd -r seslitab && useradd -r -g seslitab -d /home/seslitab -m seslitab

# Create writable directories on the persistent disk mount point
RUN mkdir -p /var/lib/seslitab/tmp /var/lib/seslitab/musicxml /var/lib/seslitab/audiveris \
  && chown -R seslitab:seslitab /var/lib/seslitab

WORKDIR /app

# Install Node.js 20 from NodeSource
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get install -y --no-install-recommends nodejs \
  && rm -rf /var/lib/apt/lists/*

# Install Node dependencies (cached layer)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy backend source
COPY backend/ ./backend/

# Create application storage directory
RUN mkdir -p /app/storage/jobs && chown -R seslitab:seslitab /app

USER seslitab

# Audiveris user configuration/cache under the persistent disk
ENV HOME=/var/lib/seslitab
ENV XDG_CONFIG_HOME=/var/lib/seslitab/audiveris/config
ENV XDG_DATA_HOME=/var/lib/seslitab/audiveris/data
ENV XDG_CACHE_HOME=/var/lib/seslitab/audiveris/cache

ENV NODE_ENV=production
ENV OMR_PROVIDER=mock
ENV AUDIVERIS_COMMAND=/opt/audiveris/bin/Audiveris
ENV AUDIVERIS_TIMEOUT_MS=110000
ENV SESLITAB_DATA_DIR=/var/lib/seslitab
ENV SESLITAB_TEMP_DIR=/var/lib/seslitab/tmp
ENV SESLITAB_MUSICXML_DIR=/var/lib/seslitab/musicxml

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

CMD ["node", "backend/server.js"]
