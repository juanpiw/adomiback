# 🚀 Adomi - Plataforma de Servicios Profesionales

**Conectando profesionales de servicios con clientes de manera inteligente y eficiente.**

## 📋 **Descripción del Proyecto**

Adomi es una plataforma completa que facilita la conexión entre profesionales de servicios (peluqueros, masajistas, técnicos, etc.) y clientes que buscan estos servicios. La plataforma incluye sistemas de reservas, pagos, gestión de citas y herramientas de marketing.

## 🎯 **Características Principales**

### **Para Clientes**
- ✅ **Registro gratuito** - Acceso completo sin costo
- ✅ **Búsqueda de profesionales** - Filtros avanzados por ubicación, servicio, precio
- ✅ **Sistema de reservas** - Agendar citas fácilmente
- ✅ **Gestión de favoritos** - Guardar profesionales preferidos
- ✅ **Sistema de pagos** - Pagos seguros con Stripe
- ✅ **Reseñas y calificaciones** - Evaluar servicios recibidos

### **Para Profesionales**
- ✅ **Dashboard completo** - Gestión integral del negocio
- ✅ **Sistema de suscripciones** - Planes flexibles (Básico, Premium, Founder)
- ✅ **Gestión de agenda** - Calendario inteligente para citas
- ✅ **Seguimiento de ingresos** - Métricas financieras detalladas
- ✅ **Herramientas de marketing** - Promoción y visibilidad
- ✅ **Sistema de mensajería** - Comunicación directa con clientes

### **Para la Plataforma**
- ✅ **Sistema de fundadores** - Beneficios especiales para early adopters
- ✅ **Gestión automática de expiraciones** - Degradación automática de planes
- ✅ **Sistema de contabilidad** - Seguimiento de ingresos y comisiones
- ✅ **Alertas inteligentes** - Notificaciones proactivas para usuarios

## 🛠️ **Stack Tecnológico**

### **Frontend**
- **Angular 20** - Framework principal
- **TypeScript** - Lenguaje de programación
- **Angular Universal** - Server-Side Rendering
- **SCSS** - Estilos con variables CSS
- **RxJS** - Programación reactiva

### **Backend**
- **Node.js** + **Express** - Servidor API
- **TypeScript** - Tipado estático
- **MySQL** (AWS RDS) - Base de datos
- **Stripe** - Procesamiento de pagos
- **Nodemailer** - Envío de emails

### **Infraestructura**
- **AWS RDS** - Base de datos MySQL
- **GitHub** - Control de versiones
- **Docker** - Containerización (próximamente)

## 🚀 **Instalación y Configuración**

### **Prerrequisitos**
- Node.js 18+ 
- npm 9+
- MySQL 8.0+
- Cuenta de Stripe (opcional para desarrollo)

### **1. Clonar el Repositorio**
```bash
git clone https://github.com/tu-usuario/adomi.git
cd adomi
```

### **2. Configurar Backend**
```bash
cd backend
npm install
cp .env.example .env
# Editar .env con tus credenciales
npm run dev
```

### **3. Configurar Frontend**
```bash
cd adomi-app
npm install
ng serve
```

### **4. Configurar Base de Datos**
```bash
# Ejecutar scripts SQL desde DATABASE_SCRIPTS.md
mysql -u usuario -p adomi < database_scripts.sql
```

## 📁 **Estructura del Proyecto**

```
adomi/
├── backend/                 # API REST (Node.js + Express)
│   ├── src/
│   │   ├── endpoints/      # Endpoints de la API
│   │   ├── queries/        # Consultas a la base de datos
│   │   ├── lib/           # Utilidades y servicios
│   │   └── index.ts       # Punto de entrada
│   ├── .env               # Variables de entorno
│   └── README.md          # Documentación del backend
├── adomi-app/             # Aplicación Angular
│   ├── src/
│   │   ├── app/           # Aplicación principal
│   │   ├── libs/          # Librerías compartidas
│   │   └── environments/  # Variables de entorno
│   ├── angular.json       # Configuración de Angular
│   └── README.md          # Documentación del frontend
├── docs/                  # Documentación adicional
│   ├── DATABASE_SCRIPTS.md
│   ├── STRIPE_INTEGRATION_PLAN.md
│   ├── PLAN_EXPIRATION_SYSTEM.md
│   └── IMPLEMENTATION_CHECKLIST.md
└── README.md              # Este archivo
```

