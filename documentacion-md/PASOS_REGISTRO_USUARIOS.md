# 🚀 PASOS PARA ACTIVAR REGISTRO DE USUARIOS

## ✅ **BUENAS NOTICIAS**

**El sistema de registro YA ESTÁ IMPLEMENTADO al 100%.**

Solo necesitas ejecutar 1 migración SQL para actualizar la tabla `users`.

---

## 📋 **PASO 1: EJECUTAR MIGRACIÓN SQL**

### **Opción A: Desde Terminal (Recomendado)**

```bash
# Ubicarte en la carpeta backend
cd C:\Users\Girraphic\Desktop\oficial_adomi\backend

# Ejecutar migración
mysql -u root -p adomiapp < migrations/001_update_users_table.sql
```

### **Opción B: Desde MySQL Workbench**

1. Abrir MySQL Workbench
2. Conectar a tu servidor MySQL
3. Seleccionar base de datos `adomiapp`
4. Abrir archivo: `backend/migrations/001_update_users_table.sql`
5. Ejecutar todo el script (⚡ icono de rayo)
6. Verificar que diga: "✅ Migración 001 completada exitosamente"

---

## 🧪 **PASO 2: PROBAR REGISTRO TRADICIONAL**

### **Iniciar servicios:**

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd adomi-app
ng serve
```

### **Probar en el navegador:**

1. Abrir: http://localhost:4200/auth/register
2. Seleccionar: **"Soy Cliente"**
3. Llenar formulario:
   - Nombre: "Test Cliente"
   - Email: "cliente@test.com"
   - Contraseña: "Test123456"
   - Confirmar contraseña: "Test123456"
4. Marcar términos
5. Click en: **"Registrarme Gratis"**

### **Resultado esperado:**
- ✅ Mensaje: "¡Registro exitoso! Redirigiendo..."
- ✅ Redirección a `/onboarding`
- ✅ Usuario creado en BD
- ✅ JWT tokens guardados en localStorage

### **Verificar en BD:**
```sql
SELECT id, name, email, role, is_active, email_verified 
FROM users 
WHERE email = 'cliente@test.com';
```

---

## 🔐 **PASO 3: CONFIGURAR GOOGLE OAUTH (OPCIONAL)**

Si quieres habilitar "Continuar con Google":

### **3.1. Crear proyecto en Google Cloud**

1. Ir a: https://console.cloud.google.com/
2. Crear proyecto "Adomi"
3. Ir a: APIs & Services → Credentials
4. Click: "Create Credentials" → "OAuth 2.0 Client ID"
5. Application type: **Web application**
6. Name: "Adomi Web Client"
7. Authorized JavaScript origins:
   ```
   http://localhost:4200
   https://adomiapp.com
   ```
8. Authorized redirect URIs:
   ```
   http://localhost:4200/auth/google/callback
   https://adomiapp.com/auth/google/callback
   ```
9. Click: **Create**
10. Copiar: **Client ID** y **Client Secret**

### **3.2. Configurar Backend**

Editar `backend/.env`:

```env
# Añadir estas líneas:
GOOGLE_CLIENT_ID=tu-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=tu-client-secret
GOOGLE_REDIRECT_URI=http://localhost:4200/auth/google/callback
```

### **3.3. Configurar Frontend**

Editar `adomi-app/src/environments/environment.ts`:

```typescript
export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:3000',
  googleClientId: 'tu-client-id.apps.googleusercontent.com' // ⭐ Añadir
};
```

### **3.4. Reiniciar servicios**

```bash
# Detener backend (Ctrl+C) y reiniciar
cd backend
npm run dev

# No es necesario reiniciar frontend si usas ng serve
```

### **3.5. Probar Google OAuth**

1. Abrir: http://localhost:4200/auth/register
2. Seleccionar: **"Soy Cliente"**
3. Click en: **"Continuar con Google"**
4. Seleccionar tu cuenta de Google
5. Autorizar permisos

**Resultado esperado:**
- ✅ Redirección a `/onboarding`
- ✅ Usuario creado en BD con `google_id`
- ✅ `email_verified = TRUE` automáticamente

---

## 🎯 **VERIFICACIÓN COMPLETA**

### **Endpoints funcionando:**

```bash
# Health check
curl http://localhost:3000/health
# Respuesta: {"status":"ok"}

