
# --- Development Dockerfile ---
FROM node:20-alpine
WORKDIR /app

# Install all dependencies (including devDependencies for Vite, concurrently, etc.)
COPY package.json package-lock.json* ./
RUN npm install

# Copy source code
COPY . .


# Expose both Vite and CalDAV proxy ports (now 4000 and 4001)
EXPOSE 4000 4001

# Default command: run both dev servers
CMD ["npm", "run", "dev:full"]
