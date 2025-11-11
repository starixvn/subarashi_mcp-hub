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
# Stage 2: Runtime (Production)
# ========================================
FROM hub.nexdev.net/base/node:24-alpine-25h2 AS runtime

# Set production environment
ENV NODE_ENV=production
ENV PORT=5000

# Create non-root user and group
RUN groupadd -r -g 1000 node && \
    useradd -r -u 1000 -g node node

# Set working directory with proper ownership
WORKDIR /app
RUN chown node:node /app

# Copy package files
COPY --chown=node:node package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy built application from builder stage
COPY --chown=node:node --from=builder /app/dist ./dist

# Expose port
EXPOSE 5000

# Switch to non-root user
USER node

# Start server (from compiled dist/)
CMD ["node", "dist/index.js"]
