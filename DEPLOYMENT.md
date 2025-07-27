# Floe Backend Deployment Guide

This guide covers deploying the **clean Floe backend** to Hetzner Cloud. The backend was completely rebuilt on 2025-01-27 with working LangChain agents and real Google API integrations.

## ✅ Current Production Status
- **Location**: /opt/floe-backend (NEW - no longer /opt/voice-assistant)
- **Database**: floedb with floeuser (fully operational)
- **PM2**: 2x cluster instances running (restart count: 17+)
- **Domain**: https://floe.cognetica.de
- **Features**: Working LangChain + OpenRouter + Google APIs
- **Environment**: Production variables loaded from .env.hetzner-production
- **Last Updated**: 2025-01-27 (syntax fixes + env setup)
- **Status**: ✅ All endpoints tested and responding correctly

## Complete Clean Install

If you need to completely remove and rebuild the backend (as done on 2025-01-27):

### 1. Complete Removal of Old Backend
```bash
ssh hetzner

# Stop all PM2 processes
pm2 delete all
pm2 save

# Remove old backend directories
rm -rf /opt/voice-assistant
rm -rf /opt/voice-assistant-backend

# Clean up old database
sudo -u postgres psql -c "DROP DATABASE IF EXISTS voiceassistant;"
sudo -u postgres psql -c "DROP USER IF EXISTS voiceassistant;"

# Clear Redis cache
redis-cli FLUSHALL

# Clean PM2 logs
rm -rf ~/.pm2/logs/*
```

### 2. Create New Floe Backend
```bash
# Create directory structure
mkdir -p /opt/floe-backend/src/{config,controllers,services/{langchain,google},middleware,routes}
mkdir -p /opt/floe-backend/logs

# Set up database
sudo -u postgres psql -c "CREATE DATABASE floedb;"
sudo -u postgres psql -c "CREATE USER floeuser WITH PASSWORD 'floesecurepass123';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE floedb TO floeuser;"

# Create database tables
sudo -u postgres psql floedb << 'EOF'
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  google_id VARCHAR(255) UNIQUE,
  google_refresh_token TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE conversations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  query TEXT,
  response TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO floeuser;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO floeuser;
EOF
```

### 3. Deploy Application Files
The complete backend code structure should be deployed to `/opt/floe-backend/` including:
- `src/app.js` - Main Express application
- `src/services/langchain/agent.js` - LangChain agent with OpenRouter
- `src/services/google/auth.js` - Google OAuth & API integrations
- `package.json` with dependencies
- `ecosystem.config.js` for PM2
- `.env` with environment variables

### 4. Install and Start
```bash
cd /opt/floe-backend
npm install
pm2 start ecosystem.config.js --env production
pm2 save
```

## Prerequisites

1. **Hetzner Cloud Server** with Ubuntu/Debian
2. **SSH Access** configured with key `hetzner` in your SSH config
3. **Node.js 18+** and **npm** installed on the server
4. **PM2** installed globally on the server
5. **PostgreSQL** and **Redis** running on the server

## SSH Configuration

Add this to your `~/.ssh/config`:

```
Host hetzner
    HostName your-server-ip-or-domain
    User root
    IdentityFile ~/.ssh/your-private-key
    Port 22
```

## Initial Server Setup

```bash
# Connect to server
ssh hetzner

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
apt-get install -y nodejs

# Install PM2 globally
npm install -g pm2

# Install PostgreSQL and Redis
apt-get update
apt-get install -y postgresql postgresql-contrib redis-server

# Create application directory
mkdir -p /app
mkdir -p /opt/voice-assistant/logs
chown -R $USER:$USER /app
chown -R $USER:$USER /opt/voice-assistant
```

## Environment Setup

```bash
# On server: Create .env file
ssh hetzner
cd /app
cp .env.example .env
nano .env  # Edit with your configuration
```

## Deployment Commands

### Quick Deploy (Recommended)
```bash
# Deploy with the automated script
./deploy.sh

# Deploy without reinstalling dependencies
./deploy.sh --no-install

# Deploy and show logs
./deploy.sh --logs
```

### Manual Deployment Steps
```bash
# 1. Pull latest code
ssh hetzner 'cd /app && git pull origin main'

# 2. Install dependencies
ssh hetzner 'cd /app && npm install --production'

# 3. Run database migrations
ssh hetzner 'cd /app && npm run migrate'

# 4. Restart services
ssh hetzner 'cd /app && pm2 restart ecosystem.config.js'

# 5. Check status
ssh hetzner 'pm2 status'
```

