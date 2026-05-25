FROM node:22-alpine AS deps

WORKDIR /app/server
RUN corepack enable

COPY server/package.json server/pnpm-lock.yaml ./
COPY server/prisma ./prisma
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

FROM node:22-alpine

WORKDIR /app/server
ENV NODE_ENV=production
ENV SERVER_ROLE=api
ENV PORT=6001

RUN corepack enable
COPY --from=deps /app/server/node_modules ./node_modules
COPY server ./

EXPOSE 6001
CMD ["node", "./src/app.js"]