# Test registro
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test API",
    "email": "api@test.com",
    "password": "Test123456",
    "role": "client"
  }'
```

### **Base de datos actualizada:**

```sql
-- Verificar estructura
DESCRIBE users;

-- Ver usuarios
SELECT * FROM users ORDER BY created_at DESC LIMIT 5;
```

### **Frontend funcionando:**

Abre: http://localhost:4200/auth/register

Debe mostrar:
- ✅ Paso 1: Selección de rol (Cliente/Profesional)
- ✅ Paso 2: Formulario de registro
- ✅ Botón: "Registrarme Gratis" (para cliente)
- ✅ Botón: "Continuar con Google"
- ✅ Validaciones en tiempo real
- ✅ Mensajes de error/éxito

---

## 🔍 **TROUBLESHOOTING**

### **Error: "Table 'users' doesn't exist"**
```bash
# Ejecutar init.sql primero
mysql -u root -p adomiapp < backend/init.sql
# Luego ejecutar migración
mysql -u root -p adomiapp < backend/migrations/001_update_users_table.sql
```

### **Error: "Cannot find module 'google-auth-library'"**
```bash
cd backend
npm install google-auth-library
npm run dev
```

### **Error: "Email ya está registrado"**
```sql
-- Eliminar usuario de prueba
DELETE FROM users WHERE email = 'cliente@test.com';
```

### **Google OAuth no funciona:**
1. Verificar que `GOOGLE_CLIENT_ID` está en `.env`
2. Verificar que el Client ID está en `environment.ts`
3. Verificar que el redirect URI está autorizado en Google Cloud
4. Abrir consola del navegador (F12) para ver errores

---

## 📊 **FLUJOS SOPORTADOS**

### **1. Cliente - Registro Tradicional**
```
Usuario → Selecciona "Soy Cliente" 
       → Completa formulario
       → Click "Registrarme Gratis"
       → POST /auth/register
       → Usuario creado
       → Redirección a /onboarding
```

### **2. Cliente - Google OAuth**
```
Usuario → Selecciona "Soy Cliente"
       → Click "Continuar con Google"
       → Autoriza en Google
       → POST /auth/google/verify
       → Usuario creado/vinculado
       → Redirección a /onboarding
```

### **3. Proveedor - Registro Tradicional**
```
Usuario → Selecciona "Soy Profesional"
       → Completa formulario
       → Click "Continuar a Planes"
       → Datos en sessionStorage
       → Redirección a /auth/select-plan
       → Selecciona plan
       → Stripe Checkout
       → Webhook confirma pago
       → POST /auth/register
       → Usuario + Suscripción creados
       → Redirección a /onboarding
```

### **4. Proveedor - Google OAuth**
```
Usuario → Selecciona "Soy Profesional"
       → Click "Continuar con Google"
       → Autoriza en Google
       → POST /auth/google/verify
       → Usuario creado/vinculado
       → Redirección a /auth/select-plan
       → [mismo flujo que tradicional]
```

---

## ✅ **CHECKLIST FINAL**

- [ ] Migración SQL ejecutada
- [ ] Backend corriendo (npm run dev)
- [ ] Frontend corriendo (ng serve)
- [ ] Registro tradicional funciona
- [ ] Usuario creado en BD
- [ ] JWT tokens generados
- [ ] Email de bienvenida enviado (opcional)
- [ ] Google OAuth configurado (opcional)
- [ ] Registro con Google funciona (opcional)

---

## 🎉 **¡LISTO!**

Una vez completados estos pasos, tendrás:

✅ **Registro de clientes** (gratis)
✅ **Registro de proveedores** (con planes)
✅ **Registro tradicional** (email/password)
✅ **Google OAuth** (opcional)
✅ **JWT authentication**
✅ **Roles diferenciados** (client/provider)
✅ **Base de datos actualizada**

---

## 📞 **SIGUIENTE PASO**

Una vez que el registro funcione, el siguiente módulo a implementar es:

**→ Perfil del Proveedor** (`/dash/perfil`)

Ver: `backend/GETTING_STARTED_PROVIDER_PROFILE.md`

---

**¿Dudas? Revisa:** `REGISTRO_USUARIOS_ANALISIS.md` (análisis completo)

