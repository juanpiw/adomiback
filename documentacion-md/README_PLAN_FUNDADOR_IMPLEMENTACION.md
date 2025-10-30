# Plan Fundador – Guía de Implementación

Este documento resume la solución integral del **Plan Fundador**: cambios de base de datos, endpoints backend, componentes frontend y el flujo completo desde la invitación hasta la activación del plan. Incluye un diagrama de secuencia simplificado y lineamientos para la emisión y control de códigos promocionales.

---

## 1. Objetivos del Plan Fundador

- Permitir que nuevos proveedores activen un plan promocional sin pasar por Stripe.
- Limitar capacidades (servicios, reservas, comisión) desde la configuración de planes.
- Registrar cada paso del funnel para medir conversiones y comportamiento.
- Expirar automáticamente la promoción y degradar al plan gratuito cuando corresponda.

---

## 2. Arquitectura General

```
┌──────────────────────┐       ┌───────────────────────┐
│  /auth/select-plan   │       │  /plans/validate-code │
│  (Angular)           │       │  (Express + MySQL)    │
└──────────┬───────────┘       └──────────┬────────────┘
           │                               │
           │ Código válido                 │
           ▼                               ▼
┌──────────────────────┐       ┌────────────────────────┐
│  sessionStorage      │◄──────┤  promo_codes + plans   │
└──────────┬───────────┘       └──────────┬─────────────┘
           │                               │
           │ /auth/checkout                │
           ▼                               ▼
┌──────────────────────┐       ┌────────────────────────┐
│  applyPromoFlow()    │──────►│  /subscriptions/promo/ │
│  (Angular)           │       │      apply             │
└──────────┬───────────┘       └──────────┬─────────────┘
           │                               │
           │ Respuesta ok                  │
           ▼                               ▼
┌──────────────────────┐       ┌────────────────────────┐
│  auth/me (refresh)   │◄──────┤  users.active_plan_id  │
│  Dashboard Provider  │       │  subscriptions (promo) │
└──────────────────────┘       └────────────────────────┘
```

---

## 3. Cambios en Base de Datos

Migration clave: `backend/migrations/2025-10-30_add_subscription_plan_structures.sql`.

### Tabla `plans`
- Nuevos campos: `plan_type`, `duration_months`, `max_services`, `max_bookings`, `commission_rate`, `benefits`, `metadata`, `updated_at`.
- Permite configurar límites y beneficios sin redeploy.

### Tabla `promo_codes`
- Código promocional (`code`) vinculado a un `plan_id`.
- Control de cupos (`max_redemptions`, `current_redemptions`).
- Ventana de vigencia (`valid_from`, `expires_at`).
- Metadatos (`metadata`) para mensajes custom.

### Tabla `subscriptions`
- Campos nuevos: `promo_code_id`, `promo_code`, `plan_origin`, `services_used`, `bookings_used`, `warning_sent_at`, `expired_notified_at`, `grace_expires_at`, `promo_expires_at`, `metadata`.
- Índices adicionales para expiraciones y orígenes.

### Tabla `provider_subscription_events`
- Bitácora de cambios de estado, aplicación de promo y transición de funnel.

### Tabla `subscription_funnel_events`
- Registro de eventos `view_plan`, `promo_validated`, `registration_completed`, `promo_activated`, `converted_to_paid`.

### Tabla `users`
- Se requiere contar con `active_plan_id` y `stripe_customer_id` (ver script adicional en la respuesta previa si aún no existe esta migración en el entorno).

---

## 4. Endpoints Backend Relevantes

| Endpoint | Descripción | Archivo |
| --- | --- | --- |
| `POST /plans/validate-code` | Valida código Fundador, revisa cupos, vigencia y elegibilidad. | `backend/src/modules/subscriptions/index.ts` |
| `POST /subscriptions/promo/apply` | Inserta suscripción promocional, actualiza `users.active_plan_id`, aumenta redenciones. | `backend/src/modules/subscriptions/index.ts` |
| `POST /subscriptions/funnel/event` | Registro de eventos del funnel. | `backend/src/modules/subscriptions/index.ts` |
| `GET /subscriptions/funnel/metrics` | Métricas agregadas (solo admin). | `backend/src/modules/subscriptions/index.ts` |
| `setupRenewalCron()` | Procesa advertencias y expiraciones de planes promocionales. | `backend/src/modules/subscriptions/renewal-cron.ts` |
| `ensureServiceLimit`, `ensureBookingLimit` | Middleware para límites de servicios/reservas según plan activo. | `backend/src/shared/utils/subscription.util.ts` |

