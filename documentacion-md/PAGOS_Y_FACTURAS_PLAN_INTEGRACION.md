## Objetivo

- **Garantizar que cada pago y reembolso genere comunicaciones por correo** (recibo/factura) para el cliente y notificación/resumen para el proveedor, similares al correo de Cursor mostrado por el usuario.
- **Estabilizar y certificar el webhook de Stripe** para que reciba eventos de forma confiable (2xx inmediato, verificación de firma, TLS correcto) y evitar deshabilitaciones.
- **Tener trazabilidad e idempotencia** de eventos, con auditoría en base de datos y monitoreo/alertas.

## Estado actual (backend)

- Un único endpoint unificado `POST /webhooks/stripe` montado en `modules/payments/webhooks.ts`, con respuesta 200 inmediata y procesamiento asíncrono. Se mantiene alias `POST /webhooks/stripe-appointments` apuntando al mismo handler.
- El orden de middlewares es correcto: webhooks antes de `express.json()` y usando `express.raw({ type: 'application/json' })`.
- Endpoints de health activos: `GET /webhooks/stripe/health` y `GET /webhooks/stripe-appointments/health`.
- `EmailService` implementado con plantillas HTML (cliente y proveedor) e integrado en `checkout.session.completed` e `invoice.payment_succeeded`.
- Idempotencia/auditoría implementadas: tabla `stripe_events` y registro de `received/processed/error` con `payload_hash`.
- Endpoint de diagnóstico de correo activo: `GET /debug/send-test-email` protegido por `DEBUG_EMAIL_TOKEN`.
- Variables `.env` previstas/soportadas: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (o `STRIPE_APPOINTMENTS_WEBHOOK_SECRET`), SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `FROM_EMAIL`, `FROM_NAME`), `FRONTEND_URL`, `APP_NAME`, `DEBUG_EMAIL_TOKEN`.

## Problema reportado por Stripe

- Stripe deshabilitó el webhook `https://adomi.impactrenderstudio.com/webhooks/stripe` por **9 días consecutivos de fallos**:
  - 54 solicitudes sin poder conectar.
  - 20 solicitudes con otros errores.
- Consecuencias: No se procesan eventos (pagos, invoices, suscripciones) y no se envían emails al cliente.

## Causas probables

1. **Doble registro de la misma ruta** con comportamientos distintos (uno responde al final), propenso a timeout y conflictos.
2. **Conectividad/TLS** intermitente o mal configurada (Stripe requiere TLS 1.2+ y cadena completa).
3. **Secreto de webhook** no alineado con el endpoint activo en Dashboard o cabecera `Stripe-Signature` ausente/manipulada.
4. **Escucha de eventos excesivos** que presionan el servidor innecesariamente.

Referencias: mejores prácticas de webhooks, 2xx rápido, verificación de firma, reintentos, pruebas con CLI, TLS 1.2+ en [docs.stripe.com/webhooks](https://docs.stripe.com/webhooks).

## Diseño objetivo (alto nivel)

1. **Un solo endpoint de webhook**: `POST /webhooks/stripe` que verifica firma y responde 200 inmediatamente; manejar todos los tipos de evento requeridos de forma asincrónica.
2. **Idempotencia**: registrar `event.id` procesados para evitar duplicados.
3. **Emails automáticos y propios**:
   - Activar en Stripe: envío automático de recibos e invoices por email.
   - Implementar `EmailService` (Nodemailer) con plantillas:
     - Cliente: recibo/factura con enlace a `invoice.invoice_pdf` cuando exista; asunto y contenido similar al ejemplo de Cursor.
     - Proveedor: resumen de pago/comisión.
4. **Auditoría**: tabla `stripe_events` (event_id, type, status, processed_at, error) y registro de emails enviados.
5. **Monitoreo**: endpoints `health`, logs estructurados y alertas.

## Tipos de eventos mínimos a suscribir

- `checkout.session.completed` (pagos de Checkout; origen principal de pagos de citas).
- `invoice.payment_succeeded` y `invoice.payment_failed` (suscripciones y facturación).
- `customer.subscription.updated` y `customer.subscription.deleted` (estado de suscripciones).

## Plan de integración (paso a paso)

1) Infra/Config (bloqueante)
   - Validar acceso público a `https://adomi.impactrenderstudio.com/webhooks/stripe` y `.../health` (200 OK).
   - Verificar TLS: certificados válidos (Let's Encrypt), puerto 443 abierto, sin middlewares que modifiquen el body.
   - Alinear secretos: usar el `whsec_*` del endpoint configurado en Dashboard en `STRIPE_WEBHOOK_SECRET`.
   - En Dashboard, habilitar el webhook y limitar a eventos mínimos.

2) Consolidar webhooks
   - Mantener un único registro `POST /webhooks/stripe` (archivo `modules/payments/webhooks.ts`).
   - Migrar handlers de suscripciones/invoices desde `modules/subscriptions/webhooks.ts` como funciones reutilizables.
   - Eliminar el registro duplicado de la misma ruta en `subscriptions/webhooks.ts`.
   - Responder **200 inmediato** tras `constructEvent()`; encolar/ejecutar async la lógica.

