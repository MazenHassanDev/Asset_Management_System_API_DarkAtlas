FROM node:20-alpine

WORKDIR /app

# Install deps first (better layer caching). The compose mount masks /app/node_modules
# with an anonymous volume so these container-built (linux) modules are used, not the
# host's.
COPY package*.json ./
RUN npm ci

# Copy the rest of the source (overlaid by the bind mount in dev compose).
COPY . .

EXPOSE 5173

# Vite dev server with hot reload. --host binds 0.0.0.0 so it's reachable from
# the host. The /api proxy target is set via VITE_PROXY_TARGET in compose.
CMD ["npm", "run", "dev", "--", "--host"]
