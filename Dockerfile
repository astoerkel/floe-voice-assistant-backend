# Use the official Node.js image
FROM node:18

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install production dependencies only, skip scripts
RUN npm ci --only=production --ignore-scripts

# Copy the application including pre-generated Prisma client
COPY . .

# Expose port
EXPOSE 8080

# Start the application
CMD ["npm", "start"]