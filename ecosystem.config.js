module.exports = {
  apps: [{
    name: 'adomi-backend-https',
    script: 'dist/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      HTTPS_PORT: 443,
      HTTP_PORT: 80,
      IP: '0.0.0.0'
    },
    env_development: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_staging: {
      NODE_ENV: 'staging',
      PORT: 3000,
      HTTPS_PORT: 443,
      HTTP_PORT: 80
    },
    // Configuración de logs
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    
    // Configuración de reinicio
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    
    // Configuración de errores
    min_uptime: '10s',
    max_restarts: 10,
    
    // Configuración de cluster
    kill_timeout: 5000,
    listen_timeout: 3000,
    
    // Variables de entorno específicas del servidor
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
      HTTPS_PORT: 443,
      HTTP_PORT: 80,
      IP: '0.0.0.0',
      KEY_PATH: '/etc/letsencrypt/live/tu-dominio.com/privkey.pem',
      CERT_PATH: '/etc/letsencrypt/live/tu-dominio.com/fullchain.pem',
      DB_HOST: 'adomi-db-serve.mysql.database.azure.com',
      DB_PORT: 3306,
      DB_USER: 'adomi_admin',
      DB_NAME: 'adomi',
      // Agregar otras variables de producción aquí
    }
  }]
};







