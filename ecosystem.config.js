module.exports = {
  apps: [
    {
      name: 'voice-assistant-api',
      script: 'src/app.js',
      instances: 1, // Single instance to avoid port conflicts
      exec_mode: 'fork', // Fork mode instead of cluster to prevent port binding issues
      watch: false,
      max_memory_restart: '500M',
      env_file: '.env',
      env: {
        NODE_ENV: 'production',
        PORT: 8080
      },
      error_file: '/opt/voice-assistant/logs/error.log',
      out_file: '/opt/voice-assistant/logs/out.log',
      log_file: '/opt/voice-assistant/logs/combined.log',
      time: true,
      merge_logs: true,
      restart_delay: 3000, // 3 second delay between restarts
      max_restarts: 5,
      min_uptime: '30s', // Must stay up 30s to be considered successful
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 8000
    }
  ]
};