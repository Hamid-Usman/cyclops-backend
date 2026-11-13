# syntax=docker/dockerfile:1

# Same major Node version as local development. Nest's packages are ESM only
# and load through require(esm), which needs Node 20.19+ or 22.12+.
ARG NODE_VERSION=24

# ---- base: shared starting point for every stage ---------------------------
FROM node:${NODE_VERSION}-alpine AS base
WORKDIR /app

# ---- build: install everything (dev tools included) and compile ------------
FROM base AS build
# Copy only the dependency files first. Docker caches each step, so as long
# as these two files don't change, the slow `npm ci` is reused on rebuilds.
COPY package.json package-lock.json ./
# The cache mount keeps npm's download cache between builds, outside the image.
RUN --mount=type=cache,target=/root/.npm npm ci

COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---- prod-deps: only the packages the app needs at runtime -----------------
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

# ---- runtime: the image that actually ships --------------------------------
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000

# Files stay owned by root and the app runs as the unprivileged `node` user,
# so a compromised process can't rewrite its own code.
COPY package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

USER node
EXPOSE 3000

# Docker marks the container unhealthy if the API stops answering.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Exec form (a JSON array) makes node process 1, so it receives the stop
# signal from `docker stop` directly and can shut down cleanly.
CMD ["node", "dist/main.js"]
