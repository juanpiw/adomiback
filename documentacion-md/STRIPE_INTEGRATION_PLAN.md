# 🚀 Plan de Integración Stripe - AdomiApp

## 📋 Análisis Exhaustivo del Modelo de Negocio

### 🎯 **Objetivo Principal**
Desarrollar un sistema de suscripciones híbrido que permita a los profesionales acceder a la plataforma mediante planes de pago gestionados por Stripe, con un modelo SaaS + Add-ons.

### 💰 **Modelo de Negocio Identificado**

#### **1. Suscripción SaaS (Base)**
- **Plan Básico Gratuito**: Acceso limitado a la plataforma
- **Plan Premium**: Acceso completo con características avanzadas ($9.990/mes)
- **Plan Fundador**: Acceso premium con beneficios especiales ($19.990/mes)

#### **2. Sistema de Fundadores (Especial)**
- **Fundadores**: Acceso premium **GRATUITO** de por vida
- **Beneficios exclusivos**: Descuentos, soporte prioritario, características beta
- **Criterios de selección**: Inversores, early adopters, partners estratégicos
- **Gestión manual**: Admin puede asignar/quitar status de fundador

#### **3. Servicios Premium (Add-ons)**
- Destacar perfil en búsquedas
- Analíticas avanzadas
- Herramientas de marketing
- Soporte prioritario

### 🗄️ **Análisis de la Base de Datos Actual**

#### **✅ Tablas Existentes (Bien estructuradas)**
- `users` - Usuarios del sistema
- `password_reset_tokens` - Recuperación de contraseña
- `service_categories` - Categorías de servicios
- `services` - Servicios disponibles
- `provider_services` - Servicios ofrecidos por profesionales

#### **❌ Tablas Faltantes (Críticas para Stripe)**
- `plans` - Planes de suscripción
- `subscriptions` - Suscripciones activas de usuarios
- `stripe_customers` - Clientes de Stripe
- `payment_methods` - Métodos de pago guardados
- `invoices` - Facturación y pagos

---

## 🏗️ **Arquitectura de Implementación**

### **Backend (Node.js + Express)**
```
src/
├── lib/
│   ├── stripe.ts              # Configuración de Stripe
│   ├── webhooks.ts            # Manejo de webhooks
│   └── permissions.ts         # Sistema de permisos
├── endpoints/
│   ├── plans.ts              # Gestión de planes
│   ├── subscriptions.ts      # Gestión de suscripciones
│   ├── payments.ts           # Procesamiento de pagos
│   └── webhooks.ts           # Endpoints de webhooks
├── queries/
│   ├── plans.ts              # Queries de planes
│   ├── subscriptions.ts      # Queries de suscripciones
│   └── payments.ts           # Queries de pagos
└── middleware/
    └── auth.ts               # Middleware de autenticación
```

### **Frontend (Angular)**
```
src/app/
├── plans/                    # Página de planes
├── checkout/                 # Proceso de checkout
├── dashboard/                # Dashboard con permisos
├── billing/                  # Gestión de facturación
└── shared/
    ├── stripe-elements/      # Componentes de Stripe
    └── permission-guard/     # Guards de permisos
```

---

## 📊 **Esquema de Base de Datos Propuesto**

