# syntax=docker/dockerfile:1
# Shared Reading Lists - Next.js 16 (standalone output) on Node 24 LTS.
#   docker build --target check .   -> lint, type-check and tests (run with DATABASE_URL of an empty test database)
#   docker build .                  -> production-mode preview image (default, last stage)
ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    NPM_CONFIG_UPDATE_NOTIFIER=false
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS check
COPY . .
ENV APP_ENV=test
CMD ["npm", "run", "check"]

FROM deps AS build
COPY . .
RUN npm run build

FROM ${NODE_IMAGE} AS preview
WORKDIR /app
ARG APP_RELEASE=""
ARG PUBLIC_SENTRY_DSN=""
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=8080 \
    APP_RELEASE=${APP_RELEASE} \
    PUBLIC_SENTRY_DSN=${PUBLIC_SENTRY_DSN}
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 8080
# Apply migrations and the seed (idempotent), then serve on 0.0.0.0:$PORT.
CMD ["sh", "-c", "node dist/migrate.mjs && HOSTNAME=0.0.0.0 exec node server.js"]