3) Idempotencia y auditoría
   - Crear tabla `stripe_events` y guardar `event.id`, `type`, `payload_hash`, `processed_at`, `status`, `error`.
   - Antes de procesar, chequear si `event.id` ya fue procesado.

4) EmailService + plantillas
   - Implementar `shared/services/email.service.ts` (Nodemailer configurable por envs) con funciones:
     - `sendClientReceipt(email, data)` (recibo/factura con link a PDF cuando aplique).
     - `sendProviderPaymentSummary(email, data)`.
   - Plantillas HTML responsivas (tono similar al ejemplo de Cursor): monto, fecha, concepto, número de recibo/factura, botones de "Descargar invoice"/"Descargar recibo" (enlace a Stripe `invoice_pdf`/`receipt_url` si disponible).
   - En `checkout.session.completed`: obtener `customer_email` o desde DB y enviar al cliente y proveedor.
   - En `invoice.payment_succeeded`: asegurar envío y registrar en DB `emails_sent`.

5) Configurar Stripe para envíos automáticos
   - Dashboard → Email settings: activar "Email customers for successful payments" y envío de invoices.
   - Verificar que `Checkout Session` tenga `customer` o `customer_email`.

6) Pruebas con Stripe CLI
   - `stripe listen --forward-to <host>/webhooks/stripe`.
   - `stripe trigger checkout.session.completed` y `stripe trigger invoice.payment_succeeded`.
   - Validar: respuesta 200 inmediata, procesamiento async correcto, emails enviados, registros en DB.

7) Observabilidad
   - Mantener `GET /webhooks/stripe/health`.
   - Métricas de eventos procesados, tiempos, errores.
   - Alertas en fallos repetidos y colas de reintentos de email.

## Consideraciones de seguridad

- Verificar firmas con `stripe.webhooks.constructEvent` y body raw.
- Rotar periódicamente `STRIPE_WEBHOOK_SECRET` desde el Dashboard (ventana de superposición de 24h).
- Prevenir replay con tolerancia de timestamp (valor por defecto 5 minutos) y reloj NTP.
- Excluir la ruta de webhook de cualquier protección CSRF.

## Datos necesarios/pendientes

- Confirmar `STRIPE_WEBHOOK_SECRET` activo para el endpoint público.
- Confirmar credenciales SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `FROM_EMAIL`, `FROM_NAME`).
- Decidir si mantenemos también los emails automáticos de Stripe además de los nuestros (recomendado ambos).

## Referencias

