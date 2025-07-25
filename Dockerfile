# Production Dockerfile for Voice Assistant Backend
FROM node:18-alpine AS base

# Install production dependencies
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Build stage - install all dependencies and generate Prisma client
FROM base AS build
COPY package*.json ./
COPY . .
RUN npm ci
RUN npx prisma generate

# Production dependencies stage  
FROM base AS deps
COPY package*.json ./
RUN npm ci --only=production --ignore-scripts

# Production stage
FROM node:18-alpine AS production

# Add non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

WORKDIR /app

# Copy production dependencies
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy generated Prisma client from build stage
COPY --from=build --chown=nodejs:nodejs /app/node_modules/.prisma ./node_modules/.prisma

# Copy application code
COPY --chown=nodejs:nodejs package*.json ./
COPY --chown=nodejs:nodejs src ./src
COPY --chown=nodejs:nodejs start.js ./
COPY --chown=nodejs:nodejs minimal-server.js ./
COPY --chown=nodejs:nodejs start-production.js ./

# Set production environment
ENV NODE_ENV=production
ENV PORT=8080

# Expose port
EXPOSE 8080

# Switch to non-root user
USER nodejs

# Health check
# Remove healthcheck - let Cloud Run handle it
# HEALTHCHECK removed - Cloud Run will check the port directly

# Start the application
CMD ["node", "start-production.js"]