### **1. Tabla `plans` (Planes de Suscripción)**
```sql
CREATE TABLE plans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,                      -- "Básico", "Premium", "Fundador"
    stripe_price_id VARCHAR(255) UNIQUE NOT NULL,     -- price_1L2X3Y...
    price DECIMAL(10, 2) NOT NULL,                    -- 9990.00
    currency VARCHAR(10) NOT NULL DEFAULT 'clp',      -- "clp"
    billing_period ENUM('month', 'year') NOT NULL,    -- "month" o "year"
    description TEXT NULL,
    features JSON NULL,                               -- ["Perfil destacado", "Analíticas"]
    max_services INT DEFAULT 5,                       -- Límite de servicios
    max_bookings INT DEFAULT 50,                      -- Límite de reservas
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### **2. Tabla `subscriptions` (Suscripciones)**
```sql
CREATE TABLE subscriptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNIQUE NOT NULL,                      -- FK a users
    plan_id INT NOT NULL,                             -- FK a plans
    stripe_subscription_id VARCHAR(255) UNIQUE NOT NULL, -- sub_1L2X3Y...
    stripe_customer_id VARCHAR(255) UNIQUE NOT NULL,  -- cus_1L2X3Y...
    status ENUM('active', 'canceled', 'past_due', 'unpaid', 'trialing') NOT NULL,
    current_period_start TIMESTAMP NOT NULL,
    current_period_end TIMESTAMP NOT NULL,
    trial_end TIMESTAMP NULL,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES plans(id)
);
```

### **3. Tabla `stripe_customers` (Clientes Stripe)**
```sql
CREATE TABLE stripe_customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNIQUE NOT NULL,
    stripe_customer_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### **4. Tabla `payment_methods` (Métodos de Pago)**
