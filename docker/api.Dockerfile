# cod-server (Hono on Node.js). Build from the repo root:
#   docker build -f docker/api.Dockerfile .
FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY cod-shared/package.json cod-shared/
COPY cod-server/package.json cod-server/
COPY cod-client-astro/package.json cod-client-astro/
COPY cod-astro/theme01/package.json cod-astro/theme01/
RUN npm ci --ignore-scripts --workspace codflow-server --workspace cod-shared
COPY cod-shared cod-shared
COPY cod-server cod-server
WORKDIR /app/cod-server
ENV PORT=8787
EXPOSE 8787
CMD ["npx", "tsx", "src/node.ts"]
