# 🚀 Guía de Implementación Stripe - AdomiApp

## 🎯 **Resumen Ejecutivo**

Esta guía te llevará paso a paso para implementar un sistema completo de suscripciones con Stripe en AdomiApp. El objetivo es permitir que los profesionales se suscriban a planes de pago y accedan a características premium según su nivel de suscripción.

## 📋 **Prerrequisitos**

- ✅ Backend Node.js funcionando
- ✅ Frontend Angular funcionando  
- ✅ Base de datos MySQL configurada
- ✅ Cuenta de Stripe (modo test)
- ✅ Conocimientos básicos de TypeScript y Angular

---

## 🏗️ **FASE 1: Configuración Base de Stripe**

### **Paso 1.1: Crear cuenta y obtener claves**

1. **Ve a** [Stripe Dashboard](https://dashboard.stripe.com/)
2. **Crea una cuenta** o inicia sesión
3. **Ve a** Developers → API Keys
4. **Copia las claves**:
   - Publishable key: `pk_test_...`
   - Secret key: `sk_test_...`

### **Paso 1.2: Instalar dependencias**

**Backend:**
```bash
cd backend
npm install stripe @stripe/stripe-js
npm install --save-dev @types/stripe
```

**Frontend:**
```bash
cd adomi-app
npm install @stripe/stripe-js
```

### **Paso 1.3: Configurar variables de entorno**

**Backend (.env):**
```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_51...
STRIPE_PUBLISHABLE_KEY=pk_test_51...
STRIPE_WEBHOOK_SECRET=whsec_...

# URLs
FRONTEND_URL=http://localhost:4200
WEBHOOK_URL=http://localhost:3000/webhooks/stripe
```

**Frontend (environment.ts):**
```typescript
export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:3000',
  stripePublishableKey: 'pk_test_51...'
};
```

---

## 🗄️ **FASE 2: Base de Datos**

### **Paso 2.1: Crear tablas de Stripe**

Ejecuta estos scripts SQL en tu base de datos:

```sql
-- 1. Tabla de planes
CREATE TABLE plans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    stripe_price_id VARCHAR(255) UNIQUE NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'clp',
    billing_period ENUM('month', 'year') NOT NULL,
    description TEXT NULL,
    features JSON NULL,
    max_services INT DEFAULT 5,
    max_bookings INT DEFAULT 50,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 2. Tabla de suscripciones
CREATE TABLE subscriptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNIQUE NOT NULL,
    plan_id INT NOT NULL,
    stripe_subscription_id VARCHAR(255) UNIQUE NOT NULL,
    stripe_customer_id VARCHAR(255) UNIQUE NOT NULL,
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

-- 3. Tabla de clientes Stripe
CREATE TABLE stripe_customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNIQUE NOT NULL,
    stripe_customer_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 4. Tabla de métodos de pago
CREATE TABLE payment_methods (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    stripe_payment_method_id VARCHAR(255) UNIQUE NOT NULL,
    type VARCHAR(50) NOT NULL,
    card_last4 VARCHAR(4) NULL,
    card_brand VARCHAR(50) NULL,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 5. Tabla de facturas
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

-- 6. Modificar tabla users
ALTER TABLE users ADD COLUMN active_plan_id INT NULL;
ALTER TABLE users ADD COLUMN stripe_customer_id VARCHAR(255) NULL;
ALTER TABLE users ADD COLUMN subscription_status ENUM('active', 'inactive', 'trial', 'past_due') DEFAULT 'inactive';
```

### **Paso 2.2: Insertar planes iniciales**

```sql
INSERT INTO plans (name, stripe_price_id, price, currency, billing_period, description, features, max_services, max_bookings) VALUES
('Básico', 'price_basico_mensual', 0.00, 'clp', 'month', 'Plan gratuito para empezar', '["Perfil básico", "Hasta 5 servicios", "Hasta 50 reservas/mes"]', 5, 50),
('Premium', 'price_premium_mensual', 9990.00, 'clp', 'month', 'Plan completo para profesionales', '["Perfil destacado", "Servicios ilimitados", "Reservas ilimitadas", "Analíticas avanzadas"]', 999, 9999),
('Fundador', 'price_fundador_mensual', 19990.00, 'clp', 'month', 'Plan premium con beneficios especiales', '["Perfil destacado", "Servicios ilimitados", "Reservas ilimitadas", "Analíticas avanzadas", "Soporte prioritario", "Herramientas de marketing"]', 999, 9999);
```

### **Paso 2.3: Insertar beneficios de fundadores**

```sql
-- Insertar algunos fundadores de ejemplo
INSERT INTO founder_benefits (user_id, benefits, discount_percentage, notes, assigned_by) VALUES
(1, '["Acceso premium gratuito", "Soporte prioritario", "Descuentos especiales", "Acceso a características beta"]', 100.00, 'Inversor inicial - $50,000 aportados', 1),
(2, '["Acceso premium gratuito", "Soporte prioritario"]', 50.00, 'Early adopter - Usuario #5', 1);
```

---

## 🔧 **FASE 3: Backend - Configuración de Stripe**

### **Paso 3.1: Crear configuración de Stripe**

**Archivo: `backend/src/lib/stripe.ts`**
```typescript
import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

export const STRIPE_CONFIG = {
  publishableKey: process.env.STRIPE_PUBLISHABLE_KEY!,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
  successUrl: `${process.env.FRONTEND_URL}/checkout/success`,
  cancelUrl: `${process.env.FRONTEND_URL}/checkout/cancel`,
};
```

### **Paso 3.2: Crear queries de planes**

**Archivo: `backend/src/queries/plans.ts`**
```typescript
import { pool } from '../lib/db';

export type PlanRow = {
  id: number;
  name: string;
  stripe_price_id: string;
  price: number;
  currency: string;
  billing_period: 'month' | 'year';
  description: string | null;
  features: string | null;
  max_services: number;
  max_bookings: number;
  is_active: boolean;
};

export async function getActivePlans(): Promise<PlanRow[]> {
  const [rows] = await pool.query(
    'SELECT * FROM plans WHERE is_active = TRUE ORDER BY price ASC'
  );
  return rows as PlanRow[];
}

export async function getPlanById(id: number): Promise<PlanRow | null> {
  const [rows] = await pool.query(
    'SELECT * FROM plans WHERE id = ? AND is_active = TRUE LIMIT 1',
    [id]
  );
  const arr = rows as any[];
  return arr.length ? (arr[0] as PlanRow) : null;
}

export async function getPlanByStripePriceId(stripePriceId: string): Promise<PlanRow | null> {
  const [rows] = await pool.query(
    'SELECT * FROM plans WHERE stripe_price_id = ? AND is_active = TRUE LIMIT 1',
    [stripePriceId]
  );
  const arr = rows as any[];
  return arr.length ? (arr[0] as PlanRow) : null;
}
```

### **Paso 3.3: Crear queries de suscripciones**

**Archivo: `backend/src/queries/subscriptions.ts`**
```typescript
import { pool } from '../lib/db';

export type SubscriptionRow = {
  id: number;
  user_id: number;
  plan_id: number;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  status: 'active' | 'canceled' | 'past_due' | 'unpaid' | 'trialing';
  current_period_start: Date;
  current_period_end: Date;
  trial_end: Date | null;
  cancel_at_period_end: boolean;
};

export async function createSubscription(
  userId: number,
  planId: number,
  stripeSubscriptionId: string,
  stripeCustomerId: string,
  status: string,
  currentPeriodStart: Date,
  currentPeriodEnd: Date
): Promise<number> {
  const [result] = await pool.execute(
    `INSERT INTO subscriptions 
     (user_id, plan_id, stripe_subscription_id, stripe_customer_id, status, current_period_start, current_period_end) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, planId, stripeSubscriptionId, stripeCustomerId, status, currentPeriodStart, currentPeriodEnd]
  );
  return (result as any).insertId;
}