## Service Management

### PM2 Commands
```bash
# Check service status
ssh hetzner 'pm2 status'

# View logs
ssh hetzner 'pm2 logs floe-backend'
ssh hetzner 'pm2 logs floe-backend --lines 50'

# Restart service
ssh hetzner 'pm2 restart floe-backend'

# Stop service
ssh hetzner 'pm2 stop floe-backend'

# Delete service (to reconfigure)
ssh hetzner 'pm2 delete floe-backend'

# Start service
ssh hetzner 'cd /opt/floe-backend && pm2 start ecosystem.config.js --env production'

# Save PM2 configuration
ssh hetzner 'pm2 save'
```

### Health Checks
```bash
# Check API health
ssh hetzner 'curl -f http://localhost:8080/health'

# Check processes
ssh hetzner 'ps aux | grep node'

# Check logs
ssh hetzner 'tail -f /opt/voice-assistant/logs/api-combined.log'
ssh hetzner 'tail -f /opt/voice-assistant/logs/worker-combined.log'
```

## Database Management

```bash
# Connect to PostgreSQL (new floedb)
ssh hetzner 'psql -d floedb -U floeuser'

# Check database connection
ssh hetzner 'psql -d floedb -U floeuser -c "SELECT current_database();"'

# View tables
ssh hetzner 'psql -d floedb -U floeuser -c "\dt"'

# Check users table
ssh hetzner 'psql -d floedb -U floeuser -c "SELECT count(*) FROM users;"'

# Check conversations table  
ssh hetzner 'psql -d floedb -U floeuser -c "SELECT count(*) FROM conversations;"'
```

## Environment Variables Setup

```bash
# Edit environment variables on server
ssh hetzner 'nano /opt/floe-backend/.env'

# Check current environment
ssh hetzner 'cd /opt/floe-backend && grep -v "SECRET\|KEY\|PASSWORD" .env'

# Required variables to configure:
# - OPENROUTER_API_KEY
# - GOOGLE_CLIENT_ID  
# - GOOGLE_CLIENT_SECRET
# - GOOGLE_APPLICATION_CREDENTIALS (path to service account JSON)
```

### ✅ Production Environment Update Process (2025-01-27)
```bash
# Complete process used for latest deployment:

# 1. Copy production environment from local file
scp .env.hetzner-production hetzner:/opt/floe-backend/.env

# 2. Update database URL to use floedb
ssh hetzner "cd /opt/floe-backend && sed -i 's/voiceassistant/floedb/g; s/voiceassistant123/floesecurepass123/g' .env"

# 3. Restart PM2 with environment update
ssh hetzner "cd /opt/floe-backend && pm2 restart floe-backend --update-env"

# 4. Verify all services are working
ssh hetzner "pm2 status && curl -s http://localhost:8080/health"
```

## Troubleshooting

### Common Issues

1. **Port 8080 already in use**
   ```bash
   ssh hetzner 'sudo lsof -ti:8080 | xargs -r sudo kill -9'
   ssh hetzner 'pm2 restart floe-backend'
   ```

2. **Database connection failed**
   ```bash
   # Check PostgreSQL status
   ssh hetzner 'systemctl status postgresql'
   
   # Test connection to floedb
   ssh hetzner 'psql -d floedb -U floeuser -c "SELECT 1;"'
   
   # Check connection string in .env
   ssh hetzner 'cd /opt/floe-backend && grep DATABASE_URL .env'
   ```

3. **Redis connection failed**
   ```bash
   # Check Redis status
   ssh hetzner 'systemctl status redis-server'
   
   # Test Redis connection
   ssh hetzner 'redis-cli ping'
   ```

4. **PM2 process not starting**
   ```bash
   # Check PM2 startup
   ssh hetzner 'pm2 startup'
   ssh hetzner 'pm2 save'
   
   # Reset PM2
   ssh hetzner 'pm2 kill && cd /opt/floe-backend && pm2 start ecosystem.config.js --env production'
   ```

5. **OpenRouter API errors**
   ```bash
   # Check if API key is set
   ssh hetzner 'cd /opt/floe-backend && grep OPENROUTER_API_KEY .env'
   
   # Test OpenRouter connectivity
   ssh hetzner 'curl -H "Authorization: Bearer YOUR_KEY" https://openrouter.ai/api/v1/models'
   ```

