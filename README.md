# 🚀 Adomi Backend API

API REST para la plataforma Adomi - Conectando profesionales de servicios con clientes.

## 📋 **Características Principales**

- ✅ **Autenticación completa** (registro, login, recuperación de contraseña)
- ✅ **Sistema de roles** (clientes y proveedores)
- ✅ **Integración con Stripe** para pagos y suscripciones
- ✅ **Sistema de fundadores** con beneficios especiales
- ✅ **Gestión de expiraciones** de planes automática
- ✅ **Sistema de contabilidad** interno
- ✅ **Envío de emails** con templates elegantes
- ✅ **Documentación Swagger** completa

## 🛠️ **Tecnologías**

- **Node.js** + **Express**
- **TypeScript** para tipado estático
- **MySQL** (AWS RDS) como base de datos
- **Stripe** para procesamiento de pagos
- **Nodemailer** para envío de emails
- **Swagger UI** para documentación
- **JWT** para autenticación (próximamente)

## 🚀 **Instalación y Configuración**

### **1. Instalar Dependencias**
```bash
npm install
```

### **2. Configurar Variables de Entorno**
Crear archivo `.env` en la raíz del proyecto:

```env
# Base de Datos
DB_HOST=tu-host-mysql
DB_PORT=3306
DB_USER=tu-usuario
DB_PASSWORD=tu-password
DB_NAME=adomi

# Stripe (Opcional - modo de prueba disponible)
STRIPE_SECRET_KEY=sk_test_tu_clave_secreta
STRIPE_WEBHOOK_SECRET=whsec_tu_webhook_secret
STRIPE_CURRENCY=clp

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu-email@gmail.com
SMTP_PASS=tu-app-password

# URLs
FRONTEND_URL=http://localhost:4200
WEBHOOK_URL=http://localhost:3000/webhooks/stripe

# Puerto
PORT=3000
```

### **3. Ejecutar en Desarrollo**
```bash
npm run dev
```

### **4. Compilar para Producción**
```bash
npm run build
npm start
```

## 📚 **Documentación de la API**

### **Swagger UI**
Una vez iniciado el servidor, accede a:
```
http://localhost:3000/docs
```

### **Endpoints Principales**

#### **🔐 Autenticación**
- `POST /auth/register` - Registro de usuarios
- `POST /auth/login` - Inicio de sesión
- `POST /auth/forgot-password` - Recuperar contraseña
- `POST /auth/reset-password` - Restablecer contraseña

#### **📋 Planes y Suscripciones**
- `GET /plans` - Obtener todos los planes
- `POST /subscriptions/create-checkout` - Crear checkout de Stripe
- `GET /subscriptions/:id` - Obtener suscripción por ID

#### **⏰ Gestión de Expiraciones**
- `GET /plan-expirations/user/:userId/current` - Plan actual del usuario
- `GET /plan-expirations/expiring-soon` - Planes por vencer
- `GET /plan-expirations/expired` - Planes expirados
- `GET /plan-expirations/stats` - Estadísticas de expiraciones

#### **👑 Sistema de Fundadores**
- `GET /founders` - Listar todos los fundadores
- `POST /founders/:id/assign` - Asignar estatus de fundador
- `DELETE /founders/:id/revoke` - Revocar estatus de fundador
- `GET /founders/check/:id` - Verificar si es fundador

#### **💰 Contabilidad**
- `GET /accounting/summary` - Resumen de ingresos
- `GET /accounting/settings` - Configuraciones de plataforma

## 🗄️ **Base de Datos**

### **Tablas Principales**
- `users` - Usuarios del sistema
- `plans` - Planes de suscripción
- `subscriptions` - Suscripciones activas
- `plan_expirations` - Fechas de caducidad de planes
- `founder_benefits` - Beneficios de fundadores
- `revenue_tracking` - Seguimiento de ingresos
- `platform_settings` - Configuraciones del sistema

### **Scripts de Base de Datos**
Ver `DATABASE_SCRIPTS.md` para todos los scripts SQL necesarios.

## 🔄 **Sistema de Expiraciones Automáticas**

### **Funcionamiento**
- **Procesamiento cada hora** para verificar planes expirados
- **Degradación automática** a plan básico cuando expira
- **Período de gracia** configurable (por defecto 7 días)
- **Alertas en frontend** para usuarios con planes por vencer

### **Configuración**
```typescript
// En src/index.ts
import { PlanExpirationService } from './lib/plan-expiration-service';

// Iniciar procesamiento automático
PlanExpirationService.startAutomaticProcessing();
```

## 💳 **Integración con Stripe**

### **Modo de Prueba**
Si no tienes credenciales de Stripe configuradas, el sistema funciona en modo de prueba:
- Simula checkout exitoso
- No requiere pago real
- Ideal para desarrollo y testing

### **Modo Producción**
Con credenciales reales de Stripe:
- Checkout real con Stripe
- Webhooks para confirmar pagos
- Gestión completa de suscripciones

## 📧 **Sistema de Emails**

### **Templates Disponibles**
- **Bienvenida** - Email de confirmación de registro
- **Recuperación de contraseña** - Link para restablecer contraseña
- **Notificaciones de plan** - Alertas de expiración

### **Configuración SMTP**
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu-email@gmail.com
SMTP_PASS=tu-app-password
```

## 🧪 **Testing**

### **Endpoints de Prueba**
```bash
# Verificar conexión a base de datos
GET /db/test

# Probar envío de emails
POST /auth/test-email

# Obtener estadísticas
GET /plan-expirations/stats
```

### **Datos de Prueba**
El sistema incluye datos de ejemplo para testing:
- Planes predefinidos
- Configuraciones de plataforma
- Beneficios de fundadores

## 📊 **Monitoreo y Logs**

### **Logs Disponibles**
- `[DB]` - Operaciones de base de datos
- `[AUTH]` - Autenticación y autorización
- `[STRIPE]` - Transacciones de Stripe
- `[PLAN_EXPIRATION_SERVICE]` - Procesamiento de expiraciones
- `[EMAIL]` - Envío de emails

### **Métricas**
- Usuarios activos
- Planes por vencer
- Ingresos generados
- Transacciones procesadas

## 🚀 **Despliegue en Producción**

### **Variables de Entorno Requeridas**
```env
# Producción
NODE_ENV=production
DB_HOST=tu-rds-endpoint
STRIPE_SECRET_KEY=sk_live_tu_clave_real
SMTP_USER=no-reply@adomiapp.cl
FRONTEND_URL=https://tu-dominio.com
```

### **Comandos de Despliegue**
```bash
# Compilar
npm run build

# Iniciar
npm start

# Con PM2
pm2 start dist/index.js --name "adomi-api"
```

## 🔧 **Desarrollo**

### **Estructura del Proyecto**
```
backend/
├── src/
│   ├── endpoints/     # Endpoints de la API
│   ├── queries/       # Consultas a la base de datos
│   ├── lib/          # Utilidades y servicios
│   └── index.ts      # Punto de entrada
├── .env              # Variables de entorno
├── package.json      # Dependencias y scripts
└── README.md         # Este archivo
```

### **Agregar Nuevos Endpoints**
1. Crear archivo en `src/endpoints/`
2. Implementar queries en `src/queries/`
3. Registrar en `src/lib/router.ts`
4. Documentar en `src/lib/swagger.ts`

## 📞 **Soporte**

Para soporte técnico o consultas:
- **Email**: soporte@adomiapp.cl
- **Documentación**: `/docs` en el servidor
- **Logs**: Revisar consola del servidor

---

**¡Adomi Backend - Conectando profesionales con clientes! 🚀**