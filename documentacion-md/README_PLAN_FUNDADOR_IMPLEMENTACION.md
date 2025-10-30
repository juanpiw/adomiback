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

La emisión está automatizada desde la UI interna:

- Ruta: `/dash/admin-pagos` (solo visible para `juanpablojpw@gmail.com`).
- Requiere desbloquear el panel con `ADMIN_PANEL_SECRET` (campo en la parte superior).
- La tarjeta **Plan Fundador – Generador de códigos** consume `POST /subscriptions/admin/founder-code` con dos acciones (`generate` y `send`).

### Procedimiento desde la UI
1. Configura duración, vigencia y notas, luego pulsa **Generar código**. El backend crea el registro en `promo_codes` asociándolo al plan Fundador.
2. El código queda visible para copiarlo. Opcionalmente rellena nombre, correo y un mensaje personalizado.
3. Pulsa **Enviar correo** para llamar al endpoint con `action=send`. Se envía el email HTML y se actualiza la metadata (`last_email_sent_at`, `recipient_name`, etc.).

### Payload de referencia
```http
POST /subscriptions/admin/founder-code
Headers: Authorization Bearer <token>, x-admin-secret: <ADMIN_PANEL_SECRET>

// Generar código
{
  "action": "generate",
  "durationMonths": 3,
  "expiryMonths": 6,
  "notes": "Invitación plan piloto"
}

// Enviar correo
{
  "action": "send",
  "code": "FDR7X9KQ",
  "recipientEmail": "fundador@correo.com",
  "recipientName": "Carla Pérez",
  "message": "¡Bienvenida al programa Fundador!"
}
```

### Auditoría y control
- `promo_codes.metadata` almacena `generated_by`, `notes`, `last_email_sent_at`, etc.
- `is_active` y `expires_at` permiten pausar o limitar la vigencia de canje.
- `promo_codes.current_redemptions` y `subscriptions.plan_origin = 'promo'` muestran el uso efectivo del código.
- Si la UI no está disponible, se puede recurrir al apéndice de SQL (ver Guía Express) como medida de contingencia.

### Buenas prácticas
- Ajusta el mensaje personalizado para contextualizar campañas o ferias específicas.
- Mantén códigos cortos, en mayúsculas y sin caracteres ambiguos.
- Usa `max_redemptions = 1` para códigos exclusivos; reserva cupos mayores para campañas masivas controladas.

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

1. Ingresa a `/dash/admin-pagos` con la cuenta `juanpablojpw@gmail.com` e introduce el `ADMIN_PANEL_SECRET` para habilitar la vista de administración.
2. En la tarjeta **Plan Fundador – Generador de códigos**, ajusta los parámetros (duración, vigencia, notas) y pulsa **Generar código**. Guarda el código que aparecerá en pantalla.
3. Completa nombre y correo de la persona invitada y, si corresponde, añade un mensaje personalizado. Pulsa **Enviar correo** para que el backend envíe el HTML y registre la trazabilidad.
4. Verifica el resultado consultando `SELECT code, expires_at, metadata FROM promo_codes ORDER BY id DESC LIMIT 5;` y confirma que `metadata.last_email_sent_at` se haya actualizado.
5. Pide al proveedor que ingrese el código en `/auth/select-plan` → tarjeta “Plan Fundador”; tras completar el onboarding quedará con el plan asignado automáticamente.

> **Plan B (manual)**: si el panel no está disponible, recurre al script SQL de la sección 7 y envía el código por un canal alternativo. Cuando el panel vuelva a estar operativo, migra esos códigos manuales a la UI para mantener el historial centralizado.

