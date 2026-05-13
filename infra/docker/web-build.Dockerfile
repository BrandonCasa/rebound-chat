FROM node:22-alpine AS build

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY client/frontend/package.json ./client/frontend/
COPY server/package.json server/pnpm-lock.yaml ./server/
COPY server/prisma ./server/prisma
COPY cdk/package.json ./cdk/
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .
RUN pnpm --filter rebound-web build

FROM scratch
COPY --from=build /app/client/frontend/build /dist
