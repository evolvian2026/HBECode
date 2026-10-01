#!/bin/sh
set -eu
mkdir -p "${WORK_ROOT:-/var/lib/hbe-exec}"
chmod 0711 "${WORK_ROOT:-/var/lib/hbe-exec}"
exec /opt/node/bin/node /opt/hbe/agent/main.mjs "$@"
