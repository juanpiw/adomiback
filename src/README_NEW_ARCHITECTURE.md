# 🏗️ Nueva Arquitectura del Backend - ADOMI

## 📋 Resumen

Esta es la nueva arquitectura modular del backend de ADOMI, reorganizada por **dominios de negocio** para mejor mantenibilidad y escalabilidad.

## 🎯 Principios de Diseño

1. **Modularidad por Dominio** - Cada módulo es independiente
2. **Separation of Concerns** - Capas bien definidas (Routes → Controllers → Services → Repositories)
3. **DRY (Don't Repeat Yourself)** - Código compartido en `shared/`
4. **TypeScript Paths** - Imports limpios con alias (`@modules/*`, `@shared/*`, etc.)
5. **Testeable** - Estructura que facilita testing unitario y de integración

## 📁 Estructura de Carpetas

```
src/
├── modules/              # Módulos por dominio de negocio
│   ├── auth/            # Autenticación y autorización
│   ├── provider/        # Funcionalidad de proveedores
│   ├── client/          # Funcionalidad de clientes
│   ├── appointments/    # Sistema de citas
│   ├── payments/        # Sistema de pagos (CRÍTICO)
│   ├── wallet/          # Billetera y transacciones (CRÍTICO)
│   ├── reviews/         # Sistema de reseñas
│   ├── chat/            # Mensajería
│   ├── notifications/   # Notificaciones
│   ├── subscriptions/   # Planes y suscripciones
│   └── admin/           # Panel de administración
│
├── shared/              # Código compartido
│   ├── database/        # Gestión de conexiones a BD
│   ├── middleware/      # Middlewares de Express
│   ├── utils/           # Utilidades generales
│   ├── types/           # Tipos TypeScript compartidos
│   ├── config/          # Configuraciones
│   └── constants/       # Constantes de la aplicación
│
└── tests/               # Tests organizados
    ├── unit/            # Tests unitarios por módulo
    ├── integration/     # Tests de integración
    └── e2e/             # Tests end-to-end
```

## 🔄 Arquitectura en Capas (Cada Módulo)

```
modules/[nombre]/
├── routes/              # Definición de rutas HTTP
│   └── *.routes.ts      # Configuración de endpoints
│
├── controllers/         # Controladores (lógica de request/response)
│   └── *.controller.ts  # Manejo de HTTP, validación básica
│
├── services/            # Servicios (lógica de negocio)
│   └── *.service.ts     # Lógica compleja, orquestación
│
├── repositories/        # Repositorios (acceso a datos)
│   └── *.repository.ts  # Queries SQL, operaciones de BD
│
├── validators/          # Validadores Joi
│   └── *.validator.ts   # Schemas de validación
│
├── types/               # Tipos TypeScript del módulo
│   └── *.types.ts       # Interfaces, DTOs, Types
│
└── index.ts             # Punto de entrada del módulo
```

## 🔧 TypeScript Paths Configurados

Usa estos imports limpios:

```typescript
// ❌ ANTES (imports relativos feos)
import { AuthService } from '../../../services/auth.service';
import { ResponseUtil } from '../../../../shared/utils/response.util';

// ✅ AHORA (imports limpios con alias)
import { AuthService } from '@modules/auth/services/auth.service';
import { ResponseUtil } from '@utils/response.util';
```

### Paths Disponibles:

| Alias | Ruta Real | Uso |
|-------|-----------|-----|
| `@modules/*` | `src/modules/*` | Importar desde módulos |
| `@shared/*` | `src/shared/*` | Código compartido |
| `@config/*` | `src/shared/config/*` | Configuraciones |
| `@utils/*` | `src/shared/utils/*` | Utilidades |
| `@middleware/*` | `src/shared/middleware/*` | Middlewares |
| `@types/*` | `src/shared/types/*` | Tipos compartidos |
| `@constants/*` | `src/shared/constants/*` | Constantes |
| `@database/*` | `src/shared/database/*` | Database utils |

## 📦 Ejemplo: Módulo de Pagos

```
modules/payments/
├── routes/
│   ├── payments.routes.ts           # GET/POST /payments/*
│   ├── payment-methods.routes.ts    # GET/POST /payment-methods/*
│   └── webhooks.routes.ts           # POST /webhooks/stripe
│
├── controllers/
│   ├── payments.controller.ts       # Maneja requests de pagos
│   ├── payment-methods.controller.ts
│   └── webhooks.controller.ts
│
├── services/
│   ├── payments.service.ts          # Lógica de procesamiento de pagos
│   ├── commission.service.ts        # Cálculo de comisión 85/15
│   ├── stripe-integration.service.ts # Integración con Stripe
│   └── refunds.service.ts           # Lógica de reembolsos
│
├── repositories/
│   ├── payments.repository.ts       # Queries SQL de payments
│   └── payment-methods.repository.ts
│
├── validators/
│   └── payments.validator.ts        # Schemas Joi
│
├── types/
│   └── payments.types.ts            # Payment, PaymentMethod, etc.
│
└── index.ts                         # exports y setupPaymentsModule()
```

## 🚀 Cómo Usar Esta Arquitectura

### 1. Crear un Nuevo Endpoint

```typescript
// 1. Define el route (routes/payments.routes.ts)
import { Router } from 'express';
import { PaymentsController } from '../controllers/payments.controller';

export class PaymentsRoutes {
  private router = Router();
  private controller = new PaymentsController();

  constructor() {
    this.setupRoutes();
  }

  private setupRoutes() {
    this.router.post('/', this.controller.createPayment);
    this.router.get('/:id', this.controller.getPayment);
  }

  getRouter(): Router {
    return this.router;
  }
}

// 2. Implementa el controller (controllers/payments.controller.ts)
import { Request, Response, NextFunction } from 'express';
import { PaymentsService } from '../services/payments.service';
import { ResponseUtil } from '@utils/response.util';

export class PaymentsController {
  private service = new PaymentsService();

  createPayment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payment = await this.service.processPayment(req.body);
      res.status(201).json(ResponseUtil.success(payment));
    } catch (error) {
      next(error);
    }
  }
}

// 3. Implementa el service (services/payments.service.ts)
import { PaymentsRepository } from '../repositories/payments.repository';
import { CommissionService } from './commission.service';

export class PaymentsService {
  private paymentsRepo = new PaymentsRepository();
  private commissionService = new CommissionService();

  async processPayment(data: CreatePaymentDTO): Promise<Payment> {
    // Lógica de negocio aquí
    const commission = this.commissionService.calculate(data.amount);
    const paymentId = await this.paymentsRepo.create({
      ...data,
      commission
    });
    return this.paymentsRepo.findById(paymentId);
  }
}

// 4. Implementa el repository (repositories/payments.repository.ts)
import DatabaseConnection from '@database/connection';

export class PaymentsRepository {
  private pool = DatabaseConnection.getPool();

  async create(data: CreatePaymentDTO): Promise<number> {
    const [result] = await this.pool.execute(
      'INSERT INTO payments (...) VALUES (...)',
      [...]
    );
    return result.insertId;
  }
}

// 5. Registra el módulo (index.ts)
import { PaymentsRoutes } from './routes/payments.routes';

export function setupPaymentsModule(app: Express) {
  const routes = new PaymentsRoutes();
  app.use('/payments', routes.getRouter());
}
```

## 🎨 Convenciones de Código

### Nombres de Archivos
- Routes: `*.routes.ts`
- Controllers: `*.controller.ts`
- Services: `*.service.ts`
- Repositories: `*.repository.ts`
- Validators: `*.validator.ts`
- Types: `*.types.ts`

### Nombres de Clases
```typescript
// Singular, PascalCase, sufijo descriptivo
export class AuthService { }
export class UsersRepository { }
export class PaymentsController { }
```

### Nombres de Funciones
```typescript
// camelCase, verbos descriptivos
async createUser() { }
async findById() { }
async updateStatus() { }
```

### Constantes
```typescript
// UPPER_SNAKE_CASE
export const MAX_LOGIN_ATTEMPTS = 5;
export const DEFAULT_COMMISSION_RATE = 15.0;
```

## 📝 Estado Actual de Implementación

| Módulo | Estructura | Implementación | Estado |
|--------|-----------|----------------|--------|
| auth | ✅ | ⏳ | Pendiente migración |
| provider | ✅ | ❌ | Por implementar |
| client | ✅ | ❌ | Por implementar |
| appointments | ✅ | ❌ | Por implementar |
| payments | ✅ | ❌ | **CRÍTICO - Por implementar** |
| wallet | ✅ | ❌ | **CRÍTICO - Por implementar** |
| reviews | ✅ | ❌ | Por implementar |
| chat | ✅ | ❌ | Por implementar |
| notifications | ✅ | ❌ | Por implementar |
| subscriptions | ✅ | ⏳ | Pendiente migración |
| admin | ✅ | ❌ | Por implementar |

## 🔄 Próximos Pasos

1. **Migrar código existente** a la nueva estructura
2. **Implementar módulos críticos** (payments, wallet)
3. **Crear tests** para cada módulo
4. **Documentar APIs** con Swagger
5. **Optimizar** y refactorizar

## 📚 Referencias

- Ver `backend/orden-doc/MASTER_PLAN_BACKEND_RESTRUCTURING.md` para el plan completo
- Ver `backend/DATABASE_SCHEMA_COMPLETE.sql` para el schema de BD

---

**Última Actualización:** 9 de Octubre, 2025  
**Estado:** ✅ Estructura creada - Esperando implementación

