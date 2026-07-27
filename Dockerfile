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

# Install official Audiveris 5.11.0 from the GitHub release .deb.
# Uses the Ubuntu 24.04 x86_64 release asset. Every step must succeed or the
# build stops — no silent installation failures, no apt-get install -f
# fallback, no error suppression. The Audiveris GUI is never executed here.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends curl ca-certificates; \
    curl -fL --retry 3 --retry-all-errors \
      -o /tmp/audiveris.deb \
      "https://github.com/Audiveris/audiveris/releases/download/${AUDIVERIS_VERSION}/${AUDIVERIS_DEB}"; \
    test -s /tmp/audiveris.deb; \
    echo "Downloaded Audiveris package metadata:"; \
    dpkg-deb -f /tmp/audiveris.deb Package Version Architecture; \
    apt-get install -y --no-install-recommends /tmp/audiveris.deb; \
    dpkg-query -W -f='${Status}\n' audiveris | grep -Fx 'install ok installed'; \
    test -x /opt/audiveris/bin/Audiveris; \
    ls -la /opt/audiveris/bin/Audiveris; \
    rm -f /tmp/audiveris.deb; \
    rm -rf /var/lib/apt/lists/*

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
