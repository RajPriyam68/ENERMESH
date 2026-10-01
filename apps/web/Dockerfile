FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json .npmrc ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY . .
ARG API_INTERNAL_URL=http://api:3001
ARG NEXT_PUBLIC_API_BASE_URL=/api/v1
ARG NEXT_PUBLIC_SOCKET_URL=
ARG NEXT_PUBLIC_CHAIN_ID=80002
ARG NEXT_PUBLIC_CHAIN_NAME=polygon-amoy
ARG NEXT_PUBLIC_RPC_URL=https://rpc-amoy.polygon.technology
ARG NEXT_PUBLIC_BLOCK_EXPLORER_URL=https://amoy.polygonscan.com
ARG NEXT_PUBLIC_CONTRACT_ADDRESS=
ENV API_INTERNAL_URL=$API_INTERNAL_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_CHAIN_ID=$NEXT_PUBLIC_CHAIN_ID
ENV NEXT_PUBLIC_CHAIN_NAME=$NEXT_PUBLIC_CHAIN_NAME
ENV NEXT_PUBLIC_RPC_URL=$NEXT_PUBLIC_RPC_URL
ENV NEXT_PUBLIC_BLOCK_EXPLORER_URL=$NEXT_PUBLIC_BLOCK_EXPLORER_URL
ENV NEXT_PUBLIC_CONTRACT_ADDRESS=$NEXT_PUBLIC_CONTRACT_ADDRESS
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w packages/shared && npm run build -w apps/web

FROM node:22-alpine AS runner
WORKDIR /app
RUN addgroup -S enermesh \
  && adduser -S enermesh -G enermesh
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=build --chown=enermesh:enermesh /app/apps/web/.next/standalone ./
COPY --from=build --chown=enermesh:enermesh /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=enermesh:enermesh /app/apps/web/public ./apps/web/public
USER enermesh
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=8 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
