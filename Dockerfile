FROM node:24-bookworm-slim AS build
RUN npm install --global pnpm@10.15.0
WORKDIR /build
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY server/package.json server/pnpm-lock.yaml server/pnpm-workspace.yaml ./server/
RUN pnpm --dir server install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm api:build && pnpm --dir server prune --prod

FROM node:24-bookworm-slim
WORKDIR /app
RUN groupadd --gid 10001 recall && useradd --uid 10001 --gid recall --no-create-home recall
COPY --from=build /build/server/node_modules ./node_modules
COPY --from=build /build/server/dist ./dist
COPY --from=build /build/dist/flashcard/browser ./public
ENV NODE_ENV=production HOST=127.0.0.1 PORT=3000 FRONTEND_PATH=/app/public DATABASE_PATH=/app/data/recall.sqlite
USER 10001:10001
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/server/src/main.js"]
