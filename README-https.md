# Backend HTTPS/HTTP Setup (Ports, Certs, Entry Points)

Guía breve para correr el backend con HTTPS en 443 (o cualquier puerto), usar HTTP en desarrollo, y saber dónde está la lógica.

## Archivos clave
- `src/server-new.ts` (entry point principal): lee variables de entorno y levanta HTTPS/HTTP + Socket.IO.
- `src/app.ts`: define el `Express` (middlewares, módulos, rutas).
- `https-config.example.env`: plantilla de variables para HTTPS.
- `generate-dev-certs.sh/.bat`: genera certificados autofirmados para pruebas locales.
- `ecosystem.config.js`: ejemplo PM2 (puedes apuntar a `dist/server-new.js`).

## Variables de entorno relevantes
```env
IP=0.0.0.0                # Bind IP
PORT=3001                 # HTTP fallback/dev
HTTP_PORT=80              # Opcional: expone HTTP (útil para redirigir o health sin SSL)
HTTPS_PORT=443            # Puerto HTTPS; si hay KEY_PATH/CERT_PATH y no se define, asume 443
KEY_PATH=/ruta/privkey.pem
CERT_PATH=/ruta/fullchain.pem
NODE_ENV=production
# Opcional: SKIP_DB_CHECK=true (omite chequeo inicial de DB)
```

Reglas de `server-new.ts`:
- Si existen `KEY_PATH` y `CERT_PATH` y no se definió `HTTPS_PORT`, se usa 443 por defecto.
- Si hay `HTTPS_PORT`, `KEY_PATH`, `CERT_PATH` → levanta HTTPS; si además hay `HTTP_PORT`, levanta HTTP en paralelo (mismo `app`, sin redirección automática).
- Si falla HTTPS o faltan certs → fallback a HTTP en `PORT` (modo dev).
- `logEndpoints()` imprime health `/health` y `/auth/login` para cada server activo.
- Socket.IO se monta sobre el/los servidores creados (HTTP/HTTPS).

## Pasos rápidos para producción en 443
1) Coloca los certificados en el servidor (por ej. Let’s Encrypt):
   - `KEY_PATH=/etc/letsencrypt/live/tudominio/privkey.pem`
   - `CERT_PATH=/etc/letsencrypt/live/tudominio/fullchain.pem`
2) Exporta variables o crea `.env` con:
   ```env
   NODE_ENV=production
   IP=0.0.0.0
   HTTPS_PORT=443
   HTTP_PORT=80        # opcional, para servir HTTP en paralelo o hacer redirect en nginx
   KEY_PATH=/etc/letsencrypt/live/tudominio/privkey.pem
   CERT_PATH=/etc/letsencrypt/live/tudominio/fullchain.pem
   ```
3) Construye y arranca:
   ```bash
   npm install
   npm run build
   node dist/server-new.js
   ```
   o con PM2:
   ```bash
   pm2 start ecosystem.config.js --only adomi-server
   ```

## Desarrollo con HTTPS local
1) Genera certs de prueba:
   - Windows: `generate-dev-certs.bat`
   - Unix/Mac: `bash generate-dev-certs.sh`
2) Usa un `.env` dev:
   ```env
   NODE_ENV=development
   IP=0.0.0.0
   HTTPS_PORT=3443
   KEY_PATH=./certs/dev-key.pem
   CERT_PATH=./certs/dev-cert.pem
   PORT=3001          # fallback HTTP
   ```
3) Arranca: `npm run dev` (si apunta a `ts-node`) o `npm run build && node dist/server-new.js`.

## Redirección HTTP→HTTPS
El servidor HTTP actual sirve la misma app; no fuerza redirect. Si quieres redirigir:
- Opción 1: Hacer redirect en el reverse proxy (nginx/ALB) y solo exponer HTTPS al Node.
- Opción 2: Añadir middleware en el HTTP server para 301 → `https://host` (no incluido por defecto).

