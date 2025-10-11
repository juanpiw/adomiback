# 🚨 Problemas Críticos Identificados y Soluciones

**Fecha:** 2025-10-11  
**Prioridad:** ALTA - Producción afectada

---

## ❌ **PROBLEMA 1: Los pagos NO se descuentan de la tarjeta**

### **Causa Raíz:**

**Incompatibilidad de claves Stripe:**
- Frontend usa: `pk_live_51Opto6Lae2ozUqcfk...` (CLAVE LIVE ✅)
- Backend usa: `sk_test_...` o `STRIPE_SECRET_KEY` no configurada (CLAVE TEST ❌)

**Efecto:**
- Stripe recibe peticiones con claves que no coinciden
- Los pagos se procesan en modo TEST (no cobran realmente)
- Las tarjetas de prueba funcionan pero las reales NO

---

### **🔧 Solución Inmediata:**

#### **Paso 1: Verificar variable de entorno en el servidor**

**SSH al servidor:**
```bash
ssh usuario@servidor
cd /ruta/al/backend
cat .env | grep STRIPE
```

**Debe mostrar:**
```env
STRIPE_SECRET_KEY=sk_live_51Opto6Lae2ozUqcf... # ← Debe empezar con sk_live_
STRIPE_PUBLISHABLE_KEY=pk_live_51Opto6Lae2ozUqcf... # ← Debe coincidir con el frontend
```

**Si muestra `sk_test_`:**
```bash
# Editar .env
nano .env

# Cambiar a:
STRIPE_SECRET_KEY=sk_live_TU_CLAVE_SECRETA_AQUI

# Guardar y reiniciar backend
pm2 restart adomi-backend
# o
sudo systemctl restart adomi-backend
```

#### **Paso 2: Verificar que la clave LIVE existe en Stripe Dashboard**

1. Login en https://dashboard.stripe.com
2. Click en el toggle superior derecho → **"View test data"** debe estar **OFF**
3. Ir a Developers → API Keys
4. Verificar:
   - **Publishable key**: `pk_live_51XXX...` (debe coincidir con el frontend)
   - **Secret key**: `sk_live_51XXX...` (debe tener el mismo prefijo numérico)

⚠️ **IMPORTANTE:** Las claves LIVE tienen el mismo prefijo después de `pk_live_` o `sk_live_`. Deben coincidir.

#### **Paso 3: Verificar que los productos/precios existen en modo LIVE**

**En Stripe Dashboard (modo LIVE):**
1. Ir a **Products**
2. Verificar que existen los planes (Básico, Premium, Fundador)
3. Copiar los **Price IDs** (empiezan con `price_`)
4. Actualizar en la BD:

```sql
-- Verificar planes en BD
SELECT id, name, stripe_price_id FROM plans;

-- Si no tienen stripe_price_id o tienen price_test_, actualizar:
UPDATE plans SET stripe_price_id = 'price_LIVE_ABC123' WHERE id = 2; -- Premium
UPDATE plans SET stripe_price_id = 'price_LIVE_XYZ789' WHERE id = 3; -- Fundador
```

---

### **✅ Verificación:**

Después de aplicar los cambios, probar:

1. **Ir a** `/auth/select-plan`
2. **Seleccionar** plan Premium
3. **Ir a checkout**
4. **Usar tarjeta de prueba**: `4242 4242 4242 4242`
5. **Si funciona** → Stripe está en modo TEST (MAL)
6. **Si dice "tarjeta de prueba no permitida"** → Stripe está en modo LIVE (BIEN) ✅

**Tarjetas reales solo funcionan en modo LIVE.**

---

## ❌ **PROBLEMA 2: Permite crear múltiples cuentas con el mismo email**

### **Análisis del Problema:**

#### **Backend: Validación EXISTE pero puede fallar**

**Archivo:** `backend/src/modules/auth/services/auth.service.ts` (líneas 60-63)

```typescript
// Verificar si el email ya existe
const existing = await this.usersRepo.findByEmail(data.email);
if (existing) {
  throw new Error('El email ya está registrado');
}
```

**El controller maneja este error:**

**Archivo:** `backend/src/modules/auth/controllers/auth.controller.ts` (líneas 25-27)

```typescript
if (error.message.includes('ya está registrado')) {
  return res.status(409).json(ResponseUtil.error(error.message));
}
```

**✅ El backend SÍ valida correctamente.**

