# Merchant dashboard (Astro, Node adapter). Build from the repo root:
#   docker build -f docker/dashboard.Dockerfile --build-arg PUBLIC_API_URL=https://api.example.com .
FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY cod-shared/package.json cod-shared/
COPY cod-server/package.json cod-server/
COPY cod-client-astro/package.json cod-client-astro/
COPY cod-astro/theme01/package.json cod-astro/theme01/
RUN npm ci --ignore-scripts --workspace codflow-client-astro --workspace cod-shared
COPY cod-shared cod-shared
COPY cod-client-astro cod-client-astro
# The browser bundle's API origin is fixed at build time.
ARG PUBLIC_API_URL
ENV PUBLIC_API_URL=${PUBLIC_API_URL}
RUN npm run build --workspace codflow-client-astro
WORKDIR /app/cod-client-astro
ENV HOST=0.0.0.0 PORT=4321
EXPOSE 4321
CMD ["node", "dist/server/entry.mjs"]