```sql
CREATE TABLE payment_methods (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    stripe_payment_method_id VARCHAR(255) UNIQUE NOT NULL,
    type VARCHAR(50) NOT NULL,                        -- "card", "bank_account"
    card_last4 VARCHAR(4) NULL,
    card_brand VARCHAR(50) NULL,                      -- "visa", "mastercard"
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### **5. Tabla `invoices` (Facturación)**
```sql
CREATE TABLE invoices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    subscription_id INT NOT NULL,
    stripe_invoice_id VARCHAR(255) UNIQUE NOT NULL,
    amount_paid DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    status ENUM('draft', 'open', 'paid', 'void', 'uncollectible') NOT NULL,
    invoice_pdf_url VARCHAR(500) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id)
);
```

### **6. Modificación a la tabla `users`**
```sql
ALTER TABLE users ADD COLUMN active_plan_id INT NULL;
ALTER TABLE users ADD COLUMN stripe_customer_id VARCHAR(255) NULL;
ALTER TABLE users ADD COLUMN subscription_status ENUM('active', 'inactive', 'trial', 'past_due', 'founder') DEFAULT 'inactive';
ALTER TABLE users ADD COLUMN is_founder BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN founder_discount_percentage DECIMAL(5,2) DEFAULT 0.00;
ALTER TABLE users ADD COLUMN founder_benefits JSON NULL;
```

### **7. Tabla `founder_benefits` (Beneficios de Fundadores)**
```sql
CREATE TABLE founder_benefits (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNIQUE NOT NULL,
    benefits JSON NOT NULL,                    -- ["Acceso premium gratuito", "Soporte prioritario", "Descuentos especiales"]
    discount_percentage DECIMAL(5,2) DEFAULT 0.00,
    expires_at TIMESTAMP NULL,                 -- NULL = permanente
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### **8. Tabla `revenue_tracking` (Seguimiento de Ingresos)**
```sql
CREATE TABLE revenue_tracking (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,                      -- Usuario que pagó
    subscription_id INT NULL,                  -- FK a subscriptions (si es suscripción)
    invoice_id INT NULL,                       -- FK a invoices
    transaction_type ENUM('subscription', 'one_time', 'refund', 'chargeback') NOT NULL,
    gross_amount DECIMAL(10, 2) NOT NULL,      -- Monto total cobrado
    stripe_fee DECIMAL(10, 2) NOT NULL,        -- Comisión de Stripe (2.9% + $0.30)
    platform_fee DECIMAL(10, 2) NOT NULL,      -- Nuestra comisión
    net_amount DECIMAL(10, 2) NOT NULL,        -- Monto neto que recibimos
    currency VARCHAR(10) NOT NULL DEFAULT 'clp',
    stripe_transaction_id VARCHAR(255) NULL,   -- ID de transacción en Stripe
    status ENUM('pending', 'completed', 'failed', 'refunded') DEFAULT 'pending',
    processed_at TIMESTAMP NULL,               -- Cuando se procesó el pago
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL
);
```

### **9. Tabla `platform_settings` (Configuración de la Plataforma)**
```sql
CREATE TABLE platform_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT NOT NULL,
    description TEXT NULL,
    updated_by INT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);
```

---

## 🔄 **Flujo Completo de Implementación**

### **Fase 1: Configuración Base (Backend)**
1. **Instalación de dependencias**
2. **Configuración de Stripe**
3. **Creación de tablas en base de datos**
4. **Endpoints básicos de planes**

### **Fase 2: Integración Stripe (Backend)**
1. **Configuración de productos en Stripe Dashboard**
2. **Implementación de Checkout Sessions**
3. **Sistema de webhooks**
4. **Gestión de suscripciones**

### **Fase 3: Frontend de Planes (Angular)**
1. **Página de selección de planes**
2. **Integración con Stripe Elements**
3. **Proceso de checkout**
4. **Páginas de éxito/error**

### **Fase 4: Sistema de Permisos (Full-stack)**
1. **Middleware de permisos en backend**
2. **Guards de permisos en frontend**
3. **Dashboard con características según plan**
4. **Gestión de facturación**

---

## 🛠️ **Implementación Paso a Paso**

### **Paso 1: Configuración del Backend**

#### **1.1 Instalación de dependencias**
```bash
cd backend
npm install stripe @stripe/stripe-js
npm install --save-dev @types/stripe
```

#### **1.2 Variables de entorno**
```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# URLs
FRONTEND_URL=http://localhost:4200
WEBHOOK_URL=http://localhost:3000/webhooks/stripe
```

#### **1.3 Configuración de Stripe**
```typescript
// src/lib/stripe.ts
import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

export const STRIPE_CONFIG = {
  publishableKey: process.env.STRIPE_PUBLISHABLE_KEY!,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
};
```

### **Paso 2: Creación de Endpoints**

#### **2.1 Endpoint de planes**
```typescript
// src/endpoints/plans.ts
export function mountPlans(router: Router) {
  router.get('/plans', async (req, res) => {
    // Obtener planes activos
  });
  
  router.get('/plans/:id', async (req, res) => {
    // Obtener plan específico
  });
}
```

#### **2.2 Endpoint de checkout**
```typescript
// src/endpoints/checkout.ts
export function mountCheckout(router: Router) {
  router.post('/create-checkout-session', async (req, res) => {
    // Crear sesión de checkout
  });
  
  router.post('/create-customer-portal-session', async (req, res) => {
    // Portal del cliente
  });
}
```

#### **2.3 Webhooks de Stripe**
```typescript
// src/endpoints/webhooks.ts
export function mountWebhooks(router: Router) {
  router.post('/webhooks/stripe', async (req, res) => {
    // Manejar eventos de Stripe
  });
}
```

### **Paso 3: Frontend Angular**

#### **3.1 Instalación de Stripe.js**
```bash
cd adomi-app
npm install @stripe/stripe-js
```

#### **3.2 Servicio de Stripe**
```typescript
// src/app/services/stripe.service.ts
import { loadStripe, Stripe } from '@stripe/stripe-js';

@Injectable({ providedIn: 'root' })
export class StripeService {
  private stripe: Stripe | null = null;
  
  async initialize() {
    this.stripe = await loadStripe(environment.stripePublishableKey);
  }
  
  async createCheckoutSession(priceId: string) {
    // Crear sesión de checkout
  }
}
```

#### **3.3 Componente de planes**
```typescript
// src/app/plans/plans.component.ts
@Component({
  selector: 'app-plans',
  templateUrl: './plans.component.html'
})
export class PlansComponent {
  plans: Plan[] = [];
  
  async selectPlan(plan: Plan) {
    // Redirigir a checkout
  }
}
```

---

## 🔐 **Sistema de Permisos**

### **Backend - Middleware de permisos**
```typescript
// src/middleware/permissions.ts
export function requirePlan(requiredPlan: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = await getUserWithSubscription(req.user.id);
    
    if (!user.subscription || user.subscription.status !== 'active') {
      return res.status(403).json({ error: 'Subscription required' });
    }
    
    if (!hasPlanAccess(user.subscription.plan.name, requiredPlan)) {
      return res.status(403).json({ error: 'Plan upgrade required' });
    }
    
    next();
  };
}
```

### **Frontend - Guards de permisos**
```typescript
// src/app/guards/plan.guard.ts
@Injectable({ providedIn: 'root' })
export class PlanGuard implements CanActivate {
  canActivate(route: ActivatedRouteSnapshot): boolean {
    const requiredPlan = route.data['requiredPlan'];
    const userPlan = this.authService.getCurrentUserPlan();
    
    return this.hasPlanAccess(userPlan, requiredPlan);
  }
}
```

---

## 📱 **Páginas del Frontend**

### **1. Página de Planes (`/plans`)**
- Comparación de planes
- Características incluidas
- Botones de selección
- Testimonios y casos de uso

### **2. Página de Checkout (`/checkout`)**
- Formulario de pago con Stripe Elements
- Resumen del plan seleccionado
- Términos y condiciones
- Procesamiento seguro

### **3. Página de Éxito (`/checkout/success`)**
- Confirmación de pago
- Bienvenida al plan
- Próximos pasos
- Acceso al dashboard

### **4. Dashboard con Permisos (`/dash`)**
- Características según el plan
- Límites visibles
- Opciones de upgrade
- Gestión de facturación

---

## 🧪 **Testing y Validación**

### **Backend Testing**
- Unit tests para endpoints
- Integration tests para webhooks
- Mock de Stripe para desarrollo

### **Frontend Testing**
- Component tests para planes
- E2E tests para checkout
- Tests de permisos

---

## 🚀 **Roadmap de Implementación**

### **Sprint 1 (Semana 1)**
- [ ] Configuración base de Stripe
- [ ] Creación de tablas en BD
- [ ] Endpoints básicos de planes
- [ ] Configuración de productos en Stripe

### **Sprint 2 (Semana 2)**
- [ ] Implementación de checkout
- [ ] Sistema de webhooks
- [ ] Página de planes en frontend
- [ ] Integración con Stripe Elements

### **Sprint 3 (Semana 3)**
- [ ] Sistema de permisos
- [ ] Dashboard con características por plan
- [ ] Gestión de facturación
- [ ] Testing completo

### **Sprint 4 (Semana 4)**
- [ ] Optimizaciones de rendimiento
- [ ] Documentación completa
- [ ] Deploy a producción
- [ ] Monitoreo y alertas

---

## 📊 **Métricas de Éxito**

### **Técnicas**
- Tiempo de respuesta < 200ms
- Uptime > 99.9%
- Tasa de error < 0.1%

### **Negocio**
- Conversión de registro a pago > 15%
- Churn rate < 5% mensual
- Tiempo promedio de checkout < 2 minutos

---

## 🔧 **Herramientas y Recursos**

### **Desarrollo**
- [Stripe Dashboard](https://dashboard.stripe.com/)
- [Stripe CLI](https://stripe.com/docs/stripe-cli)
- [Stripe Webhooks Testing](https://stripe.com/docs/webhooks/test)

### **Documentación**
- [Stripe Node.js SDK](https://stripe.com/docs/api?lang=node)
- [Stripe Elements](https://stripe.com/docs/stripe-js)
- [Stripe Webhooks](https://stripe.com/docs/webhooks)

---

**¡Este plan te dará una base sólida para implementar un sistema de suscripciones robusto y escalable con Stripe!** 🎉