**Respuesta cuando email existe:**
```json
{
  "success": false,
  "error": "El email ya está registrado"
}
```
**Status:** 409 Conflict

---

#### **Frontend: NO maneja la validación adecuadamente**

##### **Problema 1: RegisterComponent NO verifica antes de enviar**

**Archivo:** `adomi-app/src/app/auth/register/register.component.ts`

**Flujo actual:**
```typescript
signUpWithEmail() {
  // Valida formato de email
  if (!this.isValidEmail(this.email)) {
    this.emailError = 'Ingresa un correo válido';
    return;
  }
  
  // ❌ NO verifica si el email ya existe
  
  // Envía registro directamente
  this.auth.register({...}).subscribe({
    next: (response) => { /* éxito */ },
    error: (error) => {
      // ✅ Maneja error 409 pero muy tarde
      if (error.status === 409) {
        this.serverError = 'El email ya está registrado. Inicia sesión en su lugar.';
      }
    }
  });
}
```

**Solución necesaria:**
Agregar endpoint de pre-validación:

```typescript
// Backend: GET /auth/check-email?email=...
router.get('/auth/check-email', async (req, res) => {
  const email = req.query.email;
  const existing = await usersRepo.findByEmail(email);
  res.json({ 
    available: !existing,
    exists: !!existing
  });
});

// Frontend: Llamar antes de submit
async checkEmailAvailability() {
  this.http.get(`/auth/check-email?email=${this.email}`)
    .subscribe({
      next: (response) => {
        if (response.exists) {
          this.emailError = 'Este email ya está registrado';
        } else {
          this.emailError = '';
        }
      }
    });
}
```

---

##### **Problema 2: LoginComponent NO maneja "cuenta no existe"**

**Archivo:** `adomi-app/src/app/auth/login/login.component.ts`

**Cuando el usuario intenta login pero NO tiene cuenta:**

**Backend retorna:**
```json
{
  "success": false,
  "error": "Credenciales inválidas"
}
```
**Status:** 401 Unauthorized

**Frontend maneja:**
```typescript
if (error.status === 401) {
  this.passwordError = 'Credenciales incorrectas. Verifica tu email y contraseña.';
}
```

**❌ Problema:**
No distingue entre:
- "Cuenta no existe" → Debería mostrar "No tienes cuenta, regístrate"
- "Password incorrecto" → Debería mostrar "Contraseña incorrecta"

**✅ Solución:**

**Backend (auth.service.ts línea 99-120):**
```typescript
async login(data: LoginDTO): Promise<AuthResponse> {
  Logger.info(MODULE, 'Login attempt', { email: data.email });

  // Buscar usuario
  const user = await this.usersRepo.findByEmail(data.email);
  
  // ✅ CAMBIO: Diferenciar "no existe" vs "password malo"
  if (!user) {
    throw new Error('EMAIL_NOT_FOUND'); // ← Cambiar mensaje
  }

  if (!user.password) {
    throw new Error('PASSWORD_NOT_SET'); // ← Para usuarios de Google
  }

  // Verificar contraseña
  const valid = await bcrypt.compare(data.password, user.password);
  if (!valid) {
    throw new Error('INVALID_PASSWORD'); // ← Cambiar mensaje
  }
  
  // ... resto del código
}
```

**Controller (auth.controller.ts líneas 42-50):**
```typescript
login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await this.authService.login(req.body);
    res.json(ResponseUtil.success(result));
  } catch (error: any) {
    Logger.error(MODULE, 'Login failed', error);
    
    // ✅ CAMBIO: Manejar cada error específicamente
    if (error.message === 'EMAIL_NOT_FOUND') {
      return res.status(404).json(ResponseUtil.error(
        'No existe una cuenta con este email. ¿Quieres registrarte?',
        'EMAIL_NOT_FOUND'
      ));
    }
    
    if (error.message === 'PASSWORD_NOT_SET') {
      return res.status(400).json(ResponseUtil.error(
        'Esta cuenta fue creada con Google. Inicia sesión con Google.',
        'PASSWORD_NOT_SET'
      ));
    }
    
    if (error.message === 'INVALID_PASSWORD') {
      return res.status(401).json(ResponseUtil.error(
        'Contraseña incorrecta. Verifica tu contraseña.',
        'INVALID_PASSWORD'
      ));
    }
    
    res.status(500).json(ResponseUtil.error('Error interno del servidor'));
  }
};
```

