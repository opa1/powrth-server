module.exports = {
  apps: [
    {
      name: 'powrth-server',
      script: 'dist/main.js',
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
      env_file: '.env',
    },
  ],
}