- Webhooks (recepción, verificación de firma, 2xx rápido, reintentos, orden de eventos, TLS): [docs.stripe.com/webhooks](https://docs.stripe.com/webhooks)
- Dashboard de eventos: `https://dashboard.stripe.com/acct_1Opto6Lae2ozUqcf/events`
- Dashboard de logs: `https://dashboard.stripe.com/acct_1Opto6Lae2ozUqcf/logs`

## Próximos pasos

1. Aplicar consolidación de webhook y respuesta 2xx inmediata.
2. Implementar `EmailService` y plantillas.
3. Configurar envíos automáticos de Stripe.
4. Pruebas con Stripe CLI y reintentos manuales.
5. Activar monitoreo y alertas.

## Control de pagos y liquidaciones (Backoffice y flujo operativo)

Objetivo: Llevar control integral de lo cobrado al cliente, la comisión de la plataforma, el neto del proveedor, y el estado de liquidaciones/pagos al proveedor. También registrar y cobrar comisiones de pagos en efectivo.

### Modelo de datos propuesto (extensiones)

- Tabla existente `payments` (ya incluye `amount`, `commission_amount`, `provider_amount`, `status`, `paid_at`). Agregar:
  - `settlement_type` ENUM('card','cash')
  - `eligible_for_payout_at` DATETIME (fecha desde la cual entra a liquidación: p.ej. T+3 hábiles)
  - `payout_item_id` (FK opcional a la tabla de liquidaciones)
  - `refunded_at` (para ajustes)

- Nueva: `provider_payouts` (cabecera de liquidación)
  - `id`, `provider_id`, `period_start`, `period_end`
  - `total_gross`, `total_commission`, `total_provider_amount`
  - `status` ENUM('draft','scheduled','paid','failed','canceled')
  - `scheduled_date`, `paid_date`, `payment_method` ('bank_transfer','wire','other'), `reference`

- Nueva: `provider_payout_items` (detalle)
  - `id`, `payout_id`, `payment_id`, `amount`, `commission_amount`, `provider_amount`

- Nueva: `provider_commission_debts` (solo para efectivo)
  - `id`, `provider_id`, `appointment_id` (o `payment_id`), `commission_amount`, `due_date`, `status` ENUM('pending','paid','overdue'), `settled_at`, `settlement_reference`

### Reglas de negocio

- Elegibilidad para liquidación: `payments.status = 'completed'` y `eligible_for_payout_at <= NOW()`; excluir pagos en disputa/refundados.
- Ventana de liquidación: configurable (p.ej., 3 días hábiles) para alinear con los débitos de Mercury.
- Agrupar por proveedor y generar `provider_payouts` + `provider_payout_items` periódicamente (diario o semanal).
- Registrar manualmente en backoffice el pago al proveedor (transferencia bancaria) con `reference` y `paid_date`.
- Ajustes por reembolso: mover pagos asociados fuera de liquidaciones no pagadas y marcar diferencias.

### Pagos en efectivo (cash)

- Si el cliente paga en efectivo al proveedor:
  - Crear un `payment` con `settlement_type = 'cash'`, `status = 'completed'`.
  - NO entra a `provider_payouts` (ya cobrado); en su lugar, crear registro en `provider_commission_debts` por la comisión adeudada a la plataforma.
  - Flujo de cobranza: recordatorios automáticos, fecha límite (`due_date`), opción de pago de comisión vía link de Stripe (Payment Link) o transferencia; bloquear nuevas reservas si hay deudas vencidas configurables.
  - Al recibir la comisión, marcar `provider_commission_debts.status = 'paid'` y registrar `settled_at` + `settlement_reference`.

### Panel/Admin (solo credenciales específicas)

- Sección nueva en la app para administración financiera (rol `admin` o credencial dedicada):
  - Vista de `payments`: filtros por fecha, proveedor, método ('card','cash'), estado, export CSV.
  - Vista de `provider_payouts`: pendientes, programadas, pagadas; detalle por proveedor e items.
  - Acciones: generar liquidación, marcar como pagada, registrar referencia, exportar comprobantes.
  - Vista de `provider_commission_debts`: pendientes, vencidas, pagadas; acciones de conciliación.

### Flujos programados (cron/service)

- Diario: calcular elegibles para liquidación (T+N hábiles), crear borradores de `provider_payouts`.
- Semanal o diario: consolidar y programar liquidaciones.
- Recordatorios: enviar emails/notificaciones a proveedores con resúmenes de próximos pagos o deudas de comisión (cash).

### Webhooks/eventos a considerar

- Continuar escuchando `checkout.session.completed` y `invoice.payment_succeeded`.
- Añadir manejo de `charge.refunded`/`payment_intent.amount_capturable_updated` si aplica para ajustes.
- Guardar `event.id` e idempotencia en `stripe_events`.

### KPIs y auditoría

- KPI: total cobrado (card/cash), comisiones cobradas, comisiones pendientes (cash), montos liquidados vs pendientes, aging de deudas de comisión.
- Auditoría: `stripe_events`, logs de generación de `provider_payouts`, historial de cambios de estado.

### Seguridad y acceso

- La sección admin solo visible para usuarios con rol autorizado; reforzar autorización en backend y frontend.
- Registros sensibles (referencias bancarias) enmascarados en UI; logs sin datos sensibles.

## Progreso (checklist)

- [x] Unificar webhook Stripe en un único endpoint con 2xx inmediato (payments/webhooks.ts)
- [x] Implementar EmailService y plantillas HTML (cliente y proveedor)
- [ ] Configurar envíos automáticos de recibos/facturas en Stripe Dashboard
- [x] Idempotencia y auditoría de eventos (tabla stripe_events)
- [ ] Pruebas con Stripe CLI y reintentos manuales
- [ ] Monitoreo/alertas para webhooks y emails
- [ ] Backoffice de pagos/liquidaciones y flujo de efectivo




## Panel de Auditoría de Pagos (solo usuarios autorizados)

Objetivo: Dar a un rol administrativo una vista completa, confiable y accionable de todos los movimientos financieros por usuario y por cita/pago, con trazabilidad y controles antifraude (reembolsos, disputas, inconsistencias), minimizando riesgos de estafa o errores operativos.

### Alcance funcional

- Vista de pagos: listar, filtrar (fecha, usuario, proveedor, método, estado, monto, rango), export CSV.
- Detalle de pago: timeline de eventos (webhooks, correos, notificaciones, cambios de estado, reembolsos), enlaces a Stripe (charge, payment_intent, invoice) y a la cita.
- Reembolsos: iniciar reembolso (total/parcial) con motivos, registrar resultado, reflejar en Stripe y en la DB, bloquear doble reembolso.
- Disputas: monitor de disputas (abiertas/cerradas/perdidas/ganadas), adjuntar evidencia (archivos), registrar notas y acciones.
- Liquidaciones: ver si el pago fue liquidado (o elegible), referencias bancarias, conciliación de montos vs `provider_payouts`.
- Auditoría por usuario: estado de cuenta (pagos, reembolsos, disputas, comisiones cash, liquidaciones), saldos y riesgos.

### Modelo de datos (extensiones propuestas)

- Tabla `payments` (extender):
  - `refund_status` ENUM('none','pending','partial','full','failed') DEFAULT 'none'
  - `refunded_total` DECIMAL(10,2) DEFAULT 0
  - `dispute_status` ENUM('none','needs_response','under_review','won','lost','closed') DEFAULT 'none'
  - `disputed_at` DATETIME NULL
  - `stripe_charge_id` VARCHAR(255) NULL

- Nueva `payment_refunds`:
  - `id`, `payment_id`, `amount`, `reason` ('requested_by_customer','duplicate','fraudulent','other'),
  - `status` ENUM('pending','succeeded','failed'), `stripe_refund_id`, `created_at`, `processed_at`, `error_message`

- Nueva `payment_event_logs` (append-only):
  - `id`, `resource_type` ('payment','payout','commission_debt'), `resource_id`, `event_type` ('webhook','state_change','refund','dispute','email','note'),
  - `actor_type` ('system','admin','user'), `actor_id` NULL,
  - `payload` JSON (detalles), `created_at`

- Opcional `emails_sent` (si queremos auditoría de correos):
  - `id`, `to`, `template`, `subject`, `status` ('sent','failed'), `error`, `related_type` ('payment','invoice','other'), `related_id`, `created_at`

- Reusar `stripe_events` enlazando `event_id` a `payment_event_logs` para trazabilidad cruzada.

### Endpoints API (solo admin)

- GET `/admin/payments` (filtros: fecha, usuario/proveedor, estado, método, monto, has_refund, has_dispute)
- GET `/admin/payments/:id` (detalle + timeline + enlaces Stripe)
- POST `/admin/payments/:id/refunds` ({ amount, reason, note }) → crea refund en Stripe y registra en `payment_refunds`
- GET `/admin/disputes` (listado, filtros por estado)
- POST `/admin/disputes/:id/evidence` (subida de archivos/metadatos)
- GET `/admin/users/:id/statement` (estado de cuenta resumido: pagos, reembolsos, disputas, comisiones cash, liquidaciones)
- GET `/admin/exports/payments.csv` (export masivo con filtros)

Autorización: middleware de RBAC (e.g., `adminOnly`) y, opcionalmente, allowlist IP.

### UI (Front admin)

- Tabla con filtros avanzados, columnas configurables, paginación, export.
- Vista detalle con:
  - Panel resumen (monto, comisiones, neto, estado, método, enlaces Stripe, cita/usuario/proveedor)
  - Timeline de `payment_event_logs` (webhooks, correos, cambios de estado, notas)
  - Bloques de reembolsos y disputas con acciones y evidencias

### Seguridad y cumplimiento

- Roles estrictos (admin financiero) + 2FA para admins.
- Logs inmutables (`payment_event_logs` append-only). No editar registros; agregar eventos/nuevas versiones.
- Enmascarar PII en logs/exports; no almacenar PAN.
- Alertas automáticas por patrones anómalos (múltiples reembolsos, importes altos, horario inusual).

### Alertas y monitoreo

- Alertas cuando: webhook en error sostenido, reembolsos fallidos, disputa nueva, desalineación pago-liquidación.
- Contadores/KPIs: total cobrado, reembolsado, tasa de disputa, aging de disputas, tiempos de resolución.

### Plan de implementación (iterativo)

1) Datos: crear tablas `payment_refunds`, `payment_event_logs`, (opcional) `emails_sent`; ampliar `payments` con campos de refund/dispute.
2) Webhooks: manejar `charge.refunded`, `charge.dispute.*`; registrar eventos en `payment_event_logs` y actualizar estados.
3) Endpoints admin: listar pagos, detalle + timeline; crear refund seguro (idempotencia con `stripe_refund_id`).
4) UI admin: tabla pagos + detalle; acciones de refund y gestión de disputas.
5) Seguridad: RBAC admin, 2FA, allowlist opcional, auditoría de acciones admin en `payment_event_logs`.
6) Alertas/KPIs: integrar con Slack/Email y tableros básicos.

Notas:
- Mantener idempotencia en refunds (revisar si ya existe `stripe_refund_id`).
- Toda acción manual de admin debe generar un evento en `payment_event_logs`.