**Frontend (login.component.ts):**
```typescript
private handleLoginError(error: any) {
  // Limpiar errores previos
  this.emailError = '';
  this.passwordError = '';
  this.serverError = '';

  console.error('Login error:', error);

  // ✅ CAMBIO: Manejar cada código de error
  if (error.status === 404) {
    // Email no existe
    this.emailError = 'No existe una cuenta con este email.';
    this.serverError = '¿Deseas crear una cuenta? <a href="/auth/register">Regístrate aquí</a>';
  } else if (error.status === 400 && error.error?.code === 'PASSWORD_NOT_SET') {
    // Cuenta de Google
    this.serverError = 'Esta cuenta fue creada con Google. Usa el botón "Continuar con Google".';
  } else if (error.status === 401) {
    // Password incorrecto
    this.passwordError = 'Contraseña incorrecta. Verifica tu contraseña.';
  } else {
    // Error genérico
    this.serverError = 'Error al iniciar sesión. Inténtalo nuevamente.';
  }
}
```

---

##### **Problema 3: Google OAuth permite crear múltiples cuentas**

**Archivo:** `backend/src/modules/auth/routes/google.routes.ts` (líneas 100-109)

**Flujo actual:**
```typescript
// Buscar usuario por google_id o email
let user = await this.usersRepo.findByGoogleId(payload.sub);
if (!user) {
  const byEmail = await this.usersRepo.findByEmail(payload.email);
  if (byEmail) user = byEmail as any;
}

if (!user) {
  // ❌ Si mode='login', redirige con error
  if (parsedState.mode === 'login') {
    return res.redirect(302, loginUrl + '?error=no_account');
  }
  // ✅ Si mode='register', crea cuenta
  const newId = await this.usersRepo.createGoogleUser(...);
}
```

**✅ Este flujo está BIEN implementado.**

**El problema es en el frontend:**

**Archivo:** `adomi-app/src/app/auth/login/login.component.ts`

**NO maneja el parámetro `?error=no_account`:**

```typescript
ngOnInit() {
  // ✅ AGREGAR: Verificar query params para errores de Google
  this.route.queryParams.subscribe(params => {
    if (params['error'] === 'no_account') {
      this.serverError = 'No tienes una cuenta con este email de Google. ¿Deseas registrarte?';
      this.showGoogleRegisterLink = true;
    } else if (params['error'] === 'google_auth_failed') {
      this.serverError = 'Error al autenticar con Google. Inténtalo nuevamente.';
    }
  });
}
```

---

## ✅ **SOLUCIONES IMPLEMENTADAS**

### **Solución A: Endpoint de verificación de email**

**Backend:** `backend/src/modules/auth/routes/auth.routes.ts`

```typescript
// ✅ AGREGAR NUEVO ENDPOINT:
this.router.get('/check-email', async (req: Request, res: Response) => {
  try {
    const email = req.query.email as string;
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email es requerido' 
      });
    }

    const existing = await this.usersRepo.findByEmail(email);
    
    console.log('[AUTH] Check email:', email, 'exists:', !!existing);
    
    return res.status(200).json({
      success: true,
      available: !existing,
      exists: !!existing,
      message: existing ? 'Email ya registrado' : 'Email disponible'
    });
    
  } catch (error: any) {
    console.error('[AUTH] Error checking email:', error);
    return res.status(500).json({
      success: false,
      error: 'Error al verificar email'
    });
  }
});
```

**Frontend:** `adomi-app/src/app/auth/register/register.component.ts`

```typescript
// ✅ AGREGAR MÉTODO:
checkEmailAvailability() {
  if (!this.email || !this.isValidEmail(this.email)) {
    return;
  }

  console.log('[REGISTER] Verificando disponibilidad de email:', this.email);
  
  this.http.get<{success: boolean, exists: boolean}>
    (`${environment.apiBaseUrl}/auth/check-email?email=${encodeURIComponent(this.email)}`)
    .subscribe({
      next: (response) => {
        console.log('[REGISTER] Respuesta check-email:', response);
        if (response.exists) {
          this.emailError = 'Este email ya está registrado. ¿Deseas iniciar sesión?';
          this.showLoginLink = true;
        } else {
          this.emailError = '';
          this.showLoginLink = false;
        }
      },
      error: (error) => {
        console.error('[REGISTER] Error verificando email:', error);
      }
    });
}

// ✅ AGREGAR EN EL HTML:
// <input (blur)="checkEmailAvailability()" ...>
```

