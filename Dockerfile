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

ARG AUDIVERIS_VERSION=5.11.0
ARG AUDIVERIS_DEB=Audiveris-${AUDIVERIS_VERSION}-ubuntu24.04-x86_64.deb

# Install runtime libraries required for headless Audiveris processing.
# No desktop environment, X11 server, or GUI packages.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      curl \
      ca-certificates \
      fontconfig \
      libfreetype6; \
    rm -rf /var/lib/apt/lists/*

# Download and validate the official Audiveris 5.11.0 .deb, then extract the
# application payload without running the Debian package post-installation
# script (which expects a Linux desktop environment unavailable in a
# headless container). Only the /opt/audiveris payload and its bundled Java
# runtime are needed.
RUN set -eux; \
    curl -fL --retry 3 --retry-all-errors \
      -o /tmp/audiveris.deb \
      "https://github.com/Audiveris/audiveris/releases/download/${AUDIVERIS_VERSION}/${AUDIVERIS_DEB}"; \
    test -s /tmp/audiveris.deb; \
    echo "Downloaded Audiveris package metadata:"; \
    dpkg-deb -f /tmp/audiveris.deb Package Version Architecture Depends; \
    mkdir -p /tmp/audiveris-root; \
    dpkg-deb -x /tmp/audiveris.deb /tmp/audiveris-root; \
    test -x /tmp/audiveris-root/opt/audiveris/bin/Audiveris; \
    cp -a /tmp/audiveris-root/opt/audiveris /opt/audiveris; \
    test -x /opt/audiveris/bin/Audiveris; \
    ls -la /opt/audiveris/bin/Audiveris; \
    rm -rf /tmp/audiveris-root /tmp/audiveris.deb

# Writable runtime home for Audiveris user configuration and cache.
ENV HOME=/var/lib/audiveris
RUN mkdir -p /var/lib/audiveris && chmod 0755 /var/lib/audiveris

# Strict headless build-time smoke test: -batch -version must exit 0 without
# launching a graphical interface. Failure stops the build and preserves
# the complete error output.
RUN /opt/audiveris/bin/Audiveris -batch -version

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