export async function getSubscriptionByUserId(userId: number): Promise<SubscriptionRow | null> {
  const [rows] = await pool.query(
    'SELECT * FROM subscriptions WHERE user_id = ? LIMIT 1',
    [userId]
  );
  const arr = rows as any[];
  return arr.length ? (arr[0] as SubscriptionRow) : null;
}

export async function updateSubscriptionStatus(
  stripeSubscriptionId: string,
  status: string,
  currentPeriodEnd?: Date
): Promise<void> {
  if (currentPeriodEnd) {
    await pool.execute(
      'UPDATE subscriptions SET status = ?, current_period_end = ? WHERE stripe_subscription_id = ?',
      [status, currentPeriodEnd, stripeSubscriptionId]
    );
  } else {
    await pool.execute(
      'UPDATE subscriptions SET status = ? WHERE stripe_subscription_id = ?',
      [status, stripeSubscriptionId]
    );
  }
}
```

### **Paso 3.4: Crear endpoints de planes**

**Archivo: `backend/src/endpoints/plans.ts`**
```typescript
import { Router } from 'express';
import { getActivePlans, getPlanById } from '../queries/plans';

export function mountPlans(router: Router) {
  // GET /plans - Listar todos los planes activos
  router.get('/plans', async (req, res) => {
    try {
      const plans = await getActivePlans();
      res.json({ ok: true, plans });
    } catch (error: any) {
      console.error('[PLANS][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al obtener planes' });
    }
  });

  // GET /plans/:id - Obtener plan específico
  router.get('/plans/:id', async (req, res) => {
    try {
      const planId = parseInt(req.params.id);
      const plan = await getPlanById(planId);
      
      if (!plan) {
        return res.status(404).json({ ok: false, error: 'Plan no encontrado' });
      }
      
      res.json({ ok: true, plan });
    } catch (error: any) {
      console.error('[PLANS][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al obtener plan' });
    }
  });
}
```

### **Paso 3.5: Crear endpoints de checkout**

**Archivo: `backend/src/endpoints/checkout.ts`**
```typescript
import { Router } from 'express';
import { stripe, STRIPE_CONFIG } from '../lib/stripe';
import { getPlanByStripePriceId } from '../queries/plans';
import { getUserByEmail } from '../queries/users';

