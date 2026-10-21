FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
ARG BASE_PATH=""
ENV BASE_PATH=$BASE_PATH
COPY . .
RUN npx next build

# Web: Next.js standalone server (~150 MB RAM).
FROM node:24-alpine AS web
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]

# Jobs: migrations on start, then the ingest/digest scheduler.
FROM deps AS jobs
COPY tsconfig.json ./
COPY db ./db
COPY scripts ./scripts
COPY src/lib ./src/lib
ENV NODE_ENV=production
USER node
CMD ["sh", "-c", "npx tsx scripts/migrate.ts && npx tsx scripts/scheduler.ts"]
