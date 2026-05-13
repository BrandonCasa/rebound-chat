FROM node:22-alpine AS deps

WORKDIR /app/server
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

COPY server/package.json server/pnpm-lock.yaml server/pnpm-workspace.yaml ./
COPY server/prisma ./prisma
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

FROM node:22-alpine

WORKDIR /app/server
ENV NODE_ENV=production
ENV SERVER_ROLE=realtime

RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
COPY --from=deps /app/server/node_modules ./node_modules
COPY server ./
COPY shared /app/shared

CMD ["node", "./src/app.js"]