export function mountCheckout(router: Router) {
  // POST /create-checkout-session - Crear sesión de checkout
  router.post('/create-checkout-session', async (req, res) => {
    try {
      const { priceId, userEmail } = req.body;

      if (!priceId || !userEmail) {
        return res.status(400).json({ ok: false, error: 'priceId y userEmail son requeridos' });
      }

      // Verificar que el plan existe
      const plan = await getPlanByStripePriceId(priceId);
      if (!plan) {
        return res.status(404).json({ ok: false, error: 'Plan no encontrado' });
      }

      // Obtener o crear cliente en Stripe
      const user = await getUserByEmail(userEmail);
      if (!user) {
        return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
      }

      let customer;
      if (user.stripe_customer_id) {
        customer = await stripe.customers.retrieve(user.stripe_customer_id);
      } else {
        customer = await stripe.customers.create({
          email: user.email,
          name: user.name,
          metadata: { userId: user.id.toString() }
        });
      }

      // Crear sesión de checkout
      const session = await stripe.checkout.sessions.create({
        customer: customer.id,
        payment_method_types: ['card'],
        line_items: [{
          price: priceId,
          quantity: 1,
        }],
        mode: 'subscription',
        success_url: `${STRIPE_CONFIG.successUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: STRIPE_CONFIG.cancelUrl,
        metadata: {
          userId: user.id.toString(),
          planId: plan.id.toString()
        }
      });

      res.json({ ok: true, sessionId: session.id, url: session.url });
    } catch (error: any) {
      console.error('[CHECKOUT][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al crear sesión de checkout' });
    }
  });
}
```

### **Paso 3.6: Crear webhooks de Stripe**

**Archivo: `backend/src/endpoints/webhooks.ts`**
```typescript
import { Router } from 'express';
import { stripe, STRIPE_CONFIG } from '../lib/stripe';
import { createSubscription, updateSubscriptionStatus } from '../queries/subscriptions';
import { getUserByEmail } from '../queries/users';

export function mountWebhooks(router: Router) {
  // POST /webhooks/stripe - Webhook de Stripe
  router.post('/webhooks/stripe', async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig!, STRIPE_CONFIG.webhookSecret);
    } catch (err: any) {
      console.error('[WEBHOOK][ERROR]', err.message);
      return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await handleCheckoutSessionCompleted(event.data.object);
          break;
        case 'customer.subscription.updated':
          await handleSubscriptionUpdated(event.data.object);
          break;
        case 'customer.subscription.deleted':
          await handleSubscriptionDeleted(event.data.object);
          break;
        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (error: any) {
      console.error('[WEBHOOK][ERROR]', error);
      res.status(500).json({ error: 'Webhook handler failed' });
    }
  });
}

async function handleCheckoutSessionCompleted(session: any) {
  console.log('[WEBHOOK] Checkout session completed:', session.id);
  
  // Aquí implementarías la lógica para activar la suscripción
  // Por ahora solo logueamos
}

async function handleSubscriptionUpdated(subscription: any) {
  console.log('[WEBHOOK] Subscription updated:', subscription.id);
  
  // Aquí implementarías la lógica para actualizar el estado
}

async function handleSubscriptionDeleted(subscription: any) {
  console.log('[WEBHOOK] Subscription deleted:', subscription.id);
  
  // Aquí implementarías la lógica para cancelar la suscripción
}
```

### **Paso 3.7: Actualizar index.ts**

**Archivo: `backend/src/index.ts`**
```typescript
// ... existing imports
import { mountPlans } from './endpoints/plans';
import { mountCheckout } from './endpoints/checkout';
import { mountWebhooks } from './endpoints/webhooks';

// ... existing code

const api = createRouter();
mountHealth(api);
mountAuth(api);
mountDb(api);
mountPlans(api);        // Agregar
mountCheckout(api);     // Agregar
mountWebhooks(api);     // Agregar
mountSwagger(app);
app.use('/', api);
```

---

## 🎨 **FASE 4: Frontend - Página de Planes**

### **Paso 4.1: Crear servicio de planes**

**Archivo: `adomi-app/src/app/services/plans.service.ts`**
```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Plan {
  id: number;
  name: string;
  stripe_price_id: string;
  price: number;
  currency: string;
  billing_period: 'month' | 'year';
  description: string | null;
  features: string[] | null;
  max_services: number;
  max_bookings: number;
}

@Injectable({ providedIn: 'root' })
export class PlansService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiBaseUrl;

  getPlans(): Observable<{ ok: boolean; plans: Plan[] }> {
    return this.http.get<{ ok: boolean; plans: Plan[] }>(`${this.baseUrl}/plans`);
  }

  getPlan(id: number): Observable<{ ok: boolean; plan: Plan }> {
    return this.http.get<{ ok: boolean; plan: Plan }>(`${this.baseUrl}/plans/${id}`);
  }
}
```

### **Paso 4.2: Crear servicio de Stripe**

**Archivo: `adomi-app/src/app/services/stripe.service.ts`**
```typescript
import { Injectable } from '@angular/core';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class StripeService {
  private stripe: Stripe | null = null;

  async initialize(): Promise<void> {
    this.stripe = await loadStripe(environment.stripePublishableKey);
  }

  async createCheckoutSession(priceId: string, userEmail: string): Promise<string> {
    if (!this.stripe) {
      throw new Error('Stripe not initialized');
    }

    const response = await fetch(`${environment.apiBaseUrl}/create-checkout-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ priceId, userEmail }),
    });

    const { sessionId, url } = await response.json();
    
    if (!response.ok) {
      throw new Error('Failed to create checkout session');
    }

    return url;
  }

  async redirectToCheckout(priceId: string, userEmail: string): Promise<void> {
    const url = await this.createCheckoutSession(priceId, userEmail);
    window.location.href = url;
  }
}
```

### **Paso 4.3: Crear componente de planes**

**Archivo: `adomi-app/src/app/plans/plans.component.ts`**
```typescript
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PlansService, Plan } from '../services/plans.service';
import { StripeService } from '../services/stripe.service';
import { SessionService } from '../auth/services/session.service';