## Salud y diagnóstico
- Health: `GET /health`
- Rutas: `GET /__debug/routes`
- Logs iniciales: muestran IP/puertos, presencia de certs y estado de conexión a DB.

## Dónde tocar
- Cambiar puertos/certs: variables de entorno mencionadas arriba.
- Lógica de arranque: `src/server-new.ts`
  - Creación HTTPS: líneas ~70-145.
  - HTTP opcional: líneas ~146-193.
  - Fallback HTTP dev: líneas ~207-245.
- App/middlewares: `src/app.ts`

## Checklist rápido
- Certificados existen y rutas correctas (`KEY_PATH`, `CERT_PATH`).
- `HTTPS_PORT` definido o dejar que auto-use 443.
+- Opcional: `HTTP_PORT` si necesitas puerto 80.
- Firewall/SG abre 443 (y 80 si aplica).
- `NODE_ENV=production` para comportamiento esperado en logs.

## Claves y certificados (KEY_PATH / CERT_PATH)
- `KEY_PATH`: ruta absoluta al `privkey.pem` (clave privada).
- `CERT_PATH`: ruta absoluta al certificado público (usualmente `fullchain.pem` de Let’s Encrypt).
- Validaciones en `server-new.ts`:
  - Si no existen los archivos → lanza error y cae a fallback HTTP.
  - Si hay KEY/CERT y no hay `HTTPS_PORT` → fija 443 automáticamente.
- Buenas prácticas al migrar a otro proyecto:
  - No comitear certs/keys en el repo.
  - Montar las rutas vía variables de entorno o secretos del orquestador (Docker/K8s/PM2 con env).
  - En contenedores, monta `/etc/letsencrypt/live/...` como volumen de solo lectura.
  - Renueva con certbot en el host o en un sidecar; no necesita reiniciar Node si usas proxy inverso que recarga certs (nginx/ALB/ingress).

### Ejemplo rápido Let’s Encrypt (Ubuntu host)
```bash
sudo apt-get install -y certbot
sudo certbot certonly --standalone -d tu-dominio.com
# Certs típicos:
# /etc/letsencrypt/live/tu-dominio.com/privkey.pem
# /etc/letsencrypt/live/tu-dominio.com/fullchain.pem

export KEY_PATH=/etc/letsencrypt/live/tu-dominio.com/privkey.pem
export CERT_PATH=/etc/letsencrypt/live/tu-dominio.com/fullchain.pem
export HTTPS_PORT=443
node dist/server-new.js
```

### Ejemplo docker-compose (montando certs)
```yaml
services:
  api:
    image: tuimagen/backend
    ports:
      - "443:443"
      - "80:80"
    environment:
      NODE_ENV: production
      HTTPS_PORT: 443
      HTTP_PORT: 80
      KEY_PATH: /certs/privkey.pem
      CERT_PATH: /certs/fullchain.pem
    volumes:
      - /etc/letsencrypt/live/tu-dominio.com/privkey.pem:/certs/privkey.pem:ro
      - /etc/letsencrypt/live/tu-dominio.com/fullchain.pem:/certs/fullchain.pem:ro
```

### Migrar la lógica a otro aplicativo
- Copia el patrón de `server-new.ts`:
  - Lee env `KEY_PATH`, `CERT_PATH`, `HTTPS_PORT`, `HTTP_PORT`, `PORT`.
  - Valida existencia de archivos antes de crear `https.createServer`.
  - Si faltan o fallan, cae a HTTP (modo dev) o loguea error.
- Mantén `createApp()` separado para reutilizar el mismo `app` en HTTP/HTTPS.
- Si usas otro framework, preserva:
  - Lectura de certs con `fs.readFileSync(KEY_PATH)` y `fs.readFileSync(CERT_PATH)`.
  - Socket.IO (u otro websocket) montado sobre el server HTTPS/HTTP que expongas.
- Para redirecciones forzadas, hazlo en proxy inverso (nginx/ALB) o agrega un pequeño handler en el server HTTP que devuelva 301 a `https://host`.

