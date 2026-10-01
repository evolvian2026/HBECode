# syntax=docker/dockerfile:1.7
# Executor: agent + nsjail + all language toolchains in one image.
# Build from the repo root:  docker build -f apps/executor/Dockerfile -t hbe-executor .
# REGISTRY defaults to Google's Docker Hub mirror to avoid anonymous pull rate limits.
ARG REGISTRY=mirror.gcr.io/library
ARG NSJAIL_REF=3.6

FROM ${REGISTRY}/golang:1.24-bookworm AS go
FROM ${REGISTRY}/rust:1.90-slim-bookworm AS rust
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS dotnet
FROM ${REGISTRY}/node:22-bookworm-slim AS node

# ---- nsjail + hbe-run ----------------------------------------------------------------
FROM ${REGISTRY}/ubuntu:24.04 AS nsjail
ARG NSJAIL_REF
RUN apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates make g++ pkg-config bison flex protobuf-compiler libprotobuf-dev libnl-route-3-dev \
 && rm -rf /var/lib/apt/lists/*
# Optional build secret `extra_ca`: extra CA bundle for TLS-intercepting build networks.
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export GIT_SSL_CAINFO=/run/secrets/extra_ca; fi; \
    git clone --depth 1 --branch "${NSJAIL_REF}" https://github.com/google/nsjail.git /src/nsjail \
 && make -C /src/nsjail -j"$(nproc)" && strip /src/nsjail/nsjail
COPY apps/executor/native/hbe-run.c /src/hbe-run.c
RUN gcc -O2 -static -Wall -Wextra -Werror -o /src/hbe-run /src/hbe-run.c && strip /src/hbe-run

# ---- agent bundle --------------------------------------------------------------------
FROM node AS agent
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/executor/package.json apps/executor/
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    corepack enable && pnpm install --frozen-lockfile --filter @hbe/executor... --ignore-scripts
COPY packages/shared packages/shared
COPY apps/executor apps/executor
RUN corepack enable && pnpm --filter @hbe/shared build \
 && cd apps/executor && pnpm exec esbuild src/main.ts src/cli-run.ts src/cli-versions.ts --bundle --platform=node --format=esm \
      --target=node22 --outdir=/out --out-extension:.js=.mjs

# ---- runtime -------------------------------------------------------------------------
FROM ${REGISTRY}/ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      gcc g++ libc6-dev openjdk-21-jdk-headless python3 \
      libprotobuf32t64 libnl-route-3-200 libssl3t64 zlib1g ca-certificates tini \
 && rm -rf /var/lib/apt/lists/* \
 && ln -s "$(dirname "$(dirname "$(readlink -f /usr/bin/javac)")")" /usr/lib/jvm/java-21-openjdk

# Precompiled <bits/stdc++.h> for the exact flags the executor uses (cuts C++ compiles by ~1 s).
RUN H="$(find /usr/include -path '*/bits/stdc++.h' | head -n1)" \
 && g++ -std=c++17 -O2 -pipe -fdiagnostics-color=never -x c++-header "$H" -o "$H.gch"

COPY --from=node /usr/local/bin/node /opt/node/bin/node
COPY --from=go /usr/local/go /opt/go
COPY --from=rust /usr/local/rustup/toolchains/ /tmp/rust-toolchains/
RUN mv /tmp/rust-toolchains/*/ /opt/rust && rm -rf /tmp/rust-toolchains && mkdir -p /opt/rustup
COPY --from=dotnet /usr/share/dotnet /opt/dotnet

# Pre-build the Go standard library into a seed cache (copied to tmpfs per compile).
COPY apps/executor/docker/gocache-seed.go /tmp/seed/main.go
RUN cd /tmp/seed && GOCACHE=/opt/gocache-seed GOROOT=/opt/go GO111MODULE=off CGO_ENABLED=0 GOTOOLCHAIN=local \
      /opt/go/bin/go build -trimpath -o /tmp/seed/a.out main.go \
 && rm -rf /tmp/seed && chmod -R a+rX /opt/gocache-seed

COPY --from=nsjail /src/nsjail/nsjail /usr/local/bin/nsjail
COPY --from=nsjail /src/hbe-run /opt/hbe/hbe-run
COPY apps/executor/seccomp/policy.kafel /opt/hbe/policy.kafel
COPY --chmod=0755 apps/executor/docker/csc.sh /opt/hbe/csc.sh
COPY --chmod=0755 apps/executor/docker/entrypoint.sh /opt/hbe/entrypoint.sh
COPY --from=agent /out /opt/hbe/agent

ENV NSJAIL_PATH=/usr/local/bin/nsjail HBE_RUN_PATH=/opt/hbe/hbe-run SECCOMP_POLICY=/opt/hbe/policy.kafel \
    WORK_ROOT=/var/lib/hbe-exec NODE_ENV=production
HEALTHCHECK --interval=30s --timeout=5s CMD test -x /usr/local/bin/nsjail || exit 1
# Runs as root *inside the container* because creating namespaces and cgroups requires it; every
# submission runs as uid 65534 inside an nsjail sandbox. See docs/deployment-executor.md.
ENTRYPOINT ["/usr/bin/tini", "--", "/opt/hbe/entrypoint.sh"]
