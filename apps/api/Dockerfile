# syntax=docker/dockerfile:1.7
# API (+ migration CLI). Build from the repo root: docker build -f apps/api/Dockerfile -t hbe-api .
ARG REGISTRY=mirror.gcr.io/library

FROM ${REGISTRY}/node:22-bookworm-slim AS build
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


FROM ${REGISTRY}/node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out /app
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# Migrations: docker run --rm -e DATABASE_ADMIN_URL=... -e HBE_APP_DB_PASSWORD=... hbe-api node node_modules/@hbe/db/dist/cli/migrate.js
CMD ["node", "--enable-source-maps", "dist/main.js"]
