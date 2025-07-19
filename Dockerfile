# Production Dockerfile for Voice Assistant Backend
FROM node:18-alpine AS base

# Install production dependencies
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
FROM base AS deps
RUN npm ci --only=production

# Build stage
FROM base AS build
COPY package*.json ./
RUN npm ci
COPY . .
# If you have a build step, add it here
# RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Add non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

WORKDIR /app

# Copy production dependencies
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy application code
COPY --chown=nodejs:nodejs package*.json ./
COPY --chown=nodejs:nodejs src ./src
COPY --chown=nodejs:nodejs start.js ./

# Set production environment
ENV NODE_ENV=production
ENV PORT=8080

# Expose port
EXPOSE 8080

# Switch to non-root user
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"

# Start the application
CMD ["node", "start.js"]