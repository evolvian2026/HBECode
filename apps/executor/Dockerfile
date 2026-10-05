# syntax=docker/dockerfile:1.7
# Executor: agent + nsjail + all language toolchains in one image.
# Build from the repo root:  docker build -f apps/executor/Dockerfile -t hbe-executor .
# REGISTRY defaults to Google's Docker Hub mirror to avoid anonymous pull rate limits.
ARG REGISTRY=mirror.gcr.io/library
# Base images are pinned by digest (multi-arch index digests); refresh with scripts/refresh-image-digests.sh.
ARG NSJAIL_REF=3.6

FROM ${REGISTRY}/golang:1.24-bookworm@sha256:1a6d4452c65dea36aac2e2d606b01b4a029ec90cc1ae53890540ce6173ea77ac AS go
FROM ${REGISTRY}/rust:1.90-slim-bookworm@sha256:64232e656c058f4468e8d024e990acff04f0fd5a5c0a88a574dc37773d7325c9 AS rust
FROM mcr.microsoft.com/dotnet/sdk:8.0@sha256:78235e09001f52b6592c458ac010775ebac6725422e80cd0c1650590f67b2743 AS dotnet
FROM ${REGISTRY}/node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c AS node
# Chromium headless shell matching playwright-core 1.56.1 (multi-arch image).
FROM mcr.microsoft.com/playwright:v1.56.1-noble@sha256:f1e7e01021efd65dd1a2c56064be399f3e4de00fd021ac561325f2bfbb2b837a AS playwright

# ---- nsjail + hbe-run ----------------------------------------------------------------
FROM ${REGISTRY}/ubuntu:24.04@sha256:534baea6a22c03a63003dbc8dbe78fe34bc0d7e595d9a9dc9834884ff530eb55 AS nsjail
ARG NSJAIL_REF
RUN apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates make g++ pkg-config bison flex protobuf-compiler libprotobuf-dev libnl-route-3-dev \
 && rm -rf /var/lib/apt/lists/*
# Optional build secret `extra_ca`: extra CA bundle for TLS-intercepting build networks.
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export GIT_SSL_CAINFO=/run/secrets/extra_ca; fi; \
    git clone --depth 1 --branch "${NSJAIL_REF}" https://github.com/google/nsjail.git /src/nsjail \
 && make -C /src/nsjail -j"$(nproc)" && strip /src/nsjail/nsjail
COPY apps/executor/native/hbe-run.c /src/hbe-run.c
RUN gcc -O2 -static -Wall -Wextra -Werror -o /src/hbe-run /src/hbe-run.c && strip /src/hbe-run

# ---- agent (Node app + production dependencies) ---------------------------------------
FROM node AS agent
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/web-runtime/package.json packages/web-runtime/
COPY apps/executor/package.json apps/executor/
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    corepack enable && pnpm install --frozen-lockfile --filter "@hbe/executor..." --ignore-scripts
COPY packages/shared packages/shared
COPY packages/web-runtime packages/web-runtime
COPY apps/executor apps/executor
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    corepack enable && pnpm --filter "@hbe/executor..." build \
 && pnpm --filter @hbe/executor deploy --legacy --prod /out

# ---- runtime -------------------------------------------------------------------------
FROM ${REGISTRY}/ubuntu:24.04@sha256:534baea6a22c03a63003dbc8dbe78fe34bc0d7e595d9a9dc9834884ff530eb55
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      gcc g++ libc6-dev openjdk-21-jdk-headless python3 python3-pandas \
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
COPY --from=playwright /ms-playwright/chromium_headless_shell-1194 /opt/chromium
# System libraries Chromium needs (resolved by Playwright for this Ubuntu release).
RUN /opt/node/bin/node /opt/hbe/agent/node_modules/playwright-core/cli.js install-deps chromium-headless-shell \
 && rm -rf /var/lib/apt/lists/* && /opt/chromium/chrome-linux/headless_shell --version

ENV NSJAIL_PATH=/usr/local/bin/nsjail HBE_RUN_PATH=/opt/hbe/hbe-run SECCOMP_POLICY=/opt/hbe/policy.kafel \
    WORK_ROOT=/var/lib/hbe-exec NODE_ENV=production CHROMIUM_PATH=/opt/chromium/chrome-linux/headless_shell
# Healthy while the agent keeps reaching the API (see Agent.beat); 3 minutes covers the longest job.
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s CMD ["/opt/node/bin/node", "-e", "const f=(process.env.WORK_ROOT||'/var/lib/hbe-exec')+'/.alive';try{process.exit(Date.now()-require('fs').statSync(f).mtimeMs<180000?0:1)}catch{process.exit(1)}"]
# Runs as root *inside the container* because creating namespaces and cgroups requires it; every
# submission runs as uid 65534 inside an nsjail sandbox. See docs/deployment-executor.md.
ENTRYPOINT ["/usr/bin/tini", "--", "/opt/hbe/entrypoint.sh"]
