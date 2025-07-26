#!/bin/bash

# Hetzner Deployment Script for Voice Assistant Backend
# Usage: ./deploy.sh [--no-install] [--logs]

set -e

echo "🚀 Deploying Voice Assistant Backend to Hetzner..."

# Parse command line arguments
NO_INSTALL=false
SHOW_LOGS=false

for arg in "$@"; do
  case $arg in
    --no-install)
      NO_INSTALL=true
      shift
      ;;
    --logs)
      SHOW_LOGS=true
      shift
      ;;
    *)
      echo "Unknown option: $arg"
      echo "Usage: $0 [--no-install] [--logs]"
      exit 1
      ;;
  esac
done

# Function to run commands on Hetzner server
run_remote() {
  echo "📡 Running on server: $1"
  ssh hetzner "$1"
}

# Function to check if server is reachable
check_server() {
  echo "🔍 Checking server connectivity..."
  if ! ssh -o ConnectTimeout=5 hetzner "echo 'Server is reachable'" > /dev/null 2>&1; then
    echo "❌ Cannot connect to Hetzner server. Please check:"
    echo "   - SSH configuration for 'hetzner' host"
    echo "   - Server is running and accessible"
    echo "   - SSH key is properly configured"
    exit 1
  fi
  echo "✅ Server connectivity confirmed"
}

# Main deployment function
deploy() {
  check_server
  
  echo "📦 Pulling latest code..."
  run_remote "cd voice-assistant-backend && git pull origin main"
  
  if [ "$NO_INSTALL" = false ]; then
    echo "📥 Installing dependencies..."
    run_remote "cd voice-assistant-backend && npm install --production"
    
    echo "🗄️ Running database migrations..."
    run_remote "cd voice-assistant-backend && npm run migrate"
  fi
  
  echo "🔄 Restarting services..."
  run_remote "cd voice-assistant-backend && pm2 restart ecosystem.config.js"
  
  echo "⏳ Waiting for services to start..."
  sleep 5
  
  echo "📊 Checking service status..."
  run_remote "pm2 status"
  
  echo "🏥 Health check..."
  if run_remote "curl -f http://localhost:3000/health > /dev/null 2>&1"; then
    echo "✅ Health check passed"
  else
    echo "⚠️ Health check failed - checking logs..."
    run_remote "pm2 logs --lines 10"
  fi
  
  if [ "$SHOW_LOGS" = true ]; then
    echo "📝 Recent logs:"
    run_remote "pm2 logs --lines 20"
  fi
  
  echo "🎉 Deployment completed successfully!"
  echo "📊 Service status:"
  run_remote "pm2 status"
}

# Run deployment
deploy