---

### **Solución B: Mejorar mensajes de error en Login**

**Backend:** Ya implementado, solo necesita cambios en mensajes

**Frontend:** Agregar manejo de códigos de error específicos (ver código arriba)

---

### **Solución C: Manejo de errores de Google OAuth**

**Frontend:** `adomi-app/src/app/auth/login/login.component.ts`

```typescript
ngOnInit() {
  this.route.queryParams.subscribe(params => {
    if (params['error']) {
      switch(params['error']) {
        case 'no_account':
          this.serverError = 'No existe una cuenta con este email de Google.';
          this.showGoogleRegisterSuggestion = true;
          break;
        case 'google_auth_failed':
          this.serverError = 'Error al autenticar con Google. Inténtalo nuevamente.';
          break;
      }
    }
  });
}
```

---

## 🔍 **PROBLEMA 3: Pagos procesados pero NO registrados en BD**

### **Causa:**
NO hay webhooks de Stripe configurados.

### **Flujo Actual (ROTO):**
```
Usuario paga → Stripe procesa → ✅ Stripe guarda pago
                              → ❌ Backend NO se entera
                              → ❌ NO se crea subscription en BD
                              → Usuario redirigido a /payment-success
                              → ❌ Usuario NO tiene plan activo
```

### **Solución:**

#### **Paso 1: Crear archivo de webhooks**

**Archivo:** `backend/src/modules/subscriptions/webhooks.ts`

```typescript
import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import DatabaseConnection from '../../shared/database/connection';

export function setupStripeWebhooks(router: Router) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

  // POST /webhooks/stripe - Recibir eventos de Stripe
  router.post('/webhooks/stripe', async (req: Request, res: Response) => {
    const sig = req.headers['stripe-signature'] as string;
    let event: Stripe.Event;

    try {
      // Verificar firma del webhook
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      console.log('[STRIPE_WEBHOOK] Evento recibido:', event.type);
    } catch (err: any) {
      console.error('[STRIPE_WEBHOOK] Error de firma:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    const pool = DatabaseConnection.getPool();

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          console.log('[STRIPE_WEBHOOK] Procesando checkout.session.completed');
          const session = event.data.object as Stripe.Checkout.Session;
          
          const userId = session.metadata?.userId;
          const planId = session.metadata?.planId;
          const subscriptionId = session.subscription as string;
          const customerId = session.customer as string;

          console.log('[STRIPE_WEBHOOK] Datos:', { userId, planId, subscriptionId, customerId });

          if (!userId || !planId) {
            console.error('[STRIPE_WEBHOOK] Metadata faltante');
            break;
          }

          // Actualizar stripe_customer_id en users
          await pool.execute(
            'UPDATE users SET stripe_customer_id = ?, active_plan_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [customerId, planId, userId]
          );
          console.log('[STRIPE_WEBHOOK] Usuario actualizado con customer_id y plan');

          // Crear o actualizar suscripción en BD
          const [existing] = await pool.query(
            'SELECT id FROM subscriptions WHERE user_id = ? AND status = "active"',
            [userId]
          );

          if ((existing as any[]).length > 0) {
            // Actualizar suscripción existente
            await pool.execute(
              `UPDATE subscriptions 
               SET stripe_subscription_id = ?, 
                   plan_id = ?, 
                   status = 'active',
                   current_period_start = NOW(),
                   current_period_end = DATE_ADD(NOW(), INTERVAL 1 MONTH),
                   updated_at = CURRENT_TIMESTAMP
               WHERE user_id = ? AND status = 'active'`,
              [subscriptionId, planId, userId]
            );
            console.log('[STRIPE_WEBHOOK] Suscripción actualizada');
          } else {
            // Crear nueva suscripción
            await pool.execute(
              `INSERT INTO subscriptions 
               (user_id, plan_id, stripe_subscription_id, status, current_period_start, current_period_end) 
               VALUES (?, ?, ?, 'active', NOW(), DATE_ADD(NOW(), INTERVAL 1 MONTH))`,
              [userId, planId, subscriptionId]
            );
            console.log('[STRIPE_WEBHOOK] Nueva suscripción creada');
          }
          break;

        case 'customer.subscription.updated':
          console.log('[STRIPE_WEBHOOK] Procesando subscription.updated');
          const updatedSub = event.data.object as Stripe.Subscription;
          
          await pool.execute(
            `UPDATE subscriptions 
             SET status = ?,
                 current_period_start = FROM_UNIXTIME(?),
                 current_period_end = FROM_UNIXTIME(?),
                 cancel_at_period_end = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE stripe_subscription_id = ?`,
            [
              updatedSub.status,
              updatedSub.current_period_start,
              updatedSub.current_period_end,
              updatedSub.cancel_at_period_end,
              updatedSub.id
            ]
          );
          console.log('[STRIPE_WEBHOOK] Suscripción actualizada');
          break;

        case 'customer.subscription.deleted':
          console.log('[STRIPE_WEBHOOK] Procesando subscription.deleted');
          const deletedSub = event.data.object as Stripe.Subscription;
          
          await pool.execute(
            `UPDATE subscriptions 
             SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP 
             WHERE stripe_subscription_id = ?`,
            [deletedSub.id]
          );
          
          // Degradar a plan básico
          await pool.execute(
            'UPDATE users SET active_plan_id = 1 WHERE stripe_customer_id = ?',
            [deletedSub.customer]
          );
          console.log('[STRIPE_WEBHOOK] Suscripción cancelada y usuario degradado');
          break;

        case 'invoice.payment_failed':
          console.log('[STRIPE_WEBHOOK] Procesando payment_failed');
          const failedInvoice = event.data.object as Stripe.Invoice;
          
          await pool.execute(
            `UPDATE subscriptions 
             SET status = 'past_due', updated_at = CURRENT_TIMESTAMP 
             WHERE stripe_subscription_id = ?`,
            [failedInvoice.subscription]
          );
          console.log('[STRIPE_WEBHOOK] Suscripción marcada como past_due');
          break;

        default:
          console.log('[STRIPE_WEBHOOK] Evento no manejado:', event.type);
      }

      res.json({ received: true });
    } catch (error: any) {
      console.error('[STRIPE_WEBHOOK] Error procesando evento:', error);
      res.status(500).json({ error: 'Error procesando webhook' });
    }
  });
}
```