## 🔧 **Configuración de Desarrollo**

### **Variables de Entorno Backend**
```env
# Base de Datos
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=tu_password
DB_NAME=adomi

# Stripe
STRIPE_SECRET_KEY=sk_test_tu_clave
STRIPE_WEBHOOK_SECRET=whsec_tu_webhook
STRIPE_CURRENCY=clp

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu-email@gmail.com
SMTP_PASS=tu-app-password

# URLs
FRONTEND_URL=http://localhost:4200
WEBHOOK_URL=http://localhost:3000/webhooks/stripe
```

### **Variables de Entorno Frontend**
```typescript
// src/environments/environment.ts
export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:3000'
};
```

## 🧪 **Testing y Desarrollo**

### **Ejecutar en Modo Desarrollo**
```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd adomi-app
ng serve

# Terminal 3 - Frontend con SSR
cd adomi-app
ng serve --ssr
```

### **URLs de Desarrollo**
- **Frontend SPA**: http://localhost:4200
- **Frontend SSR**: http://localhost:4200 (con SSR)
- **Backend API**: http://localhost:3000
- **Swagger Docs**: http://localhost:3000/docs

### **Datos de Prueba**
El sistema incluye datos de ejemplo para testing:
- Usuarios de prueba (cliente y proveedor)
- Planes de suscripción predefinidos
- Configuraciones de plataforma

## 📚 **Documentación**

### **Documentación Técnica**
- [Backend API](backend/README.md) - Documentación completa del API
- [Frontend Angular](adomi-app/README.md) - Guía de la aplicación Angular
- [Scripts de Base de Datos](DATABASE_SCRIPTS.md) - Scripts SQL necesarios
- [Sistema de Expiraciones](PLAN_EXPIRATION_SYSTEM.md) - Gestión automática de planes

### **Documentación de Negocio**
- [Plan de Integración Stripe](STRIPE_INTEGRATION_PLAN.md) - Estrategia de pagos
- [Sistema de Fundadores](FOUNDER_SYSTEM_ANALYSIS.md) - Beneficios especiales
- [Checklist de Implementación](IMPLEMENTATION_CHECKLIST.md) - Tareas pendientes

### **API Documentation**
- **Swagger UI**: http://localhost:3000/docs
- **Endpoints disponibles**: 25+ endpoints documentados
- **Ejemplos de uso**: Incluidos en Swagger

## 🖼️ **Validación de Identidad e Imágenes**

### **Resumen**
- Sistema de verificación de identidad que requiere subir imágenes del anverso y reverso de la cédula.
- Compresión automática en el servidor con Sharp y validaciones en frontend y backend.

### **Frontend**
- Componente: `adomi-app/src/app/client/validacion-datos-trabajador/validacion-datos-trabajador.ts`
- Validaciones en cliente: tipo `image/*`, tamaño ≤ 5MB por archivo, ambas imágenes requeridas, preview antes de enviar.
- Servicio: `VerificationService.uploadDocuments(front, back, 'id_card')` envía `multipart/form-data` al backend.

### **Backend**
- Endpoint principal de subida: `POST /verifications/upload` (requiere Bearer token)
- Respuestas incluyen métricas de compresión: tamaño original, tamaño comprimido, ratio y dimensiones por imagen.
- Otros endpoints: `GET /verifications/my`, `GET /verifications/:id`, `GET /verifications/admin/pending`, `GET /verifications/admin/stats`, `PUT /verifications/:id` (admin)

### **Compresión de Imágenes (Sharp)**
- Dimensiones máximas: 1920x1080 (manteniendo aspect ratio, sin agrandar)
- Formato de salida: JPEG progresivo, calidad 85% (mozjpeg habilitado)
- Optimizaciones: `sharpen()` y `normalize()` tras redimensionado
- Archivos originales se eliminan tras generar los comprimidos
- Implementación: `backend/src/lib/image-compression.ts`

### **Validaciones y límites**
- Límite por archivo: 5MB
- Solo se aceptan `image/*`
- Evita duplicados: bloquea nuevas subidas si ya existe verificación `pending` del mismo `document_type`

