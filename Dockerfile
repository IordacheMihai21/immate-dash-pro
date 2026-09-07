# Frontend (TanStack Start, built to a plain Node server via Nitro's
# node-server preset -- see vite.config.ts). Runs alongside
# document-ai-backend/Dockerfile in docker-compose.yml so the whole app
# comes up with one `docker compose up`, not a manual two-step start.

FROM node:22-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Baked into the client bundle at build time (Vite), unlike the runtime
# secrets in docker-compose.yml's `environment:` -- see .env.example for
# what each one does and why VITE_-prefixed vars are safe to ship to the
# browser (never put a real secret behind this prefix).
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_DOCUMENT_AI_BACKEND_URL
ARG VITE_SENTRY_DSN
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_DOCUMENT_AI_BACKEND_URL=$VITE_DOCUMENT_AI_BACKEND_URL \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN

RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000

RUN groupadd --system immapp && useradd --system --gid immapp immapp
COPY --from=builder --chown=immapp:immapp /app/.output ./.output
USER immapp

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
