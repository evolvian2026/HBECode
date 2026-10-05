#!/usr/bin/env bash
# Install or update the HBECode executor on a fresh Ubuntu 24.04 VM (Oracle A1, ARM64 or x86).
# Idempotent: re-run it to update to a new git ref. Used by infra/terraform/oci-executor (cloud-init)
# and by hand (docs/deployment.md step 4):
#
#   sudo HBE_API_URL=https://api.example.com HBE_EXECUTOR_TOKEN=… HBE_EXECUTOR_ID=oci-sg-1 ./install-executor.sh
#
# The executor token can also be put in /etc/hbe/executor.env (HBE_EXECUTOR_TOKEN=…) beforehand,
# so it never appears in a shell history or in cloud-init user data.
set -euo pipefail
REPO=${HBE_REPO:-https://github.com/evolvian2026/HBECode.git}
REF=${HBE_REF:-main}
SLOTS=${HBE_EXECUTOR_SLOTS:-2}
ID=${HBE_EXECUTOR_ID:-$(hostname)}
SRC=/opt/hbecode
ETC=/etc/hbe
install -d -m 0700 "$ETC"
[ -f "$ETC/executor.env" ] && . "$ETC/executor.env"
: "${HBE_API_URL:?set HBE_API_URL (https://api.<domain>)}"
: "${HBE_EXECUTOR_TOKEN:?set HBE_EXECUTOR_TOKEN (>= 32 chars, one of the EXECUTOR_TOKENS of the API)}"
umask 077
printf 'HBE_API_URL=%q\nHBE_EXECUTOR_TOKEN=%q\n' "$HBE_API_URL" "$HBE_EXECUTOR_TOKEN" > "$ETC/executor.env"

log() { echo "[hbe-install] $*"; }

# 1. Docker, git, automatic security updates (Ubuntu's unattended-upgrades is on by default; keep it).
if ! command -v docker >/dev/null; then
  log "installing docker"
  apt-get update -q
  DEBIAN_FRONTEND=noninteractive apt-get install -y -q docker.io git unattended-upgrades
  systemctl enable --now docker
fi
# Docker's own logs are capped so a chatty container cannot fill the boot volume.
if [ ! -f /etc/docker/daemon.json ]; then
  echo '{"log-driver":"local","log-opts":{"max-size":"20m","max-file":"5"}}' > /etc/docker/daemon.json
  systemctl restart docker
fi

# 2. Source at the requested ref, and the executor image: built here (about 15 minutes on an A1
#    VM), or pulled when HBE_EXECUTOR_IMAGE names a prebuilt one (autoscaled fleets; log in first).
if [ -d "$SRC/.git" ]; then
  git -C "$SRC" fetch --depth 1 origin "$REF" && git -C "$SRC" checkout -q --force FETCH_HEAD
else
  git clone -q --depth 1 --branch "$REF" "$REPO" "$SRC"
fi
if [ -n "${HBE_EXECUTOR_IMAGE:-}" ]; then
  log "pulling $HBE_EXECUTOR_IMAGE"
  docker pull -q "$HBE_EXECUTOR_IMAGE" && docker tag "$HBE_EXECUTOR_IMAGE" hbe-executor
else
  log "building the executor image from $(git -C "$SRC" rev-parse --short HEAD)"
  docker build -q -f "$SRC/apps/executor/Dockerfile" -t hbe-executor "$SRC"
fi

# 3. DB runners: internal network (no route out), data on tmpfs, passwords generated here and kept
#    in /etc/hbe (root only). They are never sent anywhere: only the executor uses them.
if [ ! -f "$ETC/runners.env" ]; then
  printf 'RPG=%s\nRMY=%s\nRMO=%s\n' "$(openssl rand -hex 16)" "$(openssl rand -hex 16)" "$(openssl rand -hex 16)" > "$ETC/runners.env"
fi
. "$ETC/runners.env"
docker network inspect hbe-runners >/dev/null 2>&1 || docker network create --internal hbe-runners >/dev/null
PG_IMAGE=$(grep -oE 'mirror.gcr.io/library/postgres:16-alpine@sha256:[0-9a-f]{64}' "$SRC/docker-compose.yml" | head -1)
MY_IMAGE=$(grep -oE 'mirror.gcr.io/library/mysql:8.4@sha256:[0-9a-f]{64}' "$SRC/docker-compose.yml" | head -1)
MO_IMAGE=$(grep -oE 'mirror.gcr.io/library/mongo:8.0@sha256:[0-9a-f]{64}' "$SRC/docker-compose.yml" | head -1)
run() { local name=$1; shift; docker rm -f "$name" >/dev/null 2>&1 || true; docker run -d --name "$name" --restart unless-stopped "$@" >/dev/null; }
common=(--network hbe-runners --security-opt no-new-privileges)
run runner-pg "${common[@]}" --memory 512m --tmpfs /var/lib/postgresql/data \
  -e POSTGRES_USER=runner_admin -e POSTGRES_PASSWORD="$RPG" "$PG_IMAGE"
run runner-mysql "${common[@]}" --memory 768m --tmpfs /var/lib/mysql \
  -e MYSQL_ROOT_PASSWORD="$RMY" "$MY_IMAGE" \
  --local-infile=0 --secure-file-priv=NULL --skip-name-resolve --performance-schema=0 --innodb-buffer-pool-size=64M --max-connections=100
run runner-mongo "${common[@]}" --memory 768m --tmpfs /data/db \
  -e MONGO_INITDB_ROOT_USERNAME=root -e MONGO_INITDB_ROOT_PASSWORD="$RMO" "$MO_IMAGE" --noscripting --wiredTigerCacheSizeGB 0.25

# 4. The executor. Privileges are what nsjail needs to build sandboxes (docs/deployment.md §4);
#    the image is read-only and job directories live on tmpfs.
run hbe-executor \
  --cap-drop ALL --cap-add SYS_ADMIN --cap-add SETUID --cap-add SETGID --cap-add CHOWN \
  --cap-add DAC_OVERRIDE --cap-add FOWNER --cap-add KILL \
  --security-opt seccomp=unconfined --security-opt apparmor=unconfined --security-opt systempaths=unconfined \
  --cgroupns private --read-only --tmpfs /var/lib/hbe-exec:exec,size=2g,mode=0711 --tmpfs /tmp:size=256m \
  -e EXECUTOR_API_URL="$HBE_API_URL" -e EXECUTOR_TOKEN="$HBE_EXECUTOR_TOKEN" \
  -e EXECUTOR_ID="$ID" -e EXECUTOR_SLOTS="$SLOTS" \
  -e PG_RUNNER_URL="postgres://runner_admin:$RPG@runner-pg:5432/postgres" \
  -e MYSQL_RUNNER_URL="mysql://root:$RMY@runner-mysql:3306" \
  -e MONGO_RUNNER_URL="mongodb://root:$RMO@runner-mongo:27017/?authSource=admin" \
  hbe-executor
docker network connect hbe-runners hbe-executor
docker image prune -f >/dev/null
log "done. Follow the executor with: docker logs -f hbe-executor (expect 'executor starting' and 'warm-up ok')"
