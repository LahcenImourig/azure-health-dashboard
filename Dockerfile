# ---- Build Stage ----
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Production Stage ----
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Install AWS SDK for secrets fetching at startup
RUN npm init -y > /dev/null 2>&1 && \
    npm install @aws-sdk/client-secrets-manager --omit=dev && \
    rm package.json package-lock.json

# Copy standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY scripts/start.sh ./start.sh
RUN chmod +x start.sh

USER nextjs

EXPOSE 3000

CMD ["sh", "start.sh"]
