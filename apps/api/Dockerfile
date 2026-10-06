# syntax=docker/dockerfile:1.7
# API (+ migration CLI). Build from the repo root: docker build -f apps/api/Dockerfile -t hbe-api .
ARG REGISTRY=mirror.gcr.io/library
# Base images are pinned by digest (multi-arch index digests); refresh with scripts/refresh-image-digests.sh.
ARG DISTROLESS=gcr.io/distroless/nodejs22-debian13:nonroot@sha256:ec2313763dd43931543bd03830466e0c409ce73a487e8d46f10db72d3b816c1c

FROM ${REGISTRY}/node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c AS build
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/question-format/package.json packages/question-format/
COPY apps/api/package.json apps/api/
# Optional build secret `extra_ca` for TLS-intercepting build networks.
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    corepack enable && pnpm install --frozen-lockfile --filter "@hbe/api..."
COPY packages/shared packages/shared
COPY packages/db packages/db
COPY packages/question-format packages/question-format
COPY apps/api apps/api
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    corepack enable && pnpm --filter "@hbe/api..." build \
 && pnpm --filter @hbe/api deploy --legacy --prod /out

# `node` on PATH inside the distroless image, so `docker run hbe-api node <script>` keeps working.
RUN mkdir -p /links && ln -s /nodejs/bin/node /links/node

# Runtime: distroless (no shell, no package manager, no npm), non-root uid 65532. The app files
# stay owned by root, so the running process cannot modify its own code.
FROM ${DISTROLESS}
# The base image already runs as 65532; create /app as root so the server cannot write to it.
USER 0:0
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /links/ /usr/local/bin/
COPY --from=build /out /app
USER 65532:65532
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
# Migrations: docker run --rm -e DATABASE_ADMIN_URL=... -e HBE_APP_DB_PASSWORD=... hbe-api node node_modules/@hbe/db/dist/cli/migrate.js
ENTRYPOINT []
CMD ["node", "--enable-source-maps", "dist/main.js"]
