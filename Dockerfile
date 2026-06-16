FROM node:22-slim AS builder
WORKDIR /workspace

COPY package*.json ./
RUN npm install && echo "USING_NODE22_INSTALL"

COPY . .
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY --from=builder /workspace/dist ./dist
COPY --from=builder /workspace/server.js ./server.js

ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
