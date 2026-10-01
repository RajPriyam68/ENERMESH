FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY . .
RUN npm run build -w packages/shared \
  && npm run prisma:generate -w apps/api \
  && npm run build -w apps/api

FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl \
  && addgroup -S enermesh \
  && adduser -S enermesh -G enermesh
ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=3001
COPY --from=build --chown=enermesh:enermesh /app/package.json ./package.json
COPY --from=build --chown=enermesh:enermesh /app/node_modules ./node_modules
COPY --from=build --chown=enermesh:enermesh /app/packages/shared ./packages/shared
COPY --from=build --chown=enermesh:enermesh /app/apps/api ./apps/api
COPY --chown=enermesh:enermesh apps/api/docker-entrypoint.sh /app/apps/api/docker-entrypoint.sh
RUN chmod 755 /app/apps/api/docker-entrypoint.sh
USER enermesh
WORKDIR /app/apps/api
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=8 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/v1/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
