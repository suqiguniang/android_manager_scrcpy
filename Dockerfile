
# Stage 1: Build Frontend
FROM node:20-alpine AS builder

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++ libc6-compat && ln -sf python3 /usr/bin/python

WORKDIR /app

# Copy source first (needed for postinstall scripts like prisma generate)
COPY . .

# Install dependencies (postinstall will run prisma generate, fetch-scrcpy-server, etc.)
RUN npm install

# Build frontend
RUN npm run build
# Prune dev dependencies is tricky with ignore-scripts, so we skip it in builder
# as we copy specific folders in next stage

# Stage 2: Production Runtime
FROM node:20-alpine

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    android-tools \
    openssl \
    python3 \
    make \
    g++ \
    udev

# Copy artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src ./src

# Install production dependencies
RUN npm install --omit=dev --ignore-scripts

# 1. Fetch scrcpy server (explicitly)
RUN npx @yume-chan/fetch-scrcpy-server v3.3.3

# 2. Generate Prisma Client
RUN npx prisma generate

# 3. Generate certificates
RUN node scripts/generate-cert.js

# 4. Rebuild native modules (better-sqlite3)
RUN npm rebuild better-sqlite3

# Create certificate directory (just in case)
RUN mkdir -p certs

# Copy startup script
COPY start.sh .
RUN sed -i 's/\r$//' start.sh
RUN chmod +x start.sh

# Expose port
EXPOSE 8080

# Environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Start the application with ADB server
CMD ["./start.sh"]
