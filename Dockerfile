# cv-editor web deployment: static React frontend + Express/Puppeteer backend.
# Puppeteer needs a real Chromium + its shared-lib dependencies, so the final
# stage is Debian slim (not alpine) with apt-installed Chrome deps.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    CV_DATA_DIR=/data \
    PORT=8420 \
    PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

RUN apt-get update && apt-get install -y --no-install-recommends \
      unzip ca-certificates fonts-liberation fonts-noto-color-emoji \
      libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
      libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
      libgbm1 libasound2 libpango-1.0-0 libcairo2 libx11-6 libxext6 \
      libxrender1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm install --no-save --no-audit --no-fund tsx \
    && npx puppeteer browsers install chrome

COPY server ./server
COPY src/lib ./src/lib
COPY src/vite-env.d.ts ./src/vite-env.d.ts
COPY templates ./templates
COPY tsconfig.json ./tsconfig.json
COPY --from=build /app/dist ./dist

RUN mkdir -p /data

EXPOSE 8420
VOLUME ["/data"]
CMD ["npx", "tsx", "server/index.ts"]
