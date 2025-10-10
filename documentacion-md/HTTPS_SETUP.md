# 🔐 Configuración HTTPS para Adomi Backend

Guía completa para configurar HTTPS en el backend de Adomi siguiendo la estructura del proyecto Iris.

## 📋 Índice

1. [Configuración de Desarrollo](#desarrollo)
2. [Configuración de Producción](#producción)
3. [Certificados SSL](#certificados)
4. [Scripts de Despliegue](#scripts)
5. [Solución de Problemas](#troubleshooting)

---

## 🛠️ Configuración de Desarrollo

### 1. Generar Certificados Auto-firmados

**Windows:**
```bash
generate-dev-certs.bat
```

**Linux/Mac:**
```bash
chmod +x generate-dev-certs.sh
./generate-dev-certs.sh
```

### 2. Configurar Variables de Entorno

Agregar al archivo `.env`:

```env
# Configuración HTTPS para desarrollo
HTTPS_PORT=3443
KEY_PATH=./ssl/key.pem
CERT_PATH=./ssl/cert.pem
HTTP_PORT=3000
```

### 3. Iniciar Servidor

```bash
npm run dev
```

### 4. Acceder a la Aplicación

- **HTTPS**: https://localhost:3443
- **HTTP**: http://localhost:3000
- **API Docs**: https://localhost:3443/docs

---

## 🚀 Configuración de Producción

### 1. Obtener Certificados Let's Encrypt

```bash
# Instalar Certbot
sudo apt update
sudo apt install certbot

# Obtener certificado para tu dominio
sudo certbot certonly --standalone -d tu-dominio.com -d www.tu-dominio.com

# Los certificados se guardan en:
# /etc/letsencrypt/live/tu-dominio.com/privkey.pem
# /etc/letsencrypt/live/tu-dominio.com/fullchain.pem
```

### 2. Configurar Variables de Entorno

Usar el archivo `https-config.example.env` como base:

```env
# Configuración HTTPS para producción
HTTPS_PORT=443
HTTP_PORT=80
KEY_PATH=/etc/letsencrypt/live/tu-dominio.com/privkey.pem
CERT_PATH=/etc/letsencrypt/live/tu-dominio.com/fullchain.pem
IP=0.0.0.0

# Base de datos Azure MySQL
DB_HOST=adomi-db-serve.mysql.database.azure.com
DB_PORT=3306
DB_USER=adomi_admin
DB_PASSWORD=tu_contraseña_real
DB_NAME=adomi

# URLs de producción
FRONTEND_URL=https://tu-dominio.com
WEBHOOK_URL=https://tu-dominio.com/webhooks/stripe

# CORS
ALLOWED_ORIGINS=https://tu-dominio.com,https://www.tu-dominio.com
```

### 3. Configurar Permisos

```bash
# Dar permisos de lectura a los certificados
sudo chmod 644 /etc/letsencrypt/live/tu-dominio.com/fullchain.pem
sudo chmod 600 /etc/letsencrypt/live/tu-dominio.com/privkey.pem

# Permitir que Node.js use puerto 443
sudo setcap cap_net_bind_service=+ep /usr/bin/node
```

### 4. Configurar Firewall

```bash
# Abrir puertos necesarios
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# Verificar puertos abiertos
sudo netstat -tlnp | grep :443
sudo netstat -tlnp | grep :80
```

### 5. Configurar Renovación Automática

```bash
# Agregar a crontab
sudo crontab -e

# Agregar línea:
0 12 * * * /usr/bin/certbot renew --quiet && systemctl reload nginx
```

---

## 🔧 Scripts de Despliegue

### PM2 para Producción

```bash
# Instalar PM2
npm install -g pm2

# Usar configuración del ecosystem
pm2 start ecosystem.config.js --env production

# Guardar configuración
pm2 save

# Configurar auto-start
pm2 startup
```

### Scripts Disponibles

```bash
# Desarrollo
npm run dev

# Producción
npm run build
npm start

# PM2
pm2 start ecosystem.config.js
pm2 stop adomi-backend-https
pm2 restart adomi-backend-https
pm2 logs adomi-backend-https
```

---

## 🔍 Verificación de Funcionamiento

### 1. Verificar Certificados

```bash
# Verificar certificado SSL
openssl s_client -connect tu-dominio.com:443 -servername tu-dominio.com

# Verificar fecha de expiración
openssl x509 -in /etc/letsencrypt/live/tu-dominio.com/fullchain.pem -text -noout | grep "Not After"
```

### 2. Verificar Servidor

```bash
# Health check
curl -k https://localhost:3443/health

# API Docs
curl -k https://localhost:3443/docs
```

### 3. Verificar en Navegador

- https://tu-dominio.com/health
- https://tu-dominio.com/docs
- Verificar que el certificado sea válido

---

## 🚨 Solución de Problemas

### Error: "EACCES: permission denied, bind EADDRINUSE :443"

```bash
# Solución 1: Usar setcap
sudo setcap cap_net_bind_service=+ep /usr/bin/node

# Solución 2: Usar PM2 con sudo
sudo pm2 start ecosystem.config.js

# Solución 3: Verificar proceso en puerto 443
sudo lsof -i :443
```

### Error: "ENOENT: no such file or directory"

```bash
# Verificar rutas de certificados
ls -la /etc/letsencrypt/live/tu-dominio.com/

# Verificar permisos
sudo chmod 644 /etc/letsencrypt/live/tu-dominio.com/fullchain.pem
sudo chmod 600 /etc/letsencrypt/live/tu-dominio.com/privkey.pem
```

### Error: "EADDRINUSE: address already in use"

```bash
# Verificar procesos en puertos
sudo netstat -tlnp | grep :443
sudo netstat -tlnp | grep :80

# Matar proceso si es necesario
sudo kill -9 PID_DEL_PROCESO
```

### Certificado Expirado

```bash
# Renovar certificado
sudo certbot renew

# Reiniciar servidor
pm2 restart adomi-backend-https
```

---

## 📊 Estructura de Archivos

```
backend/
├── src/
│   └── index.ts              # Servidor principal con soporte HTTPS
├── ssl/                      # Certificados para desarrollo
│   ├── key.pem
│   └── cert.pem
├── logs/                     # Logs de aplicación
├── ecosystem.config.js       # Configuración PM2
├── generate-dev-certs.bat    # Script Windows para certificados dev
├── generate-dev-certs.sh     # Script Linux/Mac para certificados dev
├── https-config.example.env  # Ejemplo de configuración HTTPS
└── HTTPS_SETUP.md           # Esta guía
```

---

## 🔗 URLs de Referencia

- **Let's Encrypt**: https://letsencrypt.org/
- **Certbot**: https://certbot.eff.org/
- **PM2**: https://pm2.keymetrics.io/
- **Node.js HTTPS**: https://nodejs.org/api/https.html

---

## ✅ Checklist de Despliegue

- [ ] Certificados SSL obtenidos y configurados
- [ ] Variables de entorno configuradas
- [ ] Permisos de certificados configurados
- [ ] Firewall configurado (puertos 80, 443)
- [ ] Renovación automática configurada
- [ ] PM2 configurado para producción
- [ ] Health check funcionando
- [ ] API Docs accesible
- [ ] CORS configurado correctamente
- [ ] Logs configurados

---

**¡Adomi Backend HTTPS - Configuración completa! 🚀**


