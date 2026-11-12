# Builds and runs HexBrain. The database lives in /app/data: mount a volume there to keep it.
FROM node:24-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY --from=build /app ./
VOLUME /app/data
EXPOSE 3000
CMD ["pnpm", "start"]
