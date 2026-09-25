FROM node:22-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages

RUN corepack enable && pnpm install --frozen-lockfile

EXPOSE 3000
CMD ["pnpm", "--filter", "@lumen/server", "start"]
