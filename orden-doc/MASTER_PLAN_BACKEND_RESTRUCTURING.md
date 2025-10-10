# 🎯 PLAN MAESTRO: REESTRUCTURACIÓN BACKEND ADOMI

> **Documento de Arquitectura y Plan de Implementación**  
> **Fecha de Creación:** 9 de Octubre, 2025  
> **Versión:** 1.0  
> **Estado:** En Planificación

---

## 📋 TABLA DE CONTENIDOS

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Análisis de Situación Actual](#análisis-de-situación-actual)
3. [Arquitectura Propuesta](#arquitectura-propuesta)
4. [Plan de Implementación Paso a Paso](#plan-de-implementación-paso-a-paso)
5. [Estructura de Carpetas Propuesta](#estructura-de-carpetas-propuesta)
6. [Convenciones y Estándares](#convenciones-y-estándares)
7. [Cronograma Estimado](#cronograma-estimado)
8. [Checklist de Tareas](#checklist-de-tareas)

---

## 🎯 RESUMEN EJECUTIVO

### **Situación Actual**
El backend de ADOMI tiene implementado:
- ✅ Sistema de autenticación JWT (completo)
- ✅ Base de datos MySQL con schema completo definido
- ⚠️ Endpoints básicos (auth, promo, bookings limitado)
- ❌ 75% de funcionalidades sin implementar

### **Problema Identificado**
**INCOMPATIBILIDAD CRÍTICA:** El código actual no coincide con el schema de base de datos `DATABASE_SCHEMA_COMPLETE.sql`. Faltan:
- 22 tablas sin implementar
- Campos críticos en tablas existentes
- Sistema de comisiones (85% proveedor / 15% plataforma)
- Sistema de wallet y transacciones
- Sistema de pagos completo

### **Oportunidad**
Estamos en el momento **ideal** para reestructurar porque:
- ✅ Schema de BD completo y bien diseñado
- ✅ Sin usuarios en producción
- ✅ Arquitectura base funcional (JWT, Stripe, Email)
- ✅ Podemos aplicar mejores prácticas desde el inicio

### **Objetivo**
Crear un backend **mantenible, escalable y modular** que implemente el 100% del schema de BD con arquitectura limpia.

### **Resultado Esperado**
- 📦 **Módulos independientes** por dominio (auth, provider, client, payments, etc.)
- 📄 **Archivos pequeños** (<300 líneas cada uno)
- 🔄 **Reutilización de código** máxima
- 🧪 **Testeable** y fácil de debuggear
- 📚 **Documentado** y con ejemplos

### **Tiempo Estimado**
- **Total:** 60-80 horas
- **Por fase:** 10-15 horas cada una
- **Duración:** 2-3 semanas con dedicación full-time

---

## 📊 ANÁLISIS DE SITUACIÓN ACTUAL

### **1. COMPATIBILIDAD: ENDPOINTS vs DATABASE**

#### **✅ COMPONENTES FUNCIONALES (25%)**

| Componente | Estado | Archivos | Funcionalidad |
|------------|--------|----------|---------------|
| **Autenticación** | ✅ Completo | `auth.ts`, `google-auth.ts` | Login, Register, OAuth, Recovery |
| **JWT & Tokens** | ✅ Completo | `jwt.ts`, `refresh-tokens.ts` | Access/Refresh tokens |
| **Seguridad** | ✅ Completo | `middleware/auth.ts`, `rate-limits.ts` | Rate limiting, validación |
| **Email** | ✅ Completo | `email.ts`, `email-templates.ts` | SMTP, plantillas |
| **Stripe Base** | ✅ Completo | `stripe.ts` | Conexión, customers |
| **Promociones** | ✅ Funcional | `promo.ts` | Signups promocionales |

#### **⚠️ COMPONENTES PARCIALES (15%)**

| Componente | Estado | Problema | Solución |
|------------|--------|----------|----------|
| **users** | ⚠️ Incompleto | Faltan 5 campos críticos | Agregar: `stripe_customer_id`, `is_active`, `email_verified`, `phone`, rol `admin` |
| **plans** | ⚠️ No existe tabla | Queries asumen tabla existente | Crear tabla en `initDatabase()` |
| **subscriptions** | ⚠️ No existe tabla | Queries asumen tabla existente | Crear tabla en `initDatabase()` |
| **bookings** | ⚠️ Limitado | Faltan 15 campos críticos | Rediseñar como `appointments` completo |

#### **❌ COMPONENTES AUSENTES (60%)**

**Tablas sin implementar:**
1. `provider_profiles` - Perfil completo del proveedor
2. `provider_services` - Servicios (diseño diferente al actual)
3. `provider_portfolio` - Galería de trabajos
4. `provider_locations` - Zonas de cobertura
5. `provider_availability` - Horarios disponibles
6. `availability_exceptions` - Días bloqueados
7. `identity_verifications` - KYC
8. `payments` - **CRÍTICO** Sistema de pagos
9. `payment_methods` - Tarjetas guardadas
10. `wallet_balance` - **CRÍTICO** Billetera
11. `transactions` - **CRÍTICO** Movimientos
12. `withdrawals` - Retiros
13. `reviews` - Reseñas
14. `review_responses` - Respuestas
15. `favorites` - Favoritos
16. `conversations` - Chat
17. `messages` - Mensajería
18. `notifications` - Notificaciones
19. `promotions` - Descuentos
20. `client_profiles` - Perfil del cliente
21. `notification_preferences` - Preferencias
22. `platform_settings` - Configuración

**Endpoints sin implementar:**
- `/provider/profile/*` (10 endpoints)
- `/provider/services/*` (6 endpoints)
- `/provider/portfolio/*` (5 endpoints)
- `/provider/availability/*` (6 endpoints)
- `/payments/*` (8 endpoints)
- `/wallet/*` (6 endpoints)
- `/withdrawals/*` (4 endpoints)
- `/reviews/*` (6 endpoints)
- `/favorites/*` (4 endpoints)
- `/conversations/*` (5 endpoints)
- `/messages/*` (4 endpoints)
- `/notifications/*` (5 endpoints)
- `/client/profile/*` (5 endpoints)

**Total:** ~80 endpoints nuevos necesarios

---

### **2. PROBLEMAS DE ARQUITECTURA ACTUAL**

#### **🔴 Problema 1: Archivos Monolíticos**
```
❌ endpoints/auth.ts         (537 líneas)
❌ endpoints/bookings.ts      (404 líneas)
❌ endpoints/subscriptions.ts (330 líneas)
```
**Consecuencia:** Difícil de mantener, debuggear y testear.

#### **🔴 Problema 2: Falta de Modularización**
```
src/
  endpoints/    ← TODO mezclado aquí (14 archivos)
  queries/      ← Queries mezcladas (11 archivos)
  lib/          ← Utilidades mezcladas (10 archivos)
```
**Consecuencia:** No hay separación por dominio de negocio.

#### **🔴 Problema 3: Queries Duplicadas**
- Queries de JOIN repetidas en múltiples archivos
- Lógica de negocio mezclada con queries
- Sin capa de abstracción

#### **🔴 Problema 4: Validación Inconsistente**
- Algunos endpoints usan Joi, otros validación manual
- Validators incompletos
- Sin validación de permisos clara

#### **🔴 Problema 5: Sin Testing**
- No hay tests unitarios
- No hay tests de integración
- Difícil testear código actual

---

## 🏗️ ARQUITECTURA PROPUESTA

### **PRINCIPIOS DE DISEÑO**

1. **Modularidad por Dominio** - Cada módulo es independiente
2. **Responsabilidad Única** - Cada archivo hace una cosa
3. **DRY (Don't Repeat Yourself)** - Máxima reutilización
4. **Separation of Concerns** - Capas bien definidas
5. **Scalability** - Fácil agregar nuevas funcionalidades
6. **Testability** - Código fácil de testear

### **ARQUITECTURA EN CAPAS**

```
┌─────────────────────────────────────────────────────────┐
│                    CAPA DE PRESENTACIÓN                  │
│  (Rutas, Validación de Request, Transformación Response) │
│                   routes/*.routes.ts                      │
└───────────────────┬─────────────────────────────────────┘
                    │
┌───────────────────▼─────────────────────────────────────┐
│                   CAPA DE CONTROLADORES                   │
│    (Lógica de Negocio, Orquestación, Autorización)      │
│                 controllers/*.controller.ts               │
└───────────────────┬─────────────────────────────────────┘
                    │
┌───────────────────▼─────────────────────────────────────┐
│                    CAPA DE SERVICIOS                      │
│  (Lógica de Negocio Compleja, Transacciones, Cálculos)  │
│                  services/*.service.ts                    │
└───────────────────┬─────────────────────────────────────┘
                    │
┌───────────────────▼─────────────────────────────────────┐
│                   CAPA DE REPOSITORIOS                    │
│         (Acceso a Datos, Queries SQL, ORMs)              │
│                repositories/*.repository.ts               │
└───────────────────┬─────────────────────────────────────┘
                    │
┌───────────────────▼─────────────────────────────────────┐
│                      BASE DE DATOS                        │
│                      MySQL / Azure                        │
└─────────────────────────────────────────────────────────┘
```

### **MÓDULOS POR DOMINIO**

```
src/
├── modules/
│   ├── auth/                    # Autenticación y autorización
│   │   ├── routes/
│   │   │   ├── auth.routes.ts
│   │   │   └── google.routes.ts
│   │   ├── controllers/
│   │   │   ├── auth.controller.ts
│   │   │   └── google-auth.controller.ts
│   │   ├── services/
│   │   │   ├── auth.service.ts
│   │   │   ├── jwt.service.ts
│   │   │   └── password.service.ts
│   │   ├── repositories/
│   │   │   ├── users.repository.ts
│   │   │   ├── refresh-tokens.repository.ts
│   │   │   └── password-reset.repository.ts
│   │   ├── validators/
│   │   │   └── auth.validator.ts
│   │   ├── types/
│   │   │   └── auth.types.ts
│   │   └── index.ts
│   │
│   ├── provider/                # Todo lo relacionado a proveedores
│   │   ├── routes/
│   │   │   ├── profile.routes.ts
│   │   │   ├── services.routes.ts
│   │   │   ├── portfolio.routes.ts
│   │   │   ├── availability.routes.ts
│   │   │   └── locations.routes.ts
│   │   ├── controllers/
│   │   │   ├── profile.controller.ts
│   │   │   ├── services.controller.ts
│   │   │   ├── portfolio.controller.ts
│   │   │   ├── availability.controller.ts
│   │   │   └── locations.controller.ts
│   │   ├── services/
│   │   │   ├── profile.service.ts
│   │   │   ├── services-management.service.ts
│   │   │   ├── portfolio.service.ts
│   │   │   ├── availability.service.ts
│   │   │   └── search.service.ts
│   │   ├── repositories/
│   │   │   ├── provider-profiles.repository.ts
│   │   │   ├── provider-services.repository.ts
│   │   │   ├── provider-portfolio.repository.ts
│   │   │   ├── provider-availability.repository.ts
│   │   │   └── provider-locations.repository.ts
│   │   ├── validators/
│   │   │   └── provider.validator.ts
│   │   ├── types/
│   │   │   └── provider.types.ts
│   │   └── index.ts
│   │
│   ├── client/                  # Todo lo relacionado a clientes
│   │   ├── routes/
│   │   │   ├── profile.routes.ts
│   │   │   ├── favorites.routes.ts
│   │   │   └── search.routes.ts
│   │   ├── controllers/
│   │   │   ├── profile.controller.ts
│   │   │   ├── favorites.controller.ts
│   │   │   └── search.controller.ts
│   │   ├── services/
│   │   │   ├── profile.service.ts
│   │   │   ├── favorites.service.ts
│   │   │   └── search.service.ts
│   │   ├── repositories/
│   │   │   ├── client-profiles.repository.ts
│   │   │   └── favorites.repository.ts
│   │   ├── validators/
│   │   │   └── client.validator.ts
│   │   ├── types/
│   │   │   └── client.types.ts
│   │   └── index.ts
│   │
│   ├── appointments/            # Sistema de citas/reservas
│   │   ├── routes/
│   │   │   └── appointments.routes.ts
│   │   ├── controllers/
│   │   │   └── appointments.controller.ts
│   │   ├── services/
│   │   │   ├── appointments.service.ts
│   │   │   ├── availability.service.ts
│   │   │   └── calendar.service.ts
│   │   ├── repositories/
│   │   │   ├── appointments.repository.ts
│   │   │   └── appointment-history.repository.ts
│   │   ├── validators/
│   │   │   └── appointments.validator.ts
│   │   ├── types/
│   │   │   └── appointments.types.ts
│   │   └── index.ts
│   │
│   ├── payments/                # Sistema de pagos (CRÍTICO)
│   │   ├── routes/
│   │   │   ├── payments.routes.ts
│   │   │   ├── payment-methods.routes.ts
│   │   │   └── webhooks.routes.ts
│   │   ├── controllers/
│   │   │   ├── payments.controller.ts
│   │   │   ├── payment-methods.controller.ts
│   │   │   └── webhooks.controller.ts
│   │   ├── services/
│   │   │   ├── payments.service.ts
│   │   │   ├── commission.service.ts        # 85/15 split
│   │   │   ├── stripe-integration.service.ts
│   │   │   └── refunds.service.ts
│   │   ├── repositories/
│   │   │   ├── payments.repository.ts
│   │   │   └── payment-methods.repository.ts
│   │   ├── validators/
│   │   │   └── payments.validator.ts
│   │   ├── types/
│   │   │   └── payments.types.ts
│   │   └── index.ts
│   │
│   ├── wallet/                  # Sistema de billetera (CRÍTICO)
│   │   ├── routes/
│   │   │   ├── wallet.routes.ts
│   │   │   ├── transactions.routes.ts
│   │   │   └── withdrawals.routes.ts
│   │   ├── controllers/
│   │   │   ├── wallet.controller.ts
│   │   │   ├── transactions.controller.ts
│   │   │   └── withdrawals.controller.ts
│   │   ├── services/
│   │   │   ├── wallet.service.ts
│   │   │   ├── transactions.service.ts
│   │   │   └── withdrawals.service.ts
│   │   ├── repositories/
│   │   │   ├── wallet-balance.repository.ts
│   │   │   ├── transactions.repository.ts
│   │   │   └── withdrawals.repository.ts
│   │   ├── validators/
│   │   │   └── wallet.validator.ts
│   │   ├── types/
│   │   │   └── wallet.types.ts
│   │   └── index.ts
│   │
│   ├── reviews/                 # Sistema de reseñas
│   │   ├── routes/
│   │   │   └── reviews.routes.ts
│   │   ├── controllers/
│   │   │   └── reviews.controller.ts
│   │   ├── services/
│   │   │   ├── reviews.service.ts
│   │   │   └── rating.service.ts
│   │   ├── repositories/
│   │   │   ├── reviews.repository.ts
│   │   │   └── review-responses.repository.ts
│   │   ├── validators/
│   │   │   └── reviews.validator.ts
│   │   ├── types/
│   │   │   └── reviews.types.ts
│   │   └── index.ts
│   │
│   ├── chat/                    # Sistema de mensajería
│   │   ├── routes/
│   │   │   ├── conversations.routes.ts
│   │   │   └── messages.routes.ts
│   │   ├── controllers/
│   │   │   ├── conversations.controller.ts
│   │   │   └── messages.controller.ts
│   │   ├── services/
│   │   │   ├── conversations.service.ts
│   │   │   └── messages.service.ts
│   │   ├── repositories/
│   │   │   ├── conversations.repository.ts
│   │   │   └── messages.repository.ts
│   │   ├── validators/
│   │   │   └── chat.validator.ts
│   │   ├── types/
│   │   │   └── chat.types.ts
│   │   └── index.ts
│   │
│   ├── notifications/           # Sistema de notificaciones
│   │   ├── routes/
│   │   │   └── notifications.routes.ts
│   │   ├── controllers/
│   │   │   └── notifications.controller.ts
│   │   ├── services/
│   │   │   ├── notifications.service.ts
│   │   │   └── push.service.ts
│   │   ├── repositories/
│   │   │   ├── notifications.repository.ts
│   │   │   └── notification-preferences.repository.ts
│   │   ├── validators/
│   │   │   └── notifications.validator.ts
│   │   ├── types/
│   │   │   └── notifications.types.ts
│   │   └── index.ts
│   │
│   ├── subscriptions/           # Planes y suscripciones
│   │   ├── routes/
│   │   │   ├── plans.routes.ts
│   │   │   └── subscriptions.routes.ts
│   │   ├── controllers/
│   │   │   ├── plans.controller.ts
│   │   │   └── subscriptions.controller.ts
│   │   ├── services/
│   │   │   ├── plans.service.ts
│   │   │   ├── subscriptions.service.ts
│   │   │   └── stripe-subscription.service.ts
│   │   ├── repositories/
│   │   │   ├── plans.repository.ts
│   │   │   └── subscriptions.repository.ts
│   │   ├── validators/
│   │   │   └── subscriptions.validator.ts
│   │   ├── types/
│   │   │   └── subscriptions.types.ts
│   │   └── index.ts
│   │
│   └── admin/                   # Panel de administración
│       ├── routes/
│       │   ├── verifications.routes.ts
│       │   ├── platform-settings.routes.ts
│       │   └── statistics.routes.ts
│       ├── controllers/
│       │   ├── verifications.controller.ts
│       │   ├── platform-settings.controller.ts
│       │   └── statistics.controller.ts
│       ├── services/
│       │   ├── verifications.service.ts
│       │   ├── platform-settings.service.ts
│       │   └── statistics.service.ts
│       ├── repositories/
│       │   ├── identity-verifications.repository.ts
│       │   └── platform-settings.repository.ts
│       ├── validators/
│       │   └── admin.validator.ts
│       ├── types/
│       │   └── admin.types.ts
│       └── index.ts
│
├── shared/                      # Código compartido entre módulos
│   ├── database/
│   │   ├── connection.ts        # Pool de conexiones
│   │   ├── migrations.ts        # Sistema de migraciones
│   │   └── seeds.ts             # Datos iniciales
│   ├── middleware/
│   │   ├── auth.middleware.ts
│   │   ├── validation.middleware.ts
│   │   ├── error-handler.middleware.ts
│   │   ├── rate-limit.middleware.ts
│   │   └── logger.middleware.ts
│   ├── utils/
│   │   ├── logger.util.ts
│   │   ├── date.util.ts
│   │   ├── encryption.util.ts
│   │   ├── response.util.ts
│   │   └── pagination.util.ts
│   ├── types/
│   │   ├── common.types.ts
│   │   └── express.d.ts
│   ├── config/
│   │   ├── database.config.ts
│   │   ├── jwt.config.ts
│   │   ├── stripe.config.ts
│   │   ├── email.config.ts
│   │   └── app.config.ts
│   └── constants/
│       ├── error-codes.ts
│       ├── status-codes.ts
│       └── commission-rates.ts
│
├── tests/                       # Tests organizados por módulo
│   ├── unit/
│   │   ├── auth/
│   │   ├── provider/
│   │   ├── payments/
│   │   └── wallet/
│   ├── integration/
│   │   ├── auth.test.ts
│   │   ├── appointments.test.ts
│   │   ├── payments.test.ts
│   │   └── wallet.test.ts
│   └── e2e/
│       └── user-journey.test.ts
│
├── app.ts                       # Setup de Express
├── server.ts                    # Entry point
└── router.ts                    # Router principal
```

---

## 📝 PLAN DE IMPLEMENTACIÓN PASO A PASO

### **METODOLOGÍA**

Usaremos un enfoque **iterativo e incremental** dividido en **7 fases**:

1. **Fase 0:** Preparación y Setup
2. **Fase 1:** Refactorización de Base (Auth + Core)
3. **Fase 2:** Sistema de Pagos y Wallet (CRÍTICO)
4. **Fase 3:** Módulo de Proveedores
5. **Fase 4:** Módulo de Clientes y Appointments
6. **Fase 5:** Módulo de Reviews y Chat
7. **Fase 6:** Módulo de Notificaciones y Admin
8. **Fase 7:** Testing y Documentación

Cada fase es **independiente** y genera **valor incremental**.

---

### **FASE 0: PREPARACIÓN Y SETUP** (4-6 horas)

#### **Objetivo:** Preparar el entorno y estructura base

#### **Tareas:**

**0.1 Backup y Documentación**
```bash
# Crear backup del código actual
git checkout -b backup/pre-restructure
git add .
git commit -m "Backup: Antes de reestructuración"
git push origin backup/pre-restructure

# Crear nueva rama de desarrollo
git checkout -b feature/backend-restructure
```

**0.2 Actualizar Base de Datos**
```sql
-- Ejecutar script de actualización de schema
-- Ver archivo: migration-scripts/001-update-existing-tables.sql
```

**0.3 Crear Estructura de Carpetas**
```bash
# Crear nueva estructura
mkdir -p src/modules/{auth,provider,client,appointments,payments,wallet,reviews,chat,notifications,subscriptions,admin}
mkdir -p src/shared/{database,middleware,utils,types,config,constants}
mkdir -p src/tests/{unit,integration,e2e}
mkdir -p migration-scripts
```

**0.4 Configurar TypeScript Paths**
```json
// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": "./src",
    "paths": {
      "@modules/*": ["modules/*"],
      "@shared/*": ["shared/*"],
      "@config/*": ["shared/config/*"],
      "@utils/*": ["shared/utils/*"],
      "@middleware/*": ["shared/middleware/*"],
      "@types/*": ["shared/types/*"]
    }
  }
}
```

**0.5 Instalar Dependencias Adicionales**
```bash
npm install --save-dev jest @types/jest ts-jest supertest @types/supertest
npm install joi class-validator class-transformer
```

**0.6 Crear Scripts de Migración**
- Script para actualizar tablas existentes
- Script para crear tablas nuevas
- Script de rollback

**✅ Checklist Fase 0:**
- [ ] Backup creado
- [ ] Rama feature creada
- [ ] Estructura de carpetas creada
- [ ] TypeScript paths configurado
- [ ] Dependencias instaladas
- [ ] Scripts de migración creados

---

### **FASE 1: REFACTORIZACIÓN DE BASE (AUTH + CORE)** (10-12 horas)

#### **Objetivo:** Reestructurar el módulo de autenticación y shared

#### **1.1 Módulo Shared (4 horas)**

**1.1.1 Database Connection**
```typescript
// src/shared/database/connection.ts
import mysql from 'mysql2/promise';
import { databaseConfig } from '@config/database.config';

class DatabaseConnection {
  private static pool: mysql.Pool;
  
  static getPool(): mysql.Pool {
    if (!this.pool) {
      this.pool = mysql.createPool(databaseConfig);
    }
    return this.pool;
  }
  
  static async testConnection(): Promise<boolean> {
    // ... retry logic
  }
}

export default DatabaseConnection;
```

**1.1.2 Middleware**
```typescript
// src/shared/middleware/auth.middleware.ts
export class AuthMiddleware {
  static authenticate = async (req, res, next) => { /* ... */ }
  static requireRole = (roles: string[]) => { /* ... */ }
  static requireOwnership = (param: string) => { /* ... */ }
}

// src/shared/middleware/error-handler.middleware.ts
export class ErrorHandler {
  static handle = (err, req, res, next) => { /* ... */ }
}

// src/shared/middleware/validation.middleware.ts
export class ValidationMiddleware {
  static validate = (schema) => { /* ... */ }
}
```

**1.1.3 Utils**
```typescript
// src/shared/utils/response.util.ts
export class ResponseUtil {
  static success(data: any, message?: string) {
    return { success: true, data, message };
  }
  
  static error(error: string, code?: string) {
    return { success: false, error, code };
  }
  
  static paginated(data: any[], page: number, limit: number, total: number) {
    return {
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }
}

// src/shared/utils/logger.util.ts
export class Logger {
  static info(module: string, message: string, data?: any) { /* ... */ }
  static error(module: string, message: string, error?: any) { /* ... */ }
  static warn(module: string, message: string, data?: any) { /* ... */ }
}
```

**1.1.4 Constants**
```typescript
// src/shared/constants/commission-rates.ts
export const COMMISSION_RATES = {
  DEFAULT: 15.0,        // 15% para Adomi
  PROVIDER: 85.0,       // 85% para proveedor
  MINIMUM_AMOUNT: 1000  // Mínimo para procesar
};

// src/shared/constants/status-codes.ts
export enum AppointmentStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
  NO_SHOW = 'no_show',
  IN_PROGRESS = 'in_progress'
}
```

#### **1.2 Módulo Auth (6 horas)**

**1.2.1 Repository Layer**
```typescript
// src/modules/auth/repositories/users.repository.ts
export class UsersRepository {
  private pool = DatabaseConnection.getPool();
  
  async findByEmail(email: string): Promise<User | null> {
    const [rows] = await this.pool.query(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );
    return rows[0] || null;
  }
  
  async create(userData: CreateUserDTO): Promise<number> {
    const [result] = await this.pool.execute(
      'INSERT INTO users (email, password, role, name) VALUES (?, ?, ?, ?)',
      [userData.email, userData.password, userData.role, userData.name]
    );
    return result.insertId;
  }
  
  // ... más métodos
}
```

**1.2.2 Service Layer**
```typescript
// src/modules/auth/services/auth.service.ts
export class AuthService {
  private usersRepo = new UsersRepository();
  private jwtService = new JWTService();
  private emailService = new EmailService();
  
  async register(data: RegisterDTO): Promise<RegisterResponse> {
    // 1. Validar email único
    // 2. Hash password
    // 3. Crear usuario
    // 4. Generar tokens
    // 5. Enviar email bienvenida
    // 6. Return response
  }
  
  async login(data: LoginDTO): Promise<LoginResponse> {
    // 1. Buscar usuario
    // 2. Verificar password
    // 3. Generar tokens
    // 4. Return response
  }
  
  // ... más métodos
}
```

**1.2.3 Controller Layer**
```typescript
// src/modules/auth/controllers/auth.controller.ts
export class AuthController {
  private authService = new AuthService();
  
  register = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.authService.register(req.body);
      res.status(201).json(ResponseUtil.success(result));
    } catch (error) {
      next(error);
    }
  }
  
  login = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.authService.login(req.body);
      res.json(ResponseUtil.success(result));
    } catch (error) {
      next(error);
    }
  }
  
  // ... más métodos
}
```

**1.2.4 Routes Layer**
```typescript
// src/modules/auth/routes/auth.routes.ts
export class AuthRoutes {
  private router = Router();
  private controller = new AuthController();
  
  constructor() {
    this.setupRoutes();
  }
  
  private setupRoutes() {
    this.router.post(
      '/register',
      ValidationMiddleware.validate(registerSchema),
      RateLimitMiddleware.register,
      this.controller.register
    );
    
    this.router.post(
      '/login',
      ValidationMiddleware.validate(loginSchema),
      RateLimitMiddleware.auth,
      this.controller.login
    );
    
    // ... más rutas
  }
  
  getRouter(): Router {
    return this.router;
  }
}
```

**1.2.5 Module Index**
```typescript
// src/modules/auth/index.ts
import { AuthRoutes } from './routes/auth.routes';
import { GoogleAuthRoutes } from './routes/google.routes';

export function setupAuthModule(app: Express) {
  const authRoutes = new AuthRoutes();
  const googleRoutes = new GoogleAuthRoutes();
  
  app.use('/auth', authRoutes.getRouter());
  app.use('/google-auth', googleRoutes.getRouter());
}
```

**✅ Checklist Fase 1:**
- [ ] Shared/database implementado
- [ ] Shared/middleware implementado
- [ ] Shared/utils implementado
- [ ] Shared/constants implementado
- [ ] Auth/repositories implementado
- [ ] Auth/services implementado
- [ ] Auth/controllers implementado
- [ ] Auth/routes implementado
- [ ] Auth module integrado
- [ ] Tests unitarios básicos

---

### **FASE 2: SISTEMA DE PAGOS Y WALLET** (12-15 horas)

#### **Objetivo:** Implementar el core del modelo de negocio (85/15 split)

Esta es la **fase más crítica** porque implementa el modelo de comisiones.

#### **2.1 Actualizar Schema de Appointments** (2 horas)

**Script SQL:**
```sql
-- migration-scripts/002-update-appointments.sql
ALTER TABLE bookings RENAME TO appointments;

ALTER TABLE appointments
ADD COLUMN appointment_date DATE NOT NULL AFTER service_id,
ADD COLUMN start_time TIME NOT NULL AFTER appointment_date,
ADD COLUMN end_time TIME NOT NULL AFTER start_time,
ADD COLUMN commission_rate DECIMAL(5,2) DEFAULT 15.00,
ADD COLUMN commission_amount DECIMAL(10,2),
ADD COLUMN cancellation_reason TEXT,
ADD COLUMN cancelled_by ENUM('client', 'provider', 'system'),
ADD COLUMN cancelled_at TIMESTAMP NULL,
ADD COLUMN rejection_reason TEXT,
ADD COLUMN confirmed_at TIMESTAMP NULL,
ADD COLUMN completed_at TIMESTAMP NULL,
ADD COLUMN client_location VARCHAR(255),
ADD COLUMN color VARCHAR(7) DEFAULT '#667eea';

-- Migrar booking_time a appointment_date + start_time
UPDATE appointments 
SET appointment_date = DATE(booking_time),
    start_time = TIME(booking_time);

-- Eliminar columna antigua
ALTER TABLE appointments DROP COLUMN booking_time;

-- Agregar estado rejected e in_progress
ALTER TABLE appointments 
MODIFY COLUMN status ENUM('pending', 'confirmed', 'rejected', 'cancelled', 
                          'completed', 'no_show', 'in_progress') DEFAULT 'pending';
```

#### **2.2 Crear Tablas de Pagos** (2 horas)

```sql
-- migration-scripts/003-create-payments-tables.sql

-- Tabla payments
CREATE TABLE IF NOT EXISTS payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  appointment_id INT NOT NULL,
  client_id INT NOT NULL,
  provider_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  commission_amount DECIMAL(10,2) NOT NULL,
  provider_amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'CLP',
  payment_method ENUM('card', 'cash', 'transfer', 'wallet') NOT NULL,
  stripe_payment_intent_id VARCHAR(255),
  status ENUM('pending', 'completed', 'failed', 'refunded') DEFAULT 'pending',
  paid_at TIMESTAMP NULL,
  refunded_at TIMESTAMP NULL,
  refund_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_appointment (appointment_id),
  INDEX idx_client (client_id),
  INDEX idx_provider (provider_id),
  INDEX idx_status (status)
) ENGINE=InnoDB;

-- Tabla wallet_balance
CREATE TABLE IF NOT EXISTS wallet_balance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  balance DECIMAL(10,2) DEFAULT 0,
  pending_balance DECIMAL(10,2) DEFAULT 0,
  total_earned DECIMAL(10,2) DEFAULT 0,
  total_withdrawn DECIMAL(10,2) DEFAULT 0,
  currency VARCHAR(3) DEFAULT 'CLP',
  last_transaction_at TIMESTAMP NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user (user_id)
) ENGINE=InnoDB;

-- Tabla transactions
CREATE TABLE IF NOT EXISTS transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type ENUM('payment_received', 'payment_sent', 'withdrawal', 'refund', 'commission') NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'CLP',
  description VARCHAR(255),
  payment_id INT NULL,
  appointment_id INT NULL,
  balance_before DECIMAL(10,2),
  balance_after DECIMAL(10,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL,
  INDEX idx_user (user_id),
  INDEX idx_type (type),
  INDEX idx_created (created_at)
) ENGINE=InnoDB;

-- Tabla withdrawals
CREATE TABLE IF NOT EXISTS withdrawals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'CLP',
  bank_account VARCHAR(255) NOT NULL,
  bank_name VARCHAR(100),
  account_holder VARCHAR(255),
  status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
  processed_at TIMESTAMP NULL,
  transaction_reference VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_provider (provider_id),
  INDEX idx_status (status)
) ENGINE=InnoDB;

-- Tabla payment_methods
CREATE TABLE IF NOT EXISTS payment_methods (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  stripe_payment_method_id VARCHAR(255) NOT NULL,
  card_brand VARCHAR(20),
  card_last4 VARCHAR(4),
  card_exp_month INT,
  card_exp_year INT,
  is_default BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_client (client_id)
) ENGINE=InnoDB;
```

#### **2.3 Módulo Payments** (5 horas)

**2.3.1 Commission Service (CRÍTICO)**
```typescript
// src/modules/payments/services/commission.service.ts
export class CommissionService {
  /**
   * Calcula la comisión basada en el precio del servicio
   * 85% para proveedor, 15% para Adomi
   */
  calculateCommission(amount: number, rate: number = COMMISSION_RATES.DEFAULT): CommissionBreakdown {
    const commissionAmount = Number((amount * (rate / 100)).toFixed(2));
    const providerAmount = Number((amount - commissionAmount).toFixed(2));
    
    return {
      totalAmount: amount,
      commissionRate: rate,
      commissionAmount,
      providerAmount,
      platformAmount: commissionAmount
    };
  }
  
  /**
   * Verifica si el monto es válido para procesar
   */
  validateAmount(amount: number): boolean {
    return amount >= COMMISSION_RATES.MINIMUM_AMOUNT;
  }
}
```

**2.3.2 Payments Repository**
```typescript
// src/modules/payments/repositories/payments.repository.ts
export class PaymentsRepository {
  async create(paymentData: CreatePaymentDTO): Promise<number> {
    const [result] = await pool.execute(`
      INSERT INTO payments (
        appointment_id, client_id, provider_id,
        amount, commission_amount, provider_amount,
        currency, payment_method, stripe_payment_intent_id,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      paymentData.appointment_id,
      paymentData.client_id,
      paymentData.provider_id,
      paymentData.amount,
      paymentData.commission_amount,
      paymentData.provider_amount,
      paymentData.currency,
      paymentData.payment_method,
      paymentData.stripe_payment_intent_id,
      'pending'
    ]);
    
    return result.insertId;
  }
  
  async updateStatus(paymentId: number, status: PaymentStatus): Promise<void> {
    await pool.execute(
      'UPDATE payments SET status = ?, paid_at = NOW() WHERE id = ?',
      [status, paymentId]
    );
  }
  
  // ... más métodos
}
```

**2.3.3 Payments Service**
```typescript
// src/modules/payments/services/payments.service.ts
export class PaymentsService {
  private paymentsRepo = new PaymentsRepository();
  private commissionService = new CommissionService();
  private walletService = new WalletService();
  private stripeService = new StripeIntegrationService();
  
  /**
   * Procesa un pago de una cita
   */
  async processAppointmentPayment(appointmentId: number): Promise<Payment> {
    // 1. Obtener datos de la cita
    const appointment = await this.getAppointment(appointmentId);
    
    // 2. Calcular comisión
    const commission = this.commissionService.calculateCommission(
      appointment.price,
      appointment.commission_rate
    );
    
    // 3. Crear payment intent en Stripe
    const paymentIntent = await this.stripeService.createPaymentIntent({
      amount: commission.totalAmount,
      customerId: appointment.client.stripe_customer_id,
      metadata: {
        appointmentId,
        providerId: appointment.provider_id,
        clientId: appointment.client_id
      }
    });
    
    // 4. Crear registro de pago
    const paymentId = await this.paymentsRepo.create({
      appointment_id: appointmentId,
      client_id: appointment.client_id,
      provider_id: appointment.provider_id,
      amount: commission.totalAmount,
      commission_amount: commission.commissionAmount,
      provider_amount: commission.providerAmount,
      currency: 'CLP',
      payment_method: 'card',
      stripe_payment_intent_id: paymentIntent.id
    });
    
    return this.paymentsRepo.findById(paymentId);
  }
  
  /**
   * Confirma un pago y actualiza wallets
   * Se llama desde el webhook de Stripe
   */
  async confirmPayment(paymentId: number): Promise<void> {
    const payment = await this.paymentsRepo.findById(paymentId);
    
    // 1. Actualizar estado del pago
    await this.paymentsRepo.updateStatus(paymentId, 'completed');
    
    // 2. Acreditar en wallet del proveedor
    await this.walletService.creditBalance(
      payment.provider_id,
      payment.provider_amount,
      {
        type: 'payment_received',
        paymentId,
        appointmentId: payment.appointment_id,
        description: `Pago recibido de cita #${payment.appointment_id}`
      }
    );
    
    // 3. Registrar comisión de Adomi
    await this.walletService.recordCommission(
      payment.commission_amount,
      paymentId
    );
    
    // 4. Actualizar estado de la cita
    await this.appointmentsService.updatePaymentStatus(
      payment.appointment_id,
      'paid'
    );
  }
}
```

#### **2.4 Módulo Wallet** (5 horas)

**2.4.1 Wallet Service**
```typescript
// src/modules/wallet/services/wallet.service.ts
export class WalletService {
  private walletRepo = new WalletBalanceRepository();
  private transactionsRepo = new TransactionsRepository();
  
  /**
   * Acredita saldo en la billetera del usuario
   */
  async creditBalance(
    userId: number,
    amount: number,
    metadata: TransactionMetadata
  ): Promise<void> {
    // Usar transacción SQL para atomicidad
    await DatabaseConnection.getPool().transaction(async (connection) => {
      // 1. Obtener saldo actual
      const wallet = await this.walletRepo.findByUserId(userId, connection);
      const balanceBefore = wallet.balance;
      const balanceAfter = balanceBefore + amount;
      
      // 2. Actualizar saldo
      await this.walletRepo.updateBalance(
        userId,
        balanceAfter,
        connection
      );
      
      // 3. Registrar transacción
      await this.transactionsRepo.create({
        user_id: userId,
        type: metadata.type,
        amount,
        description: metadata.description,
        payment_id: metadata.paymentId,
        appointment_id: metadata.appointmentId,
        balance_before: balanceBefore,
        balance_after: balanceAfter
      }, connection);
    });
  }
  
  /**
   * Debita saldo de la billetera del usuario
   */
  async debitBalance(
    userId: number,
    amount: number,
    metadata: TransactionMetadata
  ): Promise<void> {
    // Similar a creditBalance pero restando
  }
  
  /**
   * Obtiene el balance disponible del usuario
   */
  async getBalance(userId: number): Promise<WalletBalance> {
    return this.walletRepo.findByUserId(userId);
  }
  
  /**
   * Solicita un retiro de fondos
   */
  async requestWithdrawal(
    providerId: number,
    amount: number,
    bankAccount: BankAccountInfo
  ): Promise<Withdrawal> {
    // 1. Validar saldo disponible
    const wallet = await this.getBalance(providerId);
    if (wallet.balance < amount) {
      throw new InsufficientFundsError();
    }
    
    // 2. Crear solicitud de retiro
    const withdrawalId = await this.withdrawalsRepo.create({
      provider_id: providerId,
      amount,
      bank_account: bankAccount.account,
      bank_name: bankAccount.bank,
      account_holder: bankAccount.holder,
      status: 'pending'
    });
    
    // 3. Mover a pending_balance
    await this.walletRepo.moveToPending(providerId, amount);
    
    return this.withdrawalsRepo.findById(withdrawalId);
  }
}
```

**2.4.2 Transactions Repository**
```typescript
// src/modules/wallet/repositories/transactions.repository.ts
export class TransactionsRepository {
  async create(data: CreateTransactionDTO, connection?: PoolConnection): Promise<number> {
    const conn = connection || DatabaseConnection.getPool();
    
    const [result] = await conn.execute(`
      INSERT INTO transactions (
        user_id, type, amount, currency, description,
        payment_id, appointment_id, balance_before, balance_after
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      data.user_id,
      data.type,
      data.amount,
      data.currency || 'CLP',
      data.description,
      data.payment_id || null,
      data.appointment_id || null,
      data.balance_before,
      data.balance_after
    ]);
    
    return result.insertId;
  }
  
  async findByUser(userId: number, filters?: TransactionFilters): Promise<Transaction[]> {
    let query = 'SELECT * FROM transactions WHERE user_id = ?';
    const params = [userId];
    
    if (filters?.type) {
      query += ' AND type = ?';
      params.push(filters.type);
    }
    
    if (filters?.startDate) {
      query += ' AND created_at >= ?';
      params.push(filters.startDate);
    }
    
    if (filters?.endDate) {
      query += ' AND created_at <= ?';
      params.push(filters.endDate);
    }
    
    query += ' ORDER BY created_at DESC';
    
    if (filters?.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }
    
    const [rows] = await DatabaseConnection.getPool().query(query, params);
    return rows as Transaction[];
  }
}
```

**✅ Checklist Fase 2:**
- [ ] Schema appointments actualizado
- [ ] Tablas payments creadas
- [ ] Tablas wallet creadas
- [ ] Commission service implementado
- [ ] Payments service implementado
- [ ] Wallet service implementado
- [ ] Withdrawals service implementado
- [ ] Repositories implementados
- [ ] Controllers implementados
- [ ] Routes implementados
- [ ] Tests unitarios
- [ ] Tests de integración

---

### **FASE 3: MÓDULO DE PROVEEDORES** (12-15 horas)

#### **Objetivo:** Implementar toda la funcionalidad de proveedores

#### **3.1 Crear Tablas de Proveedores** (2 horas)

```sql
-- migration-scripts/004-create-provider-tables.sql

-- Tabla provider_profiles
CREATE TABLE IF NOT EXISTS provider_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  professional_title VARCHAR(255),
  main_commune VARCHAR(100),
  main_region VARCHAR(100),
  years_experience INT DEFAULT 0,
  bio TEXT,
  profile_photo_url VARCHAR(500),
  cover_photo_url VARCHAR(500),
  profile_completion INT DEFAULT 0,
  is_verified BOOLEAN DEFAULT FALSE,
  verification_status ENUM('none', 'pending', 'approved', 'rejected') DEFAULT 'none',
  profile_views INT DEFAULT 0,
  rating_average DECIMAL(3,2) DEFAULT 0,
  review_count INT DEFAULT 0,
  completed_appointments INT DEFAULT 0,
  last_profile_update TIMESTAMP,
  is_online BOOLEAN DEFAULT FALSE,
  last_seen TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_provider (provider_id),
  INDEX idx_commune (main_commune),
  INDEX idx_verified (is_verified),
  INDEX idx_rating (rating_average)
) ENGINE=InnoDB;

-- Tabla provider_services (REDISEÑADA)
DROP TABLE IF EXISTS provider_services;
CREATE TABLE IF NOT EXISTS provider_services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  duration_minutes INT NOT NULL,
  category_id INT,
  custom_category VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  order_index INT DEFAULT 0,
  service_image_url VARCHAR(500),
  is_featured BOOLEAN DEFAULT FALSE,
  booking_count INT DEFAULT 0,
  average_rating DECIMAL(3,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES service_categories(id) ON DELETE SET NULL,
  INDEX idx_provider (provider_id),
  INDEX idx_category (category_id),
  INDEX idx_active (is_active)
) ENGINE=InnoDB;

-- Tabla provider_portfolio
CREATE TABLE IF NOT EXISTS provider_portfolio (
  id INT AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL,
  file_url VARCHAR(500) NOT NULL,
  file_type ENUM('image', 'video') NOT NULL,
  title VARCHAR(255),
  description TEXT,
  order_index INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_provider (provider_id)
) ENGINE=InnoDB;

-- Tabla provider_locations
CREATE TABLE IF NOT EXISTS provider_locations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL,
  commune VARCHAR(100) NOT NULL,
  region VARCHAR(100) NOT NULL,
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_provider (provider_id),
  UNIQUE KEY unique_provider_commune (provider_id, commune)
) ENGINE=InnoDB;

-- Tabla provider_availability
CREATE TABLE IF NOT EXISTS provider_availability (
  id INT AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL,
  day_of_week ENUM('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday') NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_provider (provider_id)
) ENGINE=InnoDB;

-- Tabla availability_exceptions
CREATE TABLE IF NOT EXISTS availability_exceptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL,
  exception_date DATE NOT NULL,
  reason VARCHAR(255),
  is_available BOOLEAN DEFAULT FALSE,
  start_time TIME NULL,
  end_time TIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_provider (provider_id),
  INDEX idx_date (exception_date),
  UNIQUE KEY unique_provider_date (provider_id, exception_date)
) ENGINE=InnoDB;
```

#### **3.2 Profile Service** (3 horas)

```typescript
// src/modules/provider/services/profile.service.ts
export class ProviderProfileService {
  private profileRepo = new ProviderProfilesRepository();
  
  /**
   * Crea o actualiza el perfil del proveedor
   */
  async upsertProfile(providerId: number, data: UpdateProfileDTO): Promise<ProviderProfile> {
    const existing = await this.profileRepo.findByProviderId(providerId);
    
    if (existing) {
      await this.profileRepo.update(providerId, data);
    } else {
      await this.profileRepo.create({
        provider_id: providerId,
        full_name: data.full_name,
        ...data
      });
    }
    
    // Recalcular completitud del perfil
    await this.updateProfileCompletion(providerId);
    
    return this.profileRepo.findByProviderId(providerId);
  }
  
  /**
   * Calcula el % de completitud del perfil
   */
  async updateProfileCompletion(providerId: number): Promise<number> {
    const profile = await this.profileRepo.findByProviderId(providerId);
    const services = await this.servicesRepo.findByProvider(providerId);
    const portfolio = await this.portfolioRepo.findByProvider(providerId);
    
    let completion = 0;
    
    // full_name: 10%
    if (profile.full_name) completion += 10;
    
    // professional_title: 10%
    if (profile.professional_title) completion += 10;
    
    // main_commune: 10%
    if (profile.main_commune) completion += 10;
    
    // years_experience > 0: 5%
    if (profile.years_experience > 0) completion += 5;
    
    // bio (min 50 chars): 15%
    if (profile.bio && profile.bio.length >= 50) completion += 15;
    
    // profile_photo_url: 15%
    if (profile.profile_photo_url) completion += 15;
    
    // cover_photo_url: 10%
    if (profile.cover_photo_url) completion += 10;
    
    // Tiene servicios (>=1): 15%
    if (services.length >= 1) completion += 15;
    
    // Tiene portafolio (>=2): 10%
    if (portfolio.length >= 2) completion += 10;
    
    // Actualizar en BD
    await this.profileRepo.updateCompletion(providerId, completion);
    
    return completion;
  }
  
  /**
   * Busca proveedores con filtros
   */
  async searchProviders(filters: ProviderSearchFilters): Promise<ProviderProfile[]> {
    return this.profileRepo.search(filters);
  }
}
```

#### **3.3 Services Management** (3 horas)

```typescript
// src/modules/provider/services/services-management.service.ts
export class ServicesManagementService {
  private servicesRepo = new ProviderServicesRepository();
  
  async createService(providerId: number, data: CreateServiceDTO): Promise<ProviderService> {
    // Validar límite de servicios según plan
    await this.validateServiceLimit(providerId);
    
    const serviceId = await this.servicesRepo.create({
      provider_id: providerId,
      ...data
    });
    
    // Actualizar completitud del perfil
    await this.profileService.updateProfileCompletion(providerId);
    
    return this.servicesRepo.findById(serviceId);
  }
  
  async updateService(serviceId: number, providerId: number, data: UpdateServiceDTO): Promise<ProviderService> {
    // Validar ownership
    const service = await this.servicesRepo.findById(serviceId);
    if (service.provider_id !== providerId) {
      throw new UnauthorizedError();
    }
    
    await this.servicesRepo.update(serviceId, data);
    return this.servicesRepo.findById(serviceId);
  }
  
  async deleteService(serviceId: number, providerId: number): Promise<void> {
    // Validar que no tenga citas futuras
    const futureAppointments = await this.appointmentsRepo.findFutureByService(serviceId);
    if (futureAppointments.length > 0) {
      throw new Error('No se puede eliminar servicio con citas futuras');
    }
    
    await this.servicesRepo.delete(serviceId);
  }
  
  private async validateServiceLimit(providerId: number): Promise<void> {
    const subscription = await this.subscriptionsRepo.getActiveByUser(providerId);
    const plan = await this.plansRepo.findById(subscription.plan_id);
    const currentCount = await this.servicesRepo.countByProvider(providerId);
    
    if (currentCount >= plan.max_services) {
      throw new ServiceLimitReachedError(plan.max_services);
    }
  }
}
```

#### **3.4 Availability Service** (3 horas)

```typescript
// src/modules/provider/services/availability.service.ts
export class AvailabilityService {
  /**
   * Obtiene slots disponibles para un proveedor en una fecha
   */
  async getAvailableSlots(
    providerId: number,
    date: Date,
    serviceId: number
  ): Promise<TimeSlot[]> {
    // 1. Obtener duración del servicio
    const service = await this.servicesRepo.findById(serviceId);
    const duration = service.duration_minutes;
    
    // 2. Obtener disponibilidad del día de la semana
    const dayOfWeek = this.getDayOfWeek(date);
    const availability = await this.availabilityRepo.findByProviderAndDay(
      providerId,
      dayOfWeek
    );
    
    if (!availability.length) {
      return []; // No trabaja este día
    }
    
    // 3. Obtener excepciones para esta fecha
    const exception = await this.exceptionsRepo.findByProviderAndDate(
      providerId,
      date
    );
    
    if (exception && !exception.is_available) {
      return []; // Día bloqueado
    }
    
    // 4. Obtener citas ya agendadas para esta fecha
    const appointments = await this.appointmentsRepo.findByProviderAndDate(
      providerId,
      date
    );
    
    // 5. Generar slots disponibles
    const slots: TimeSlot[] = [];
    
    for (const block of availability) {
      const blockSlots = this.generateSlots(
        block.start_time,
        block.end_time,
        duration,
        appointments
      );
      slots.push(...blockSlots);
    }
    
    return slots;
  }
  
  private generateSlots(
    startTime: string,
    endTime: string,
    duration: number,
    busySlots: Appointment[]
  ): TimeSlot[] {
    const slots: TimeSlot[] = [];
    let currentTime = this.parseTime(startTime);
    const endTimeObj = this.parseTime(endTime);
    
    while (currentTime < endTimeObj) {
      const slotEnd = this.addMinutes(currentTime, duration);
      
      if (slotEnd > endTimeObj) break;
      
      // Verificar si el slot está ocupado
      const isOccupied = busySlots.some(apt => 
        this.timesOverlap(currentTime, slotEnd, apt.start_time, apt.end_time)
      );
      
      if (!isOccupied) {
        slots.push({
          start: this.formatTime(currentTime),
          end: this.formatTime(slotEnd),
          available: true
        });
      }
      
      // Avanzar al siguiente slot (cada 30 min o según duración)
      currentTime = this.addMinutes(currentTime, 30);
    }
    
    return slots;
  }
}
```

**✅ Checklist Fase 3:**
- [ ] Tablas provider creadas
- [ ] Profile service implementado
- [ ] Services management implementado
- [ ] Portfolio service implementado
- [ ] Availability service implementado
- [ ] Locations service implementado
- [ ] Repositories implementados
- [ ] Controllers implementados
- [ ] Routes implementados
- [ ] Validators implementados
- [ ] Tests unitarios
- [ ] Tests de integración

---

### **FASE 4: MÓDULO DE CLIENTES Y APPOINTMENTS** (10-12 horas)

#### **Objetivo:** Sistema de búsqueda, favoritos y reservas

#### **4.1 Crear Tablas** (1 hora)

```sql
-- migration-scripts/005-create-client-tables.sql

CREATE TABLE IF NOT EXISTS client_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  profile_photo_url VARCHAR(500),
  address VARCHAR(255),
  commune VARCHAR(100),
  region VARCHAR(100),
  preferred_language ENUM('es', 'en') DEFAULT 'es',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS favorites (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  provider_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_client_provider (client_id, provider_id)
) ENGINE=InnoDB;
```

#### **4.2 Search Service** (3 horas)

```typescript
// src/modules/client/services/search.service.ts
export class SearchService {
  /**
   * Búsqueda avanzada de proveedores
   */
  async searchProviders(filters: SearchFilters): Promise<SearchResults> {
    const {
      query,          // Texto libre
      commune,        // Ubicación
      categoryId,     // Categoría de servicio
      minPrice,
      maxPrice,
      minRating,
      isVerified,
      page = 1,
      limit = 20
    } = filters;
    
    // Construir query dinámica
    let sql = `
      SELECT DISTINCT
        p.provider_id,
        pp.full_name,
        pp.professional_title,
        pp.main_commune,
        pp.profile_photo_url,
        pp.rating_average,
        pp.review_count,
        pp.is_verified,
        MIN(ps.price) as min_price,
        MAX(ps.price) as max_price,
        COUNT(DISTINCT ps.id) as services_count
      FROM provider_profiles pp
      JOIN users p ON pp.provider_id = p.id
      JOIN provider_services ps ON p.id = ps.provider_id
      WHERE p.is_active = true
        AND pp.profile_completion >= 70
        AND ps.is_active = true
    `;
    
    const params: any[] = [];
    
    // Filtro por texto
    if (query) {
      sql += ` AND (
        pp.full_name LIKE ? OR
        pp.professional_title LIKE ? OR
        pp.bio LIKE ? OR
        ps.name LIKE ?
      )`;
      const searchTerm = `%${query}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }
    
    // Filtro por ubicación
    if (commune) {
      sql += ` AND (
        pp.main_commune = ? OR
        EXISTS (
          SELECT 1 FROM provider_locations pl
          WHERE pl.provider_id = p.id AND pl.commune = ?
        )
      )`;
      params.push(commune, commune);
    }
    
    // Filtro por categoría
    if (categoryId) {
      sql += ` AND ps.category_id = ?`;
      params.push(categoryId);
    }
    
    // Filtro por precio
    if (minPrice) {
      sql += ` AND ps.price >= ?`;
      params.push(minPrice);
    }
    if (maxPrice) {
      sql += ` AND ps.price <= ?`;
      params.push(maxPrice);
    }
    
    // Filtro por rating
    if (minRating) {
      sql += ` AND pp.rating_average >= ?`;
      params.push(minRating);
    }
    
    // Filtro por verificado
    if (isVerified) {
      sql += ` AND pp.is_verified = true`;
    }
    
    // Agrupar y ordenar
    sql += `
      GROUP BY p.provider_id
      ORDER BY pp.is_verified DESC, pp.rating_average DESC, pp.review_count DESC
    `;
    
    // Paginación
    const offset = (page - 1) * limit;
    sql += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    
    // Ejecutar query
    const [rows] = await DatabaseConnection.getPool().query(sql, params);
    
    // Obtener total para paginación
    const totalSql = sql.replace(/SELECT DISTINCT.+?FROM/, 'SELECT COUNT(DISTINCT p.provider_id) as total FROM');
    const [countRows] = await DatabaseConnection.getPool().query(
      totalSql.split('ORDER BY')[0],
      params.slice(0, -2)
    );
    const total = countRows[0].total;
    
    return {
      providers: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }
}
```

#### **4.3 Appointments Service** (4 horas)

```typescript
// src/modules/appointments/services/appointments.service.ts
export class AppointmentsService {
  /**
   * Crea una nueva cita
   */
  async createAppointment(data: CreateAppointmentDTO): Promise<Appointment> {
    const {
      client_id,
      provider_id,
      service_id,
      appointment_date,
      start_time,
      notes
    } = data;
    
    // 1. Validar servicio existe
    const service = await this.servicesRepo.findById(service_id);
    if (!service || service.provider_id !== provider_id) {
      throw new Error('Servicio no válido');
    }
    
    // 2. Calcular end_time
    const end_time = this.calculateEndTime(start_time, service.duration_minutes);
    
    // 3. Validar disponibilidad
    const isAvailable = await this.availabilityService.checkSlotAvailable(
      provider_id,
      appointment_date,
      start_time,
      end_time
    );
    
    if (!isAvailable) {
      throw new SlotNotAvailableError();
    }
    
    // 4. Calcular comisión
    const commission = this.commissionService.calculateCommission(service.price);
    
    // 5. Crear appointment
    const appointmentId = await this.appointmentsRepo.create({
      provider_id,
      client_id,
      service_id,
      appointment_date,
      start_time,
      end_time,
      status: 'pending',
      price: service.price,
      commission_rate: commission.commissionRate,
      commission_amount: commission.commissionAmount,
      notes,
      color: '#667eea'
    });
    
    // 6. Notificar al proveedor
    await this.notificationsService.notifyNewAppointment(provider_id, appointmentId);
    
    return this.appointmentsRepo.findById(appointmentId);
  }
  
  /**
   * Proveedor acepta una cita
   */
  async confirmAppointment(appointmentId: number, providerId: number): Promise<void> {
    // 1. Validar ownership
    const appointment = await this.appointmentsRepo.findById(appointmentId);
    if (appointment.provider_id !== providerId) {
      throw new UnauthorizedError();
    }
    
    // 2. Validar estado
    if (appointment.status !== 'pending') {
      throw new Error('La cita ya no está pendiente');
    }
    
    // 3. Actualizar estado
    await this.appointmentsRepo.updateStatus(appointmentId, 'confirmed', {
      confirmed_at: new Date()
    });
    
    // 4. Crear/procesar pago
    await this.paymentsService.processAppointmentPayment(appointmentId);
    
    // 5. Notificar al cliente
    await this.notificationsService.notifyAppointmentConfirmed(
      appointment.client_id,
      appointmentId
    );
    
    // 6. Registrar en historial
    await this.appointmentHistoryRepo.create({
      appointment_id: appointmentId,
      changed_by: providerId,
      old_status: 'pending',
      new_status: 'confirmed',
      change_reason: 'Confirmado por proveedor'
    });
  }
  
  /**
   * Proveedor rechaza una cita
   */
  async rejectAppointment(
    appointmentId: number,
    providerId: number,
    reason: string
  ): Promise<void> {
    // Similar a confirmAppointment pero cambiando a rejected
  }
  
  /**
   * Completa una cita
   */
  async completeAppointment(appointmentId: number, providerId: number): Promise<void> {
    // 1. Actualizar estado
    await this.appointmentsRepo.updateStatus(appointmentId, 'completed', {
      completed_at: new Date()
    });
    
    // 2. Confirmar pago y acreditar wallet
    await this.paymentsService.confirmPayment(appointmentId);
    
    // 3. Actualizar contador en provider_profiles
    await this.profileRepo.incrementCompletedAppointments(providerId);
    
    // 4. Solicitar reseña al cliente
    await this.notificationsService.requestReview(
      appointment.client_id,
      appointmentId
    );
  }
}
```

**✅ Checklist Fase 4:**
- [ ] Tablas client creadas
- [ ] Search service implementado
- [ ] Favorites service implementado
- [ ] Appointments service completo implementado
- [ ] Calendar service implementado
- [ ] Repositories implementados
- [ ] Controllers implementados
- [ ] Routes implementados
- [ ] Tests

---

### **FASE 5: MÓDULO DE REVIEWS Y CHAT** (8-10 horas)

#### **4 horas para Reviews, 4-6 horas para Chat**

*[Continuar con estructura similar...]*

### **FASE 6: NOTIFICACIONES Y ADMIN** (6-8 horas)

*[Continuar con estructura similar...]*

### **FASE 7: TESTING Y DOCUMENTACIÓN** (8-10 horas)

*[Tests, documentación API, Swagger...]*

---

## ⏱️ CRONOGRAMA ESTIMADO

| Fase | Descripción | Horas | Días (6h/día) |
|------|-------------|-------|---------------|
| 0 | Preparación y Setup | 4-6h | 1 día |
| 1 | Refactorización Base (Auth + Core) | 10-12h | 2 días |
| 2 | Pagos y Wallet (CRÍTICO) | 12-15h | 2-3 días |
| 3 | Módulo Proveedores | 12-15h | 2-3 días |
| 4 | Clientes y Appointments | 10-12h | 2 días |
| 5 | Reviews y Chat | 8-10h | 1-2 días |
| 6 | Notificaciones y Admin | 6-8h | 1 día |
| 7 | Testing y Documentación | 8-10h | 1-2 días |
| **TOTAL** | **70-88 horas** | **12-16 días** |

**Con dedicación full-time (8h/día): 9-11 días laborales (2-3 semanas)**

---

## 📋 CHECKLIST MAESTRO DE TAREAS

### **✅ Fase 0: Preparación**
- [ ] Crear backup en git
- [ ] Crear rama feature/backend-restructure
- [ ] Crear estructura de carpetas
- [ ] Configurar TypeScript paths
- [ ] Instalar dependencias
- [ ] Crear scripts de migración

### **✅ Fase 1: Base**
- [ ] Implementar shared/database
- [ ] Implementar shared/middleware
- [ ] Implementar shared/utils
- [ ] Implementar shared/constants
- [ ] Refactorizar auth/repositories
- [ ] Refactorizar auth/services
- [ ] Refactorizar auth/controllers
- [ ] Refactorizar auth/routes
- [ ] Tests unitarios auth

### **✅ Fase 2: Pagos**
- [ ] Migrar appointments table
- [ ] Crear payments table
- [ ] Crear wallet_balance table
- [ ] Crear transactions table
- [ ] Crear withdrawals table
- [ ] Implementar commission.service
- [ ] Implementar payments.service
- [ ] Implementar wallet.service
- [ ] Implementar repositories
- [ ] Implementar controllers
- [ ] Implementar routes
- [ ] Tests pagos y wallet

### **✅ Fase 3: Proveedores**
- [ ] Crear provider_profiles table
- [ ] Crear provider_services table (nueva)
- [ ] Crear provider_portfolio table
- [ ] Crear provider_locations table
- [ ] Crear provider_availability table
- [ ] Crear availability_exceptions table
- [ ] Implementar profile.service
- [ ] Implementar services-management.service
- [ ] Implementar portfolio.service
- [ ] Implementar availability.service
- [ ] Implementar locations.service
- [ ] Implementar search.service
- [ ] Implementar repositories
- [ ] Implementar controllers
- [ ] Implementar routes
- [ ] Tests proveedores

### **✅ Fase 4: Clientes**
- [ ] Crear client_profiles table
- [ ] Crear favorites table
- [ ] Implementar client-profile.service
- [ ] Implementar favorites.service
- [ ] Implementar search.service (cliente)
- [ ] Refactorizar appointments.service
- [ ] Implementar calendar.service
- [ ] Implementar repositories
- [ ] Implementar controllers
- [ ] Implementar routes
- [ ] Tests clientes

### **✅ Fase 5: Reviews y Chat**
- [ ] Crear reviews table
- [ ] Crear review_responses table
- [ ] Crear conversations table
- [ ] Crear messages table
- [ ] Implementar reviews.service
- [ ] Implementar rating.service
- [ ] Implementar conversations.service
- [ ] Implementar messages.service
- [ ] Implementar repositories
- [ ] Implementar controllers
- [ ] Implementar routes
- [ ] Tests reviews y chat

### **✅ Fase 6: Notificaciones y Admin**
- [ ] Crear notifications table
- [ ] Crear notification_preferences table
- [ ] Crear identity_verifications table
- [ ] Crear platform_settings table
- [ ] Implementar notifications.service
- [ ] Implementar verifications.service
- [ ] Implementar platform-settings.service
- [ ] Implementar statistics.service
- [ ] Implementar repositories
- [ ] Implementar controllers
- [ ] Implementar routes
- [ ] Tests notificaciones y admin

### **✅ Fase 7: Testing y Docs**
- [ ] Tests unitarios completos
- [ ] Tests de integración
- [ ] Tests E2E
- [ ] Documentación API (Swagger)
- [ ] README actualizado
- [ ] Guías de desarrollo
- [ ] Postman collection

---

## 🎯 PRÓXIMOS PASOS INMEDIATOS

1. **Revisar y aprobar este plan**
2. **Ejecutar Fase 0** (crear estructura y backup)
3. **Ejecutar migraciones de BD** (actualizar schema)
4. **Comenzar Fase 1** (refactorizar auth + shared)

---

## 📚 DOCUMENTOS RELACIONADOS

- `DATABASE_SCHEMA_COMPLETE.sql` - Schema de BD completo
- `migration-scripts/` - Scripts de migración SQL
- `tests/` - Suite de tests
- `docs/` - Documentación API

---

**Última Actualización:** 9 de Octubre, 2025  
**Autor:** AI Assistant  
**Estado:** Pendiente de Aprobación

