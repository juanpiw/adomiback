# 🚀 Plan de Implementación - AdomiApp + Stripe + Fundadores

## ✅ **Estado Actual**
- [x] **Base de datos configurada** - Todas las tablas creadas
- [x] **Backend funcionando** - Node.js + Express + TypeScript
- [x] **Frontend funcionando** - Angular 20 con SSR
- [x] **Autenticación completa** - Registro, login, recuperación de contraseña

## 🎯 **Próximos Pasos de Implementación**

### **FASE 1: Configuración de Stripe (Backend)**

#### **Paso 1.1: Instalar dependencias de Stripe**
```bash
cd backend
npm install stripe @stripe/stripe-js
npm install --save-dev @types/stripe
```

#### **Paso 1.2: Configurar variables de entorno**
Agregar al archivo `.env` del backend:
```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# URLs
FRONTEND_URL=http://localhost:4200
WEBHOOK_URL=http://localhost:3000/webhooks/stripe
```

#### **Paso 1.3: Crear configuración de Stripe**
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

### **FASE 2: Queries de Base de Datos**

#### **Paso 2.1: Crear queries de planes**
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

#### **Paso 2.2: Crear queries de suscripciones**
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

#### **Paso 2.3: Crear queries de fundadores**
**Archivo: `backend/src/queries/founders.ts`**
```typescript
import { pool } from '../lib/db';

export type FounderRow = {
  id: number;
  user_id: number;
  benefits: string;
  discount_percentage: number;
  expires_at: Date | null;
  notes: string | null;
  assigned_by: number;
  created_at: Date;
};

export type UserWithFounderStatus = {
  id: number;
  email: string;
  name: string | null;
  role: 'client' | 'provider';
  is_founder: boolean;
  founder_discount_percentage: number;
  founder_benefits: string | null;
  subscription_status: string;
};

export async function getFounders(): Promise<UserWithFounderStatus[]> {
  const [rows] = await pool.query(`
    SELECT u.id, u.email, u.name, u.role, u.is_founder, 
           u.founder_discount_percentage, u.founder_benefits, u.subscription_status
    FROM users u 
    WHERE u.is_founder = TRUE
    ORDER BY u.founder_assigned_at DESC
  `);
  return rows as UserWithFounderStatus[];
}

export async function isUserFounder(userId: number): Promise<boolean> {
  const [rows] = await pool.query(
    'SELECT is_founder FROM users WHERE id = ? LIMIT 1',
    [userId]
  );
  const arr = rows as any[];
  return arr.length > 0 && arr[0].is_founder === true;
}

export async function getFounderBenefits(userId: number): Promise<FounderRow | null> {
  const [rows] = await pool.query(`
    SELECT * FROM founder_benefits 
    WHERE user_id = ? AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY created_at DESC LIMIT 1
  `, [userId]);
  const arr = rows as any[];
  return arr.length ? (arr[0] as FounderRow) : null;
}
```

### **FASE 3: Endpoints del Backend**

#### **Paso 3.1: Crear endpoint de planes**
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

#### **Paso 3.2: Crear endpoint de checkout**
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

#### **Paso 3.3: Crear endpoint de fundadores**
**Archivo: `backend/src/endpoints/founders.ts`**
```typescript
import { Router } from 'express';
import { getFounders, isUserFounder, getFounderBenefits } from '../queries/founders';

export function mountFounders(router: Router) {
  // GET /founders - Listar todos los fundadores (solo admin)
  router.get('/founders', async (req, res) => {
    try {
      // TODO: Verificar que el usuario es admin
      const founders = await getFounders();
      res.json({ ok: true, founders });
    } catch (error: any) {
      console.error('[FOUNDERS][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al obtener fundadores' });
    }
  });

  // GET /founders/check/:id - Verificar si usuario es fundador
  router.get('/founders/check/:id', async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const isFounder = await isUserFounder(userId);
      const benefits = isFounder ? await getFounderBenefits(userId) : null;
      
      res.json({ 
        ok: true, 
        isFounder, 
        benefits: benefits ? {
          benefits: JSON.parse(benefits.benefits),
          discountPercentage: benefits.discount_percentage,
          expiresAt: benefits.expires_at
        } : null
      });
    } catch (error: any) {
      console.error('[FOUNDERS][CHECK][ERROR]', error);
      res.status(500).json({ ok: false, error: 'Error al verificar status de fundador' });
    }
  });
}
```

#### **Paso 3.4: Actualizar index.ts**
**Archivo: `backend/src/index.ts`**
```typescript
// ... existing imports
import { mountPlans } from './endpoints/plans';
import { mountCheckout } from './endpoints/checkout';
import { mountFounders } from './endpoints/founders';

// ... existing code

const api = createRouter();
mountHealth(api);
mountAuth(api);
mountDb(api);
mountPlans(api);        // Agregar
mountCheckout(api);     // Agregar
mountFounders(api);     // Agregar
mountSwagger(app);
app.use('/', api);
```

### **FASE 4: Frontend - Servicios**

#### **Paso 4.1: Instalar dependencias de Stripe**
```bash
cd adomi-app
npm install @stripe/stripe-js
```

#### **Paso 4.2: Configurar variables de entorno**
**Archivo: `adomi-app/src/environments/environment.ts`**
```typescript
export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:3000',
  stripePublishableKey: 'pk_test_...' // Tu clave pública de Stripe
};
```

#### **Paso 4.3: Crear servicio de planes**
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

#### **Paso 4.4: Crear servicio de Stripe**
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

### **FASE 5: Frontend - Componentes**

#### **Paso 5.1: Crear componente de planes**
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

#### **Paso 5.2: Crear template de planes**
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

#### **Paso 5.3: Agregar ruta de planes**
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

### **FASE 6: Testing y Validación**

#### **Paso 6.1: Probar el backend**
```bash
# Verificar que el backend esté funcionando
curl http://localhost:3000/plans
```

#### **Paso 6.2: Probar el frontend**
```bash
# Verificar que el frontend esté funcionando
# Navegar a http://localhost:4200/plans
```

---

## 🎯 **Orden de Implementación Recomendado**

1. **Fase 1**: Configuración de Stripe (Backend)
2. **Fase 2**: Queries de Base de Datos
3. **Fase 3**: Endpoints del Backend
4. **Fase 4**: Servicios del Frontend
5. **Fase 5**: Componentes del Frontend
6. **Fase 6**: Testing y Validación

**¡Con este plan tienes todo lo necesario para implementar Stripe + Sistema de Fundadores paso a paso!** 🚀