@Component({
  selector: 'app-plans',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './plans.component.html',
  styleUrls: ['./plans.component.scss']
})
export class PlansComponent implements OnInit {
  plans: Plan[] = [];
  loading = true;
  selectedPlan: Plan | null = null;

  private plansService = inject(PlansService);
  private stripeService = inject(StripeService);
  private sessionService = inject(SessionService);

  async ngOnInit() {
    await this.stripeService.initialize();
    this.loadPlans();
  }

  loadPlans() {
    this.plansService.getPlans().subscribe({
      next: (response) => {
        this.plans = response.plans;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading plans:', error);
        this.loading = false;
      }
    });
  }

  async selectPlan(plan: Plan) {
    this.selectedPlan = plan;
    
    const user = this.sessionService.getCurrentUser();
    if (!user) {
      // Redirigir al login
      return;
    }

    try {
      await this.stripeService.redirectToCheckout(plan.stripe_price_id, user.email);
    } catch (error) {
      console.error('Error creating checkout session:', error);
    }
  }

  formatPrice(price: number): string {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP'
    }).format(price);
  }
}
```

### **Paso 4.4: Crear template de planes**

**Archivo: `adomi-app/src/app/plans/plans.component.html`**
```html
<div class="plans-container">
  <div class="plans-header">
    <h1>Elige tu plan</h1>
    <p>Selecciona el plan que mejor se adapte a tu negocio</p>
  </div>

  <div class="plans-grid" *ngIf="!loading">
    <div 
      *ngFor="let plan of plans" 
      class="plan-card"
      [class.featured]="plan.name === 'Premium'"
    >
      <div class="plan-header">
        <h3>{{ plan.name }}</h3>
        <div class="plan-price">
          <span class="price">{{ formatPrice(plan.price) }}</span>
          <span class="period">/{{ plan.billing_period === 'month' ? 'mes' : 'año' }}</span>
        </div>
      </div>

      <div class="plan-features">
        <ul>
          <li *ngFor="let feature of plan.features">
            {{ feature }}
          </li>
        </ul>
      </div>

      <button 
        class="btn btn-primary"
        (click)="selectPlan(plan)"
        [disabled]="plan.price === 0"
      >
        {{ plan.price === 0 ? 'Plan Actual' : 'Elegir Plan' }}
      </button>
    </div>
  </div>

  <div *ngIf="loading" class="loading">
    Cargando planes...
  </div>
