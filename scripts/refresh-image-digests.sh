#!/usr/bin/env bash
# Re-resolve every pinned base image (`name:tag@sha256:…`) in the Dockerfiles and docker-compose.yml
# to the digest its tag points at today, in place. Run monthly or when a CVE fix lands upstream,
# then rebuild and run CI (Trivy scans the executor image).   Usage: scripts/refresh-image-digests.sh
set -euo pipefail
cd "$(dirname "$0")/.."
files=(apps/api/Dockerfile apps/web/Dockerfile apps/executor/Dockerfile docker-compose.yml)
grep -ohE '[A-Za-z0-9${}._/-]+:[A-Za-z0-9._-]+@sha256:[0-9a-f]{64}' "${files[@]}" | sort -u | while read -r ref; do
  image="${ref%@*}"
  resolved="${image//\$\{REGISTRY\}/mirror.gcr.io/library}"
  digest="$(docker buildx imagetools inspect "$resolved" --format '{{json .Manifest.Digest}}' | tr -d '"')"
  [ -n "$digest" ] || { echo "could not resolve $resolved" >&2; exit 1; }
  if [ "$ref" != "$image@$digest" ]; then
    echo "$image → $digest"
    sed -i "s|$(printf '%s' "$ref" | sed 's/[$.*/[\]^]/\\&/g')|$image@$digest|g" "${files[@]}"
  fi
done
echo "done"