#### **Paso 2: Montar webhooks en el app**

**Archivo:** `backend/src/modules/subscriptions/index.ts`

```typescript
import { setupStripeWebhooks } from './webhooks';

export function setupSubscriptionsModule(app: Express) {
  const router = Router();
  
  // ... endpoints existentes ...
  
  // ✅ AGREGAR: Configurar webhooks
  setupStripeWebhooks(router);
  
  app.use('/', router);
}
```

#### **Paso 3: Configurar en Stripe Dashboard**

1. Ir a https://dashboard.stripe.com/webhooks
2. Click **"Add endpoint"**
3. **Endpoint URL:** `https://adomi.impactrenderstudio.com/webhooks/stripe`
4. **Events to send:**
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Copiar el **Signing secret** (empieza con `whsec_`)
6. Agregarlo al `.env` del servidor:
   ```env
   STRIPE_WEBHOOK_SECRET=whsec_ABC123...
   ```

---

## 📊 **Resumen de Acciones Necesarias**

### **🔥 URGENTE - Para que los pagos funcionen:**

1. ✅ **Verificar/Actualizar `STRIPE_SECRET_KEY` en producción**
   ```bash
   # En el servidor
   echo $STRIPE_SECRET_KEY
   # Debe empezar con sk_live_, no sk_test_
   ```

2. ✅ **Crear archivo de webhooks** (`backend/src/modules/subscriptions/webhooks.ts`)

3. ✅ **Montar webhooks en la app**

4. ✅ **Configurar webhook en Stripe Dashboard**

5. ✅ **Reiniciar backend** en producción

### **📋 IMPORTANTE - Para UX:**

1. ✅ **Crear endpoint `/auth/check-email`** para validación proactiva

2. ✅ **Mejorar mensajes de error** en login/register

3. ✅ **Manejar query params** de error en login

---

## 🎯 **Próximos Pasos Recomendados**

1. **Primero:** Arreglar claves de Stripe (LIVE vs TEST)
2. **Segundo:** Implementar webhooks (crítico para pagos)
3. **Tercero:** Mejorar validaciones de email

---

**¿Quieres que implemente estas soluciones ahora?**