### **Almacenamiento de archivos**
- Carpeta: `uploads/verifications/`
- Nombre base al subir: `verification-{timestamp}-{random}.{ext}`
- Nombre comprimido: mismo nombre con sufijo `_compressed.jpg` (p.ej. `verification-1696248000000-123456789_compressed.jpg`)
- URL almacenada en BD: `/uploads/verifications/{archivo}`

### **Base de datos**
- Tabla: `user_verifications`
- Campos clave: `user_id`, `document_type` (`id_card` | `background_check`), `file_url`, `status` (`pending` | `approved` | `rejected`), `reviewed_by`, `notes`

### **Flujo resumido**
1. Usuario selecciona anverso y reverso → validación cliente → preview
2. Envío a `POST /verifications/upload` → Multer guarda → Sharp comprime → borra originales
3. Se crean registros `user_verifications` y se devuelve estado `pending` con métricas de compresión
4. Usuario ve estado en UI; administración revisa y actualiza estado

Para más detalles técnicos, ver `IMAGE_UPLOAD_SYSTEM.md`.

## 🚀 **Despliegue en Producción**

### **Backend**
```bash
cd backend
npm run build
npm start
```

### **Frontend**
```bash
cd adomi-app
ng build --configuration production
# Servir archivos estáticos con Nginx/Apache
```

### **Base de Datos**
- **AWS RDS MySQL** - Base de datos principal
- **Backups automáticos** - Configurados en AWS
- **Monitoreo** - CloudWatch para métricas

## 📊 **Métricas y Monitoreo**

### **Métricas de Negocio**
- Usuarios activos (clientes y proveedores)
- Ingresos generados por suscripciones
- Número de reservas procesadas
- Planes por vencer y expirados

### **Métricas Técnicas**
- Tiempo de respuesta de API
- Uptime del sistema
- Errores y excepciones
- Performance de base de datos

## 🔒 **Seguridad**

### **Medidas Implementadas**
- **Validación de entrada** en todos los endpoints
- **Sanitización de datos** antes de guardar en BD
- **Rate limiting** para prevenir abuso
- **CORS configurado** correctamente
- **Variables de entorno** para datos sensibles

### **Próximas Implementaciones**
- **JWT tokens** para autenticación
- **Encriptación** de datos sensibles
- **2FA** para usuarios premium
- **Audit logs** para acciones críticas

## 🤝 **Contribución**

### **Cómo Contribuir**
1. Fork del repositorio
2. Crear rama para feature: `git checkout -b feature/nueva-funcionalidad`
3. Commit cambios: `git commit -m 'Agregar nueva funcionalidad'`
4. Push a la rama: `git push origin feature/nueva-funcionalidad`
5. Crear Pull Request

### **Estándares de Código**
- **TypeScript** estricto
- **ESLint** para linting
- **Prettier** para formateo
- **Conventional Commits** para mensajes

## 📞 **Soporte y Contacto**

### **Soporte Técnico**
- **Email**: soporte@adomiapp.cl
- **Documentación**: Este README y docs/
- **Issues**: GitHub Issues

### **Equipo de Desarrollo**
- **Backend**: Node.js + Express + TypeScript
- **Frontend**: Angular 20 + TypeScript
- **DevOps**: AWS + Docker (próximamente)

## 📈 **Roadmap**

### **Próximas Funcionalidades**
- [ ] **App móvil** (React Native)
- [ ] **Sistema de notificaciones push**
- [ ] **Integración con Google Calendar**
- [ ] **Sistema de cupones y descuentos**
- [ ] **Analytics avanzados**
- [ ] **API pública** para terceros

### **Mejoras Técnicas**
- [ ] **Microservicios** con Docker
- [ ] **Redis** para caché
- [ ] **Elasticsearch** para búsquedas
- [ ] **CI/CD** con GitHub Actions
- [ ] **Monitoreo** con Prometheus

## 📄 **Licencia**

Este proyecto está bajo la Licencia MIT. Ver `LICENSE` para más detalles.

---

**¡Adomi - Conectando profesionales con clientes de manera inteligente! 🚀**

*Desarrollado con ❤️ para revolucionar la industria de servicios profesionales.*

