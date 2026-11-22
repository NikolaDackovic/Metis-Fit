# GRIT API - production image. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t grit-api .
# Configuration comes only from environment variables (see apps/api/.env.example); no secrets in the image.

FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
# Manifests first so the dependency layer is cached between code changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/database/package.json packages/database/
COPY packages/design-tokens/package.json packages/design-tokens/
COPY packages/translations/package.json packages/translations/
COPY packages/validation/package.json packages/validation/
RUN pnpm install --frozen-lockfile --filter @grit/api...
COPY apps/api apps/api
COPY packages packages
RUN pnpm --filter @grit/api build \
 && pnpm --filter @grit/api deploy --prod --legacy /out \
 && rm -rf /out/dist && cp -r apps/api/dist /out/dist

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache tini
COPY --from=build --chown=node:node /out /app
# Built-in club photos, uploaded once to the media bucket on first start.
COPY --chown=node:node assets/club /app/assets/club
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:${PORT:-4000}/ready || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--enable-source-maps", "dist/server.js"]
