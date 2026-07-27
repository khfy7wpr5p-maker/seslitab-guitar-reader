# SesliTab OMR Gateway — Audiveris runtime image for Render.
#
# Build:  docker build -t seslitab-gateway .
# Run:    docker run -p 3001:3001 --env-file .env seslitab-gateway
#
# Multi-stage build:
#   Stage 1 (node-build): official pinned Node 20.18.1 image used only to
#     install production node_modules with npm ci. No NodeSource apt repo,
#     no remote GPG key download, no curl-to-NodeSource.
#   Stage 2 (final): Ubuntu 24.04 base with official Audiveris 5.11.0 .deb
#     from the Audiveris GitHub release repository. The Audiveris .deb
#     bundles its required Java runtime, so no separate JRE is installed.
#     Only the node binary and production node_modules are copied from
#     stage 1; the final image never runs a Node package manager.

# ── Stage 1: Node build ──────────────────────────────────────────────
# Pinned official Node 20.18.1 LTS slim image (Debian 12 / glibc 2.36,
# forward-compatible with the Ubuntu 24.04 final stage).
FROM node:20.18.1-bookworm-slim AS node-build

WORKDIR /build

COPY package.json package-lock.json ./

# Install production dependencies only (no devDependencies).
RUN npm ci --omit=dev || npm install --omit=dev

# ── Stage 2: Final runtime image ─────────────────────────────────────
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

ARG AUDIVERIS_VERSION=5.11.0
ARG AUDIVERIS_DEB=Audiveris-${AUDIVERIS_VERSION}-ubuntu24.04-x86_64.deb

# Install runtime libraries required for headless Audiveris processing.
# No desktop environment, X11 server, or GUI packages.
# util-linux provides runuser, used by docker-entrypoint.sh to drop
# from root to the seslitab user after creating the storage directory tree.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      curl \
      ca-certificates \
      fontconfig \
      libfreetype6 \
      libgtk-3-0 \
      libglib2.0-0 \
      util-linux; \
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

# Strict headless build-time smoke test: -version must exit 0 without
# launching a graphical interface or initializing batch transcription.
# Failure stops the build and preserves the complete error output.
RUN timeout 30s /opt/audiveris/bin/Audiveris -version

# Create non-root application user
RUN groupadd -r seslitab && useradd -r -g seslitab -d /home/seslitab -m seslitab

# Create writable directories on the persistent disk mount point.
# These are created at build time for local/docker testing. On Render, the
# persistent disk is mounted at /var/lib/seslitab at runtime, overlaying these
# directories with a root-owned mount point. docker-entrypoint.sh re-creates
# the directory tree as root at startup, then drops to the seslitab user.
RUN mkdir -p /var/lib/seslitab/tmp /var/lib/seslitab/musicxml /var/lib/seslitab/audiveris \
  && chown -R seslitab:seslitab /var/lib/seslitab

WORKDIR /app

# Dedicated writable temp directory for the non-root application user.
# Render's persistent disk mount may not be writable at /var/lib/seslitab/tmp,
# so /app/tmp lives in the container image filesystem and is owned by the
# seslitab user. TMPDIR is inherited by both the Node process and spawned
# Audiveris child processes.
RUN mkdir -p /app/tmp \
  && chown seslitab:seslitab /app/tmp \
  && chmod 0755 /app/tmp

# Copy the Node.js 20.18.1 runtime binary from the pinned official Node
# build stage. No NodeSource apt repository, no remote GPG signing-key
# download, no curl-to-NodeSource. The binary (built against glibc 2.36)
# is forward-compatible with Ubuntu 24.04's glibc 2.39.
COPY --from=node-build /usr/local/bin/node /usr/local/bin/node

# Verify the exact required Node.js runtime version is present.
RUN node --version | grep -q '^v20\.18\.1$'

# Copy production node_modules from the Node build stage.
COPY --from=node-build /build/node_modules /app/node_modules

# Copy backend source
COPY backend/ ./backend/

# Create application storage directory
RUN mkdir -p /app/storage/jobs && chown -R seslitab:seslitab /app

# Copy the entrypoint script that creates the persistent storage directory
# tree at runtime (as root) before dropping to the seslitab user.
# The container starts as root so the entrypoint can fix up the Render disk
# mount point, then runuser drops permanently to seslitab before exec'ing Node.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 0755 /usr/local/bin/docker-entrypoint.sh

# No USER instruction here — the entrypoint drops to seslitab via runuser.

# Audiveris user configuration/cache under the persistent disk
ENV XDG_CONFIG_HOME=/var/lib/seslitab/audiveris/config
ENV XDG_DATA_HOME=/var/lib/seslitab/audiveris/data
ENV XDG_CACHE_HOME=/var/lib/seslitab/audiveris/cache

ENV NODE_ENV=production
ENV OMR_PROVIDER=mock
ENV AUDIVERIS_COMMAND=/opt/audiveris/bin/Audiveris
ENV AUDIVERIS_TIMEOUT_MS=110000
ENV SESLITAB_DATA_DIR=/var/lib/seslitab
ENV SESLITAB_TEMP_DIR=/var/lib/seslitab/tmp
ENV TMPDIR=/app/tmp
ENV SESLITAB_MUSICXML_DIR=/var/lib/seslitab/musicxml

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "backend/server.js"]
