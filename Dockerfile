FROM node:22.23.5-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM build AS test
COPY tests/ ./tests/
CMD ["npm", "test"]

FROM build AS production-dependencies
RUN npm prune --omit=dev

FROM node:22.23.5-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=production-dependencies /app/node_modules/ ./node_modules/
COPY --from=build /app/dist/ ./dist/
COPY proto/ ./proto/
USER node
CMD ["node", "dist/main.js"]
