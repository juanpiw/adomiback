# 🔥 Guía de Configuración de Firebase Cloud Messaging

## 📋 **Problema Actual**

```
Error: Failed to parse private key: Error: Too few bytes to read ASN.1 value
```

Este error significa que la `FIREBASE_PRIVATE_KEY` en el archivo `.env` está **truncada, malformada o incorrecta**.

---

## 🛠️ **Solución - Configuración Correcta**

### **Paso 1: Obtener las credenciales de Firebase**

1. **Ve a Firebase Console**: https://console.firebase.google.com/
2. **Selecciona tu proyecto**: `adomiapp-notificaciones`
3. **Ve a** ⚙️ **Project Settings** (esquina superior izquierda)
4. **Pestaña "Service Accounts"**
5. **Click en "Generate new private key"**
6. **Descarga el archivo JSON**

El archivo descargado tendrá este formato:

```json
{
 
```

---

### **Paso 2: Extraer y formatear la clave privada**

**La clave privada** (`private_key` del JSON) tiene estos requisitos:

1. ✅ Debe empezar con `"-----BEGIN PRIVATE KEY-----\n`
2. ✅ Debe terminar con `\n-----END PRIVATE KEY-----\n"`
3. ✅ Los saltos de línea deben ser `\n` **literalmente** (no saltos de línea reales)
4. ✅ Debe estar entre comillas dobles en el `.env`
5. ✅ La longitud típica es ~1700 caracteres

**Ejemplo correcto en `.env`:**

```bash
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDShkBRGNm6XwFV\nvRBl/qSUzlGuRrnj4WDkpZ89oM87HvbWe3CcxgGYkN027OxelxhhtDzsfiJLvV58\n4CQqF0bbUlLtF/1tgry/euiY2ye7UCAVTEnsDTiO7QAKVzdpxlo3wn0XzCnsgLJb\n...(TODA LA CLAVE COMPLETA)...\n-----END PRIVATE KEY-----\n"
```

---

### **Paso 3: Verificar la configuración**

**En tu servidor, ejecuta:**

```bash
cd /home/admin/adomiback
node verify-firebase-config.js
```

Este script te dirá exactamente qué está mal.

---

### **Paso 4: Reiniciar y probar**

```bash
pm2 restart all
pm2 logs --lines 50
```

---

## 🔍 **Verificación en logs**

**✅ Logs correctos esperados:**

```
[INFO] [PUSH_SERVICE] In-app notification created for user 38: Nueva cita por confirmar
[INFO] [PUSH_SERVICE] Push notification sent successfully
```

**❌ Logs de error actuales:**

```
[ERROR] [PUSH_SERVICE] Error initializing Firebase Admin | {"message":"Failed to parse private key...
[INFO] [PUSH_SERVICE] Firebase not configured, skipping push notification
```

---

## 📦 **Archivos de configuración necesarios**

Tu `.env` debe tener:

```bash
# Firebase Cloud Messaging (Push Notifications)
FIREBASE_PROJECT_ID=adomiapp-notificaciones
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@adomiapp-notificaciones.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...(CLAVE COMPLETA)...\n-----END PRIVATE KEY-----\n"
```

---

## 🚀 **Pasos para ti AHORA:**

1. **Descarga la clave privada nueva** desde Firebase Console
2. **Copia el `private_key` del JSON** (completo, con `\n` literales)
3. **Edita `.env` en el servidor**: `nano /home/admin/adomiback/.env`
4. **Actualiza `FIREBASE_PRIVATE_KEY`** con la clave completa
5. **Guarda** (Ctrl+O, Enter, Ctrl+X)
6. **Ejecuta**: `node verify-firebase-config.js`
7. **Si pasa**: `pm2 restart all`
8. **Prueba** agendando una cita

---

## 💬 **¿Necesitas ayuda?**

Si tienes problemas copiando la clave, puedes:

1. Copiar el JSON completo en un archivo temporal
2. Usar un editor de texto para reemplazar saltos de línea reales por `\n`
3. O enviarme el JSON y te ayudo a formatearlo

**¡Avísame cómo te va con estos pasos!** 🙏

