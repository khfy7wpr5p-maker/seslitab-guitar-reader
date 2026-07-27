#!/bin/sh
set -e

# Create the persistent storage directory tree on the Render disk mount.
# Render mounts the persistent disk at /var/lib/seslitab at runtime,
# overlaying the build-time directory. The mount point is root-owned,
# so the seslitab user cannot create subdirectories without this step.
# This runs as root before dropping to the seslitab user.

install -d -o seslitab -g seslitab -m 0755 /var/lib/seslitab
install -d -o seslitab -g seslitab -m 0755 /var/lib/seslitab/musicxml
install -d -o seslitab -g seslitab -m 0755 /var/lib/seslitab/tmp
install -d -o seslitab -g seslitab -m 0755 /var/lib/seslitab/audiveris

# Drop to the non-root application user and exec the command.
exec runuser -u seslitab -- "$@"
