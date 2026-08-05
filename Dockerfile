# QR-Bite ships as a single image: the Express API serves the built React
# bundle from client/dist, so the diner's phone reaches the site and the API on
# one origin and Socket.io needs no separate host.

# --- build the client -------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

# Copy manifests first so `npm ci` is cached until a dependency actually changes.
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci

COPY client ./client
RUN npm run build

# --- runtime ----------------------------------------------------------------
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci --omit=dev && npm cache clean --force

COPY server/src ./server/src
COPY --from=build /app/client/dist ./client/dist

# Don't run as root.
USER node

# PORT is supplied by the platform; 5000 is the fallback in config/env.js.
EXPOSE 5000

# The health endpoint the platform polls is GET /api/health.
CMD ["node", "server/src/server.js"]
