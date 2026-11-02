FROM public.ecr.aws/docker/library/node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/companion/package.json apps/companion/package.json
COPY apps/extension/package.json apps/extension/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci
COPY . .
RUN npm run typecheck && npm run build && npm prune --omit=dev

FROM public.ecr.aws/docker/library/node:24-alpine
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/apps/server ./apps/server
COPY --from=build --chown=node:node /app/apps/companion/dist ./apps/companion/dist
COPY --from=build --chown=node:node /app/apps/extension/dist ./apps/extension/dist
COPY --from=build --chown=node:node /app/packages/shared ./packages/shared
COPY --from=build --chown=node:node /app/fixtures ./fixtures
USER node
EXPOSE 3000
CMD ["node","apps/server/dist/index.js"]
