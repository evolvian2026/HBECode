# syntax=docker/dockerfile:1.7
# Static web app served with the production security headers.
# docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=http://localhost:4000 -t hbe-web .
ARG REGISTRY=mirror.gcr.io/library
# Base images are pinned by digest (multi-arch index digests); refresh with scripts/refresh-image-digests.sh.
ARG DISTROLESS=gcr.io/distroless/nodejs22-debian12:nonroot@sha256:13593b7570658e8477de39e2f4a1dd25db2f836d68a0ba771251572d23bb4f8e

FROM ${REGISTRY}/node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c AS build
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} NEXT_TELEMETRY_DISABLED=1
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/web-runtime/package.json packages/web-runtime/
COPY apps/web/package.json apps/web/
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    corepack enable && pnpm install --frozen-lockfile --filter "@hbe/web..." --ignore-scripts
COPY packages/shared packages/shared
COPY packages/web-runtime packages/web-runtime
COPY apps/web apps/web
RUN corepack enable && pnpm --filter @hbe/shared build && pnpm --filter @hbe/web-runtime build && pnpm --filter @hbe/web build

# Runtime: distroless, non-root uid 65532, files owned by root (read-only for the server).
FROM ${DISTROLESS}
# The base image already runs as 65532; create /app as root so the server cannot write to it.
USER 0:0
WORKDIR /app
COPY --from=build /repo/apps/web/out ./out
COPY --from=build /repo/apps/web/scripts/serve.mjs ./scripts/serve.mjs
USER 65532:65532
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["scripts/serve.mjs"]
