# Build from the REPO ROOT so the workspace graph is available:
#   docker compose --profile full up   (or: docker build -f apps/api/Dockerfile .)
FROM node:22-alpine

WORKDIR /app

# Install with the full workspace manifest first for layer caching.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
# postinstall runs `prisma generate`, which needs the schema + config.
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma.config.ts apps/api/
COPY apps/api/src/env.ts apps/api/src/env.ts
RUN npm ci --workspace @sysdojo/api --workspace @sysdojo/shared --include-workspace-root

COPY packages/shared packages/shared
COPY apps/api apps/api
COPY content content

ENV NODE_ENV=production
ENV CONTENT_DIR=/app/content
EXPOSE 3000

WORKDIR /app/apps/api
# Apply migrations, then serve. DATABASE_URL comes from the environment.
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
