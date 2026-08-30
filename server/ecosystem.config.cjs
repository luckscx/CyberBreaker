module.exports = {
  apps: [{
    name: 'cyberbreaker-server',
    script: 'dist/index.js',
    cwd: '/data/cyberbreaker/server',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3030,
      BASE_URL: 'https://nu.grissom.cn'
    },
    error_file: '/data/cyberbreaker/logs/server-error.log',
    out_file: '/data/cyberbreaker/logs/server-out.log',
    time: true
  }]
};