</div>
```

### **Paso 4.5: Crear estilos de planes**

**Archivo: `adomi-app/src/app/plans/plans.component.scss`**
```scss
.plans-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 40px 20px;
}

.plans-header {
  text-align: center;
  margin-bottom: 40px;
  
  h1 {
    font-size: 2.5rem;
    margin-bottom: 16px;
    color: var(--text-primary);
  }
  
  p {
    font-size: 1.2rem;
    color: var(--text-secondary);
  }
}

.plans-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 24px;
  margin-bottom: 40px;
}

.plan-card {
  background: var(--color-bg);
  border: 2px solid var(--border-color);
  border-radius: 16px;
  padding: 32px;
  text-align: center;
  transition: all 0.3s ease;
  
  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
  }
  
  &.featured {
    border-color: var(--color-primary);
    position: relative;
    
    &::before {
      content: 'Más Popular';
      position: absolute;
      top: -12px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--color-primary);
      color: white;
      padding: 6px 16px;
      border-radius: 20px;
      font-size: 0.9rem;
      font-weight: 600;
    }
  }
}

.plan-header {
  margin-bottom: 24px;
  
  h3 {
    font-size: 1.5rem;
    margin-bottom: 8px;
    color: var(--text-primary);
  }
}

.plan-price {
  .price {
    font-size: 2.5rem;
    font-weight: 700;
    color: var(--color-primary);
  }
  
  .period {
    font-size: 1rem;
    color: var(--text-secondary);
  }
}

.plan-features {
  margin-bottom: 32px;
  
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
    
    li {
      padding: 8px 0;
      color: var(--text-secondary);
      
      &::before {
        content: '✓';
        color: var(--color-primary);
        font-weight: bold;
        margin-right: 8px;
      }
    }
  }
}

.btn {
  width: 100%;
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  
  &.btn-primary {
    background: var(--color-primary);
    color: white;
    
    &:hover:not(:disabled) {
      background: var(--color-primary-dark);
    }
    
    &:disabled {
      background: var(--text-disabled);
      cursor: not-allowed;
    }
  }
}

.loading {
  text-align: center;
  font-size: 1.2rem;
  color: var(--text-secondary);
}
```

### **Paso 4.6: Agregar rutas**

**Archivo: `adomi-app/src/app/app.routes.ts`**
```typescript
// ... existing imports
import { PlansComponent } from './plans/plans.component';

export const routes: Routes = [
  // ... existing routes
  { path: 'plans', component: PlansComponent },
  // ... rest of routes
];
```

---

## 🧪 **FASE 5: Testing y Validación**

### **Paso 5.1: Probar el backend**

```bash
# Iniciar backend
cd backend
npm run dev

# Probar endpoint de planes
curl http://localhost:3000/plans
```

### **Paso 5.2: Probar el frontend**

```bash
# Iniciar frontend
cd adomi-app
ng serve

# Navegar a http://localhost:4200/plans
```

### **Paso 5.3: Configurar webhooks locales**

```bash
# Instalar Stripe CLI
# Luego ejecutar:
stripe listen --forward-to localhost:3000/webhooks/stripe
```

---

## 🚀 **FASE 6: Deploy y Producción**

### **Paso 6.1: Configurar productos en Stripe Dashboard**

1. **Ve a** Products en Stripe Dashboard
2. **Crea los productos**:
   - Plan Básico (Gratuito)
   - Plan Premium ($9.990/mes)
   - Plan Fundador ($19.990/mes)
3. **Copia los Price IDs** y actualiza la base de datos

### **Paso 6.2: Configurar webhooks en producción**

1. **Ve a** Webhooks en Stripe Dashboard
2. **Agrega endpoint**: `https://tu-dominio.com/webhooks/stripe`
3. **Selecciona eventos**:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. **Copia el webhook secret** y actualiza las variables de entorno

