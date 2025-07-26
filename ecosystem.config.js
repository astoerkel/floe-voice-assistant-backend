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
        PORT: 3000
      },
      error_file: '/opt/voice-assistant/logs/api-error.log',
      out_file: '/opt/voice-assistant/logs/api-out.log',
      log_file: '/opt/voice-assistant/logs/api-combined.log',
      time: true,
      merge_logs: true,
      restart_delay: 3000, // 3 second delay between restarts
      max_restarts: 5,
      min_uptime: '30s', // Must stay up 30s to be considered successful
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 8000
    },
    {
      name: 'voice-assistant-worker',
      script: 'src/worker.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '300M',
      env_file: '.env',
      env: {
        NODE_ENV: 'production'
      },
      error_file: '/opt/voice-assistant/logs/worker-error.log',
      out_file: '/opt/voice-assistant/logs/worker-out.log',
      log_file: '/opt/voice-assistant/logs/worker-combined.log',
      time: true,
      merge_logs: true,
      restart_delay: 5000, // 5 second delay for worker restarts
      max_restarts: 3,
      min_uptime: '60s', // Worker needs more time to stabilize
      kill_timeout: 10000
    }
  ]
};