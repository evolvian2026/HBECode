# syntax=docker/dockerfile:1.7
# Static web app served with the production security headers.
# docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=http://localhost:4000 -t hbe-web .
ARG REGISTRY=mirror.gcr.io/library

FROM ${REGISTRY}/node:22-bookworm-slim AS build
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} NEXT_TELEMETRY_DISABLED=1
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    corepack enable && pnpm install --frozen-lockfile --filter "@hbe/web..." --ignore-scripts
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN corepack enable && pnpm --filter @hbe/shared build && pnpm --filter @hbe/web build

FROM ${REGISTRY}/node:22-bookworm-slim
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/out ./out
COPY --from=build --chown=node:node /repo/apps/web/scripts/serve.mjs ./scripts/serve.mjs
USER node
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "scripts/serve.mjs"]