---

## 📊 **Métricas y Monitoreo**

### **Métricas clave a implementar:**
- Tasa de conversión de planes
- Tiempo promedio de checkout
- Tasa de abandono en checkout
- Ingresos mensuales recurrentes (MRR)
- Churn rate

### **Herramientas recomendadas:**
- Stripe Dashboard para métricas de pagos
- Google Analytics para comportamiento de usuarios
- Sentry para monitoreo de errores

---

## 🎯 **Próximos Pasos**

1. **Implementar sistema de permisos** en el dashboard
2. **Crear página de facturación** para usuarios
3. **Implementar cancelación de suscripciones**
4. **Agregar métodos de pago** adicionales
5. **Crear sistema de notificaciones** por email

---

## 🏆 **SISTEMA DE FUNDADORES - Implementación Adicional**

### **¿Qué es el Sistema de Fundadores?**

El sistema de fundadores permite asignar a usuarios especiales (inversores, early adopters, partners) acceso premium **GRATUITO** de por vida con beneficios exclusivos.

### **Características del Sistema:**

#### **1. Beneficios de Fundadores**
- ✅ **Acceso premium gratuito** de por vida
- ✅ **Descuentos especiales** en servicios adicionales
- ✅ **Soporte prioritario** 24/7
- ✅ **Acceso a características beta**
- ✅ **Badge especial** en el perfil
- ✅ **Eventos exclusivos**

#### **2. Gestión Administrativa**
- ✅ **Asignación manual** por admin
- ✅ **Revocación** cuando sea necesario
- ✅ **Audit log** de cambios
- ✅ **Beneficios personalizables** por fundador

### **Tablas Adicionales Necesarias:**

```sql
-- Modificar tabla users para fundadores
ALTER TABLE users ADD COLUMN is_founder BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN founder_discount_percentage DECIMAL(5,2) DEFAULT 0.00;
ALTER TABLE users ADD COLUMN founder_benefits JSON NULL;
ALTER TABLE users ADD COLUMN founder_assigned_by INT NULL;
ALTER TABLE users ADD COLUMN founder_assigned_at TIMESTAMP NULL;
ALTER TABLE users ADD COLUMN subscription_status ENUM('active', 'inactive', 'trial', 'past_due', 'founder') DEFAULT 'inactive';

-- Tabla de beneficios de fundadores
CREATE TABLE founder_benefits (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNIQUE NOT NULL,
    benefits JSON NOT NULL,
    discount_percentage DECIMAL(5,2) DEFAULT 0.00,
    expires_at TIMESTAMP NULL,
    notes TEXT NULL,
    assigned_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by) REFERENCES users(id)
);
```

### **Endpoints Adicionales:**

```typescript
// Backend - Endpoints de fundadores
GET /founders                    // Listar fundadores (admin)
POST /founders/:id/assign        // Asignar status de fundador
DELETE /founders/:id/revoke      // Revocar status de fundador
GET /founders/check/:id          // Verificar si es fundador
```

### **Flujo de Asignación:**

1. **Admin identifica candidato** (inversor, early adopter, partner)
2. **Verifica criterios** de elegibilidad
3. **Asigna beneficios** personalizados
4. **Notifica al usuario** sobre su nuevo status
5. **Usuario recibe acceso** premium gratuito

### **Criterios Típicos de Selección:**

- **Inversores**: Capital aportado > $X
- **Early Adopters**: Registro en primeros 100 usuarios
- **Partners**: Acuerdos estratégicos firmados
- **Contribuidores**: Código, diseño, marketing significativo

### **Implementación en el Código:**

El sistema de fundadores se integra perfectamente con Stripe:

1. **Verificación de permisos**: Los fundadores tienen acceso a todo sin pagar
2. **Middleware actualizado**: Verifica primero si es fundador, luego suscripción
3. **Frontend adaptado**: Muestra badge de fundador y beneficios especiales
4. **Panel administrativo**: Para gestionar fundadores

### **Ventajas del Sistema:**

- 🎯 **Retención de usuarios valiosos**
- 💰 **Reducción de churn** en early adopters
- 🤝 **Fortalecimiento de relaciones** con partners
- 📈 **Creación de comunidad** de usuarios premium
- 🏆 **Diferenciación** de la competencia

---

**¡Con esta guía tienes todo lo necesario para implementar Stripe + Sistema de Fundadores de forma completa y profesional en AdomiApp!** 🎉
