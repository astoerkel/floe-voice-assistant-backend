#!/bin/bash

# Server Diagnostic Commands for JWT Authentication Issues
# Run these commands on the Hetzner server (floe.cognetica.de)

echo "=== VOICE ASSISTANT BACKEND JWT DIAGNOSTICS ==="
echo "Timestamp: $(date)"
echo "Server: $(hostname)"
echo

echo "1. PM2 PROCESS STATUS:"
pm2 status

echo
echo "2. PM2 LOGS (Last 50 lines):"
pm2 logs --lines 50

echo
echo "3. ENVIRONMENT VARIABLES CHECK:"
pm2 show voice-assistant-backend 2>/dev/null || pm2 show 0 2>/dev/null || echo "PM2 process not found"

echo
echo "4. JWT DEBUG SCRIPT:"
echo "Running JWT diagnostics..."
cd /app || cd /root/voice-assistant-backend || cd /home/voice-assistant-backend || echo "Could not find app directory"
node debug-jwt.js

echo
echo "5. SYSTEM RESOURCES:"
echo "Memory usage:"
free -h
echo
echo "Disk usage:"
df -h
echo
echo "CPU usage:"
top -bn1 | grep "Cpu(s)" | head -1

echo
echo "6. NETWORK CONNECTIVITY:"
echo "Test database connection:"
nc -zv localhost 5432 2>&1 || echo "Database connection test failed"
echo
echo "Test Redis connection:"
nc -zv localhost 6379 2>&1 || echo "Redis connection test failed"

echo
echo "7. LOG FILE ANALYSIS:"
echo "Recent JWT/authentication errors:"
if [ -f "/app/logs/error.log" ]; then
    tail -100 /app/logs/error.log | grep -i -E "(jwt|token|auth|401|500)" | tail -10
elif [ -f "/root/voice-assistant-backend/error.log" ]; then
    tail -100 /root/voice-assistant-backend/error.log | grep -i -E "(jwt|token|auth|401|500)" | tail -10
else
    echo "Error log file not found"
fi

echo
echo "8. DATABASE STATUS:"
if command -v psql &> /dev/null; then
    echo "PostgreSQL status:"
    systemctl status postgresql | head -5
    echo
    echo "Database connectivity test:"
    PGPASSWORD="${DATABASE_PASSWORD:-password}" psql -h localhost -U "${DATABASE_USER:-postgres}" -d "${DATABASE_NAME:-voiceassistant}" -c "SELECT COUNT(*) as user_count FROM users;" 2>&1 || echo "Database query failed"
else
    echo "psql not available"
fi

echo
echo "9. CADDY/NGINX STATUS:"
if systemctl is-active --quiet caddy; then
    echo "Caddy is running"
    systemctl status caddy | head -3
elif systemctl is-active --quiet nginx; then
    echo "Nginx is running"
    systemctl status nginx | head -3
else
    echo "No reverse proxy detected"
fi

echo
echo "10. RECENT API REQUESTS:"
echo "Looking for recent authentication failures in access logs..."
if [ -f "/var/log/caddy/access.log" ]; then
    tail -20 /var/log/caddy/access.log | grep -E "(401|500)" | tail -5
elif [ -f "/var/log/nginx/access.log" ]; then
    tail -20 /var/log/nginx/access.log | grep -E "(401|500)" | tail -5
else
    echo "Access logs not found"
fi

echo
echo "=== DIAGNOSTICS COMPLETE ==="
echo
echo "NEXT STEPS:"
echo "1. If PM2 process is not running: pm2 start ecosystem.config.js"
echo "2. If environment variables are missing: check .env file and pm2 restart"
echo "3. If database connection fails: check PostgreSQL service and connection string"
echo "4. If JWT secrets are missing: update environment variables and restart PM2"
echo "5. Send the output of this script for further analysis"