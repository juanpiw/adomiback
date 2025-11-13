# Planes y Promoción Fundador

Este documento describe la nueva arquitectura para la selección de planes, el plan Fundador con código promocional y el ciclo de vida asociado.

## Resumen funcional

- **Selección de Planes**: La pantalla `/auth/select-plan` muestra los planes pago (mensual/anual) y una tarjeta especial `Fundador` con input para código promocional.
- **Código Fundador**: Al ingresar un código válido se desbloquea un plan gratuito de 3 meses con límites configurables. El frontend valida el código via `POST /plans/validate-code`.
- **Activación**: Tras registrarse, el flujo `Checkout` detecta si hay código Fundador y llama a `POST /subscriptions/promo/apply` (sin pasar por Stripe).
- **Renovación**: Un cron `setupSubscriptionRenewalCron` marca las suscripciones Fundador como `warning` a 15 días del vencimiento y las expira al finalizar el periodo.
- **Métricas**: Cada paso del funnel (view, promo_validated, registration_completed, promo_activated, converted_to_paid) se registra en `subscription_funnel_events` para análisis.

## Nuevo esquema

### Tabla `plans`

- `plan_type` (`paid`, `founder`, `free`, `trial`)
- `duration_months`, `max_services`, `max_bookings`, `commission_rate`, `benefits`, `metadata`
- `updated_at` (timestamp auto)

### Tabla `promo_codes`

- `code`, `plan_id`, `plan_type`, `max_redemptions`, `current_redemptions`, `duration_months`, `grant_commission_override`
- `applies_to_existing`, `valid_from`, `expires_at`, `allowed_roles`, `metadata`, `is_active`

### Tabla `subscriptions`

- Campos nuevos: `promo_code_id`, `promo_code`, `plan_origin`, `services_used`, `bookings_used`, `warning_sent_at`, `expired_notified_at`, `grace_expires_at`, `promo_expires_at`, `metadata`

### Tabla `provider_subscription_events`

- `event_type` admite: `created`, `status_changed`, `renewed`, `cancelled`, `expired`, `promo_applied`, `limit_reached`, `warning_sent`, `grace_started`, `funnel_view`, `funnel_validated`, `funnel_registered`, `funnel_converted`.

### Tabla `subscription_funnel_events`

- `event_type`: `view_plan`, `promo_validated`, `registration_completed`, `promo_activated`, `converted_to_paid`
- Columnas auxiliares: `email`, `provider_id`, `promo_code`, `metadata`

## Endpoints

- `POST /plans/validate-code`: valida el código Fundador, aplica reglas de expiración y límites y retorna el plan.
- `POST /subscriptions/promo/apply`: crea la suscripción promocional, asigna plan Fundador y registra eventos.
- `POST /subscriptions/funnel/event`: registra pasos del funnel (se usa desde el frontend en view/registro).
- `GET /subscriptions/funnel/metrics`: resumen agregado para analytics (solo para admin).

## Cron de renovación

Archivo: `backend/src/modules/subscriptions/renewal-cron.ts`

- Corre cada hora (configurable via `SUBSCRIPTION_CRON_INTERVAL_MS`).
- Cambia estado a `warning` cuando faltan entre 1 y 15 días.
- Cambia estado a `expired` al terminar el periodo y degrada al plan gratuito.
- Envía push notifications via `PushService.notifyUser`.

## Límites dinámicos

- `ensureServiceLimit(providerId)` y `ensureBookingLimit(providerId, date)` controlan las restricciones de servicios y reservas.
- `provider-services.routes` usa `ensureServiceLimit` antes de insertar un nuevo servicio.
- `appointments/index.ts` llama `ensureBookingLimit` antes de la creación de una cita.

## Tracking en frontend

- `SelectPlanComponent` registra eventos `view_plan` y `promo_validated`.
- `CheckoutComponent` registra `registration_completed` después del registro exitoso.
- El backend agrega `promo_activated` (código aplicado) y `converted_to_paid` (cuando Stripe actualiza plan).

## Consideraciones

- `promo_codes` permite códigos de un solo uso o campañas con cupos.
- `applies_to_existing = FALSE` evita que proveedores activos canjeen Fundador.
- `plan_type` facilita reportes (futuro: planes anuales, trials, etc.).
- Se puede ajustar comisiones y límites desde `plans` sin despliegues.







