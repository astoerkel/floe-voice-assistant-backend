# Hetzner Deployment Guide

This guide covers deploying the Voice Assistant Backend to Hetzner Cloud using SSH-based deployment.

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
# Check all services status
ssh hetzner 'pm2 status'

# View logs
ssh hetzner 'pm2 logs'
ssh hetzner 'pm2 logs voice-assistant-api'
ssh hetzner 'pm2 logs voice-assistant-worker'

# Restart services
ssh hetzner 'pm2 restart all'
ssh hetzner 'pm2 restart voice-assistant-api'
ssh hetzner 'pm2 restart voice-assistant-worker'

# Stop services
ssh hetzner 'pm2 stop all'

# Delete services (to reconfigure)
ssh hetzner 'pm2 delete all'

# Start services
ssh hetzner 'cd /app && pm2 start ecosystem.config.js'
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
# Connect to PostgreSQL
ssh hetzner 'psql -d voice_assistant'

# Run migrations
ssh hetzner 'cd /app && npm run migrate'

# Generate Prisma client
ssh hetzner 'cd /app && npx prisma generate'

# View database schema
ssh hetzner 'cd /app && npx prisma db pull'
```

## Troubleshooting

### Common Issues

1. **Port 8080 already in use**
   ```bash
   ssh hetzner 'sudo lsof -ti:8080 | xargs -r sudo kill -9'
   ssh hetzner 'pm2 restart voice-assistant-api'
   ```

2. **Database connection failed**
   ```bash
   # Check PostgreSQL status
   ssh hetzner 'systemctl status postgresql'
   
   # Check connection string in .env
   ssh hetzner 'cd /app && grep DATABASE_URL .env'
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
   ssh hetzner 'pm2 kill && pm2 start ecosystem.config.js'
   ```

### Log Locations

- API Logs: `/opt/voice-assistant/logs/api-*.log`
- Worker Logs: `/opt/voice-assistant/logs/worker-*.log`
- PM2 Logs: `~/.pm2/logs/`
- System Logs: `/var/log/syslog`

### Performance Monitoring

```bash
# Server resources
ssh hetzner 'htop'
ssh hetzner 'df -h'
ssh hetzner 'free -h'

# PM2 monitoring
ssh hetzner 'pm2 monit'

# Database performance
ssh hetzner 'cd /app && npx prisma db pull'
```

## Backup and Recovery

### Database Backup
```bash
# Create backup
ssh hetzner 'pg_dump voice_assistant > /backup/voice_assistant_$(date +%Y%m%d_%H%M%S).sql'

# Restore backup
ssh hetzner 'psql voice_assistant < /backup/voice_assistant_backup.sql'
```

### Environment Backup
```bash
# Backup environment and logs
ssh hetzner 'tar -czf /backup/app_backup_$(date +%Y%m%d_%H%M%S).tar.gz /app/.env /opt/voice-assistant/logs/'
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