Notas:
- `validate-code` llama internamente a `logFunnelEvent` para registrar `promo_validated`.
- `promo.apply` registra eventos `promo_applied` y `promo_activated` al completar.
- El cron marca suscripciones como `warning` 15 días antes de expirar y las migra al plan gratuito al cierre del periodo.

---

## 5. Componentes Frontend

| Componente | Rol | Archivo |
| --- | --- | --- |
| `SelectPlanComponent` | Muestra planes, captura código Fundador, consulta `/plans/validate-code` y guarda estado en `sessionStorage`. | `adomi-app/src/app/auth/select-plan/select-plan.component.ts` |
| `CheckoutComponent` | Si detecta promo activa, evita Stripe y llama a `/subscriptions/promo/apply`. | `adomi-app/src/app/auth/checkout/checkout.component.ts` |
| `AuthService.getCurrentUserInfo` | Fuerza refresco de perfil tras aplicar el plan. | `adomi-app/src/app/auth/services/auth.service.ts` |

La UI muestra una tarjeta distintiva “Founder” con beneficios, estado del código y límites (`max_services`/`max_bookings`).

---

## 6. Flujo de Usuario Paso a Paso

1. **Registro proveedor**: el usuario completa `/auth/register` y llega a `/auth/select-plan`.
2. **Ingreso de código**: introduce el código Fundador; el frontend llama a `POST /plans/validate-code`.
3. **Validación**: el backend verifica cupos, vigencia, elegibilidad (solo nuevos proveedores) y retorna plan con límites.
4. **Selección**: el plan Fundador se marca como seleccionado, con precio $0 y duración configurada.
5. **Checkout**: en `/auth/checkout`, el flujo detecta el código y ejecuta `applyPromoSubscription()`.
6. **Aplicación backend**: el endpoint registra la suscripción, actualiza `users.active_plan_id`, incrementa `promo_codes.current_redemptions` y anota eventos.
7. **Redirección**: el frontend refresca `/auth/me` para leer el nuevo plan y redirige a `/dash/home`.
8. **Enforcement**: cualquier intento de crear más servicios o reservas pasa por `ensureServiceLimit`/`ensureBookingLimit`.
9. **Renovación**: el cron envía aviso 15 días antes y expira la promoción al cumplir el periodo.

---

## 7. Generación y Gestión de Códigos Fundador

Actualmente los códigos se crean/gestionan vía SQL (no hay UI). Procedimiento recomendado:

1. **Crear/actualizar plan fundador** (una sola vez):
   ```sql
   INSERT INTO plans (...)
   ON DUPLICATE KEY UPDATE ...;
   ```
   Asegúrate de definir `plan_type = 'founder'`, límites (`max_services`, `max_bookings`) y `commission_rate`.

2. **Emitir código promocional**:
   ```sql
   SET @plan_id := (SELECT id FROM plans WHERE name = 'Founder' LIMIT 1);

   INSERT INTO promo_codes (
     code, description, plan_id, plan_type, max_redemptions,
     duration_months, grant_commission_override, applies_to_existing,
     valid_from, expires_at, metadata, is_active
   ) VALUES (
     'FUNDADOR2025',
     'Acceso gratuito Plan Fundador',
     @plan_id,
     'founder',
     500,
     12,
     12.50,
     FALSE,
     NOW(),
     DATE_ADD(NOW(), INTERVAL 6 MONTH),
     JSON_OBJECT('success_message', '¡Bienvenido al plan Fundador!'),
     TRUE
   )
   ON DUPLICATE KEY UPDATE
     plan_id = VALUES(plan_id),
     duration_months = VALUES(duration_months),
     is_active = TRUE,
     metadata = VALUES(metadata),
     updated_at = NOW();
   ```

3. **Distribución**: entrega el código a través de la campaña (landing, WhatsApp, email). No hay límite de caracteres pero se recomienda mayúsculas y <= 20 chars.

4. **Control de uso**: monitorea `promo_codes.current_redemptions` y las filas de `subscriptions` con `plan_origin = 'promo'`.

5. **Revocar o pausar**: establece `is_active = FALSE` o acota `expires_at`. El endpoint de validación respetará estos flags.

6. **Auditoría**: consulta `provider_subscription_events` para ver quién canjeó, y `subscription_funnel_events` para analizar en qué paso abandonan.

### Buenas prácticas
- Cambia los mensajes de éxito/agotamiento via `promo_codes.metadata` (`success_message`, `soldout_message`).
- Usa `max_redemptions` para campañas controladas; para ilimitadas, deja `NULL`.
- Define `applies_to_existing = FALSE` para evitar canje de proveedores activos.

---

## 8. Cron y Post-Activación

- Archivo: `backend/src/modules/subscriptions/renewal-cron.ts`.
- Evalúa suscripciones diariamente (configurable) y:
  - Envía notificación (`warning_sent`) cuando faltan 15 días.
  - Mueve a `expired`, crea evento `expired`, degrada al plan gratuito (`users.active_plan_id = 1`).
- Considera habilitar `SUBSCRIPTION_CRON_DISABLED=false` en entornos productivos.

---

## 9. Métricas y Analítica

- `subscription_funnel_events` permite construir dashboards de conversión (view → promo_validated → registration → activación → pago).
- Endpoint `GET /subscriptions/funnel/metrics` entrega conteos agregados por tipo de evento y código.
- Para análisis avanzado exportar con consultas personalizadas.

---

## 10. Checklist de QA

1. Validar código válido/inválido y mensajes de error.
2. Canjear código con proveedor nuevo y verificar asignación en `/dash/home`.
3. Confirmar límites de servicios/reservas (crear servicios hasta alcanzar `max_services`).
4. Revisar que `promo_codes.current_redemptions` incremente.
5. Simular expiración (forzando `current_period_end` en la base) y observar downgrade automático.
6. Revisar registros en `provider_subscription_events` y `subscription_funnel_events`.

---

## 11. Referencias Cruzadas

- Backend: `backend/src/modules/subscriptions/index.ts`, `backend/src/modules/subscriptions/renewal-cron.ts`, `backend/src/shared/utils/subscription.util.ts`.
- Frontend: `adomi-app/src/app/auth/select-plan/select-plan.component.*`, `adomi-app/src/app/auth/checkout/checkout.component.*`.
- Scripts: `backend/migrations/2025-10-30_add_subscription_plan_structures.sql`.

---

## 12. Próximos pasos sugeridos

- Construir UI interna para gestionar `promo_codes` (CRUD) y ver métricas.
- Automatizar avisos de expiración por email / push segmentado.
- Extender lógica para convertir Plan Fundador a plan pagado con descuento especial.

---

## 13. Guía Express: crear y compartir un código Fundador

1. **Genera el código en la base**
   ```sql
   SET @founder_plan_id := (SELECT id FROM plans WHERE name = 'Founder' LIMIT 1);

   INSERT INTO promo_codes (
     code,
     description,
     plan_id,
     plan_type,
     max_redemptions,
     duration_months,
     grant_commission_override,
     applies_to_existing,
     valid_from,
     expires_at,
     metadata,
     is_active
   ) VALUES (
     'FUNDADOR2025',
     'Acceso gratuito Plan Fundador',
     @founder_plan_id,
     'founder',
     500,
     12,
     12.50,
     FALSE,
     NOW(),
     DATE_ADD(NOW(), INTERVAL 6 MONTH),
     JSON_OBJECT('success_message', '¡Bienvenido al plan Fundador!'),
     TRUE
   )
   ON DUPLICATE KEY UPDATE
     is_active = TRUE,
     expires_at = VALUES(expires_at),
     updated_at = NOW();
   ```

2. **Confírmar que quedó activo**
   ```sql
   SELECT code, current_redemptions, expires_at, is_active
   FROM promo_codes
   WHERE code = 'FUNDADOR2025';
   ```

3. **Entrega el código a la persona**
   - Comparte «FUNDADOR2025» por WhatsApp, mail o landing de invitación.
   - Explica que debe ingresarlo en `/auth/select-plan` en la tarjeta “Founder”.

4. **La persona canjea el código**
   - Inicia sesión/registro, pega el código en la tarjeta.
   - El sistema valida y al llegar a `/auth/checkout` solo presiona “Confirmar”.
   - Tras el ok, será redirigido al dashboard ya con el plan Fundador activo.

5. **Monitorea los canjes**
   ```sql
   SELECT promo_code, COUNT(*) AS total_activos
   FROM subscriptions
   WHERE plan_origin = 'promo'
     AND status IN ('active','warning')
   GROUP BY promo_code;
   ```

Con estos cinco pasos puedes crear y entregar rápidamente nuevos códigos a cada interesada/o en el beneficio Fundador.