6. **Google API errors**
   ```bash
   # Check Google credentials file exists
   ssh hetzner 'ls -la /opt/floe-backend/google-credentials.json'
   
   # Check OAuth settings
   ssh hetzner 'cd /opt/floe-backend && grep GOOGLE_CLIENT .env'
   ```

7. **JavaScript syntax errors (escaped quotes/exclamation marks)**
   ```bash
   # Fix escaped exclamation marks in all JS files
   ssh hetzner "find /opt/floe-backend/src/ -name '*.js' -exec sed -i 's/\!/!/g' {} \;"
   
   # Fix smart quotes that cause syntax errors
   ssh hetzner "find /opt/floe-backend/src/ -name '*.js' -exec sed -i 's/'/'/g; s/'/'/g' {} \;"
   
   # Test if app starts without syntax errors
   ssh hetzner "cd /opt/floe-backend && timeout 5s node src/app.js || true"
   ```

8. **Environment variables not loading after .env update**
   ```bash
   # Always use --update-env flag when restarting after env changes
   ssh hetzner "cd /opt/floe-backend && pm2 restart floe-backend --update-env"
   
   # Verify environment variables are actually loaded
   ssh hetzner "curl -s -I http://localhost:8080/api/auth/google | grep client_id"
   ```

### Log Locations

- **Application Logs**: `/opt/floe-backend/logs/`
  - `combined.log` - All application logs
  - `error.log` - Error logs only
- **PM2 Logs**: `~/.pm2/logs/`
  - `floe-backend-out-0.log` - Stdout from instance 0
  - `floe-backend-error-0.log` - Stderr from instance 0
  - `floe-backend-out-1.log` - Stdout from instance 1
  - `floe-backend-error-1.log` - Stderr from instance 1
- **System Logs**: `/var/log/syslog`

### Performance Monitoring

```bash
# Server resources
ssh hetzner 'htop'
ssh hetzner 'df -h'
ssh hetzner 'free -h'

# PM2 monitoring
ssh hetzner 'pm2 monit'

# Database performance
ssh hetzner 'psql -d floedb -U floeuser -c "SELECT count(*) FROM users;"'
ssh hetzner 'psql -d floedb -U floeuser -c "SELECT count(*) FROM conversations;"'

# Check API response time
time curl https://floe.cognetica.de/health
```

## Backup and Recovery

### Database Backup
```bash
# Create backup of floedb
ssh hetzner 'pg_dump -U floeuser floedb > /backup/floedb_$(date +%Y%m%d_%H%M%S).sql'

# Restore backup
ssh hetzner 'psql -U floeuser floedb < /backup/floedb_backup.sql'

# Create compressed backup
ssh hetzner 'pg_dump -U floeuser floedb | gzip > /backup/floedb_$(date +%Y%m%d_%H%M%S).sql.gz'
```

### Environment Backup
```bash
# Backup environment and logs
ssh hetzner 'tar -czf /backup/floe_backup_$(date +%Y%m%d_%H%M%S).tar.gz /opt/floe-backend/.env /opt/floe-backend/logs/ /opt/floe-backend/google-credentials.json'

# Backup entire application directory
ssh hetzner 'tar -czf /backup/floe_full_backup_$(date +%Y%m%d_%H%M%S).tar.gz /opt/floe-backend/'
```

## Security

### Firewall Configuration
```bash
ssh hetzner 'ufw allow 22/tcp'    # SSH
ssh hetzner 'ufw allow 80/tcp'    # HTTP
ssh hetzner 'ufw allow 443/tcp'   # HTTPS
ssh hetzner 'ufw allow 8080/tcp'  # API (if directly exposed)
ssh hetzner 'ufw enable'
```

### SSL/TLS Setup
Consider using nginx as a reverse proxy with Let's Encrypt for SSL certificates.

## Monitoring and Alerts

Set up monitoring for:
- Server resources (CPU, memory, disk)
- Application health endpoints
- Database connectivity
- Redis connectivity
- PM2 process status

## Support

For deployment issues:
1. Check logs: `ssh hetzner 'pm2 logs'`
2. Verify environment variables
3. Check database and Redis connectivity
4. Review firewall and network settings