# Storefront theme (Astro, Node adapter). Serves every channel; the visitor's
# hostname picks the channel. Build from the repo root:
#   docker build -f docker/storefront.Dockerfile .
FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY cod-shared/package.json cod-shared/
COPY cod-server/package.json cod-server/
COPY cod-client-astro/package.json cod-client-astro/
COPY cod-astro/theme01/package.json cod-astro/theme01/
RUN npm ci --ignore-scripts --workspace cod-astro-theme01
COPY cod-shared cod-shared
COPY cod-astro/theme01 cod-astro/theme01
RUN npm run build --workspace cod-astro-theme01
COPY docker/astro-server.mjs docker/astro-server.mjs
ENV HOST=0.0.0.0 PORT=4321 ASTRO_NODE_AUTOSTART=disabled
EXPOSE 4321
CMD ["node", "docker/astro-server.mjs", "cod-astro/theme01/dist/server/entry.mjs"]
