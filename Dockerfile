
# --- Development Dockerfile ---
FROM node:20-alpine
WORKDIR /app

# Install all dependencies (including devDependencies for Vite, concurrently, etc.)
COPY package.json package-lock.json* ./
RUN npm install

# Copy source code
COPY . .

# Build production bundle
RUN npm run build

# Expose both CalDAV proxy and preview ports
EXPOSE 4000 3000

# Run production server with CalDAV proxy
CMD ["npm", "run", "prod:full"]
