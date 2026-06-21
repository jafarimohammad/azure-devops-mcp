ARG NODE_IMAGE=node:20-alpine

# ---- Build stage ----
FROM ${NODE_IMAGE} AS builder
ARG NPM_PROXY=""
ENV NPM_CONFIG_PROXY=$NPM_PROXY \
    NPM_CONFIG_HTTPS_PROXY=$NPM_PROXY
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Runtime stage ----
FROM ${NODE_IMAGE} AS runtime
ARG NPM_PROXY=""
ENV NPM_CONFIG_PROXY=$NPM_PROXY \
    NPM_CONFIG_HTTPS_PROXY=$NPM_PROXY \
    NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

ENV NPM_CONFIG_PROXY="" \
    NPM_CONFIG_HTTPS_PROXY=""

COPY --from=builder /app/dist ./dist

USER node

ENV MCP_TRANSPORT=http \
    HOST=0.0.0.0 \
    PORT=3000
EXPOSE 3000

CMD ["node", "dist/index.js"]
