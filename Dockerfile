# ========================================
# Stage 1: Builder
# ========================================
FROM hub.nexdev.net/base/node:24-alpine-25h2 AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# ========================================
# Stage 2: Runtime Image
# ========================================
FROM hub.nexdev.net/base/node:24-alpine-25h2 AS runtime

# Don't run as root
RUN adduser --disabled-password \
    --home /app \
    --gecos '' nodeuser && chown -R nodeuser /app && chown -R nodeuser /tmp
USER nodeuser
#

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Set production environment
ENV NODE_ENV=production
ENV TZ="America/La_Paz"

ENV PORT=5000
EXPOSE 5000

# Start the application
ENTRYPOINT ["node", "dist/index.js"]
