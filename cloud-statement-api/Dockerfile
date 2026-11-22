# Build the React dashboard and API into ONE Render Free container.
FROM node:22-bookworm-slim AS dashboard
WORKDIR /web
COPY dashboard/package.json ./
RUN npm install --no-audit --no-fund
COPY dashboard/ ./
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY src ./src
COPY --from=dashboard /web/dist ./public
USER node
EXPOSE 10000
CMD ["node","src/main.mjs"]
