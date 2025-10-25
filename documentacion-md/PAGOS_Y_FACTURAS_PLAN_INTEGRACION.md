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

### Criterios nuevos implementados

- Unificación de verificación y liberación:
  - Al verificar código correcto en `POST /appointments/:id/verify-completion`, se marca `appointments.completed/verified_at`, se setea `payments.can_release = TRUE` y `release_status` según retención.
  - Si el pago ya es elegible por retención (`paid_at <= NOW() - stripe_release_days`), se mueve de `wallet_balance.pending_balance` a `wallet_balance.balance` y se inserta `transactions (payment_received)` completado.
- Retención configurable:
  - `platform_settings.stripe_release_days` (por defecto 10) y `payout_business_days` (por defecto 3) para T+N hábiles.
- Impuestos:
  - Nuevos campos `tax_amount` en `appointments` y `payments`. La comisión debe calcularse sobre base neta (pendiente de aplicar en lógica de inserción de `payments`).
- Datos bancarios (admin):
  - Campos en `provider_profiles`: `bank_name`, `bank_account`, `account_holder`, `account_rut`, `account_type`.
  - Endpoint `/admin/payments` devuelve banco/cuenta (UI enmascara la cuenta).
- Front Admin Pagos:
  - Filtros por día/semana/mes, columnas de servicio, banco, cuenta enmascarada, fecha estimada de liquidación (T+3 hábiles) y `settlement_status` (pending/eligible/completed/failed).

## Devoluciones (refund_requests)

Objetivo: permitir al cliente solicitar una devolución desde “Mis Reservas”, y al equipo admin gestionar (aprobar/denegar) y pagar manualmente con comprobante, manteniendo trazabilidad y notificaciones por correo.

### Esquema de datos

- Nueva tabla `refund_requests`:
  - `id`, `appointment_id`, `payment_id`, `client_id`, `provider_id`
  - `amount` (monto original pagado), `currency`
  - `reason` (motivo del cliente)
  - `status` ENUM('requested','in_review','approved','denied','cancelled','refunded')
  - `requested_at`, `decided_at`, `decided_by_admin_email`, `decision_notes` (JSON con `voucher`, `reference`, etc.)
  - `stripe_refund_id` (si se procesa vía Stripe a futuro)

### Endpoints implementados

- Cliente:
  - `POST /payments/appointments/:id/refund-request` → crea solicitud (motivo ≥ 10 chars), envía email “Solicitud de devolución recibida”.

- Admin (protegidos por `adminAuth` + `x-admin-secret`):
  - `GET /admin/refunds` → listar con: fecha, servicio, email cliente/proveedor, teléfono cliente, método de pago, `original_amount`, `refund_proposed_amount` (65%), estado y motivo.
  - `POST /admin/refunds/:id/decision` → aprobar/denegar; envía email al cliente:
    - Aprobada: “Devolución aprobada” con monto a devolver (65%) y plazo de 3 días hábiles.
    - Denegada: “Devolución denegada” con motivo (opcional).
  - `POST /admin/refunds/:id/upload-voucher` → subir comprobante (PDF/JPG/PNG, máx 5MB) a `/uploads/admin/refunds/`, guarda URL en `decision_notes.voucher`.
  - `POST /admin/refunds/:id/mark-paid` → marca pagada la devolución (actualiza `status = 'refunded'`, persiste `reference/notes`).

### Emails

- `Refund Received` (al crear la solicitud): confirma recepción y plazo de respuesta (configurable con `REFUND_REVIEW_DAYS`, default 3).
- `Refund Decision` (al decidir):
  - Aprobada: muestra monto a devolver (65% del pagado) y plazo de 3 días para pago.
  - Denegada: muestra motivo de denegación (si se ingresa).

### UI Admin

- “Administración de Pagos” ahora incluye dos tablas:
  - Pagos (arriba): como antes.
  - Devoluciones (abajo): columnas ID, Fecha, Servicio, Cliente, Teléfono, Proveedor, Método, Monto pagado, Monto a devolver (65%), Estado, Motivo, Acciones.
  - Acciones:
    - Aprobar / Denegar (sin prompts intrusivos).
    - Pagar (cuando está aprobado): abre panel para Referencia + subir Voucher; al confirmar, sube archivo y marca pagada.

### Almacenamiento de comprobantes

- Pagos (proveedores): `/uploads/admin/vouchers/`
- Devoluciones (clientes): `/uploads/admin/refunds/`
- Servir estático: `app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')))`

### Formatos permitidos

- PDF, JPG/JPEG, PNG (máx 5MB). Evitar HEIC/HEIF.

### Configuración

- `REFUND_REVIEW_DAYS` (opcional) → plazo en días hábiles para revisar solicitudes (default 3).

### Flujo resumido

1. Cliente paga la cita → si hay problema, desde “Mis Reservas” pulsa “Pedir devolución”, escribe motivo ≥ 10 chars.
2. Backend crea `refund_requests`, envía email de recepción y muestra “Solicitud en proceso” en la tarjeta de la cita.
3. Admin revisa en `/dash/admin-pagos` → Devoluciones; decide Aprobar/Denegar.
4. Aprobada → se envía email con monto a devolver (65%). Admin pulsa “Pagar”, adjunta voucher y referencia → `status = 'refunded'`.

### Pendiente (opcional)

- Integrar reembolso automático vía Stripe (`stripe_refunds`) cuando el método sea tarjeta y la cuenta lo permita; persistir `stripe_refund_id` y conciliar.

### Pendiente por completar

- Cálculo de `commission_amount` sobre base neta (precio sin IVA) y almacenamiento de `tax_amount` al crear `appointments/payments`.
- Exponer en admin totales por rango (bruto, comisión, neto proveedor) y export CSV.
- Registrar auditoría de emails en `emails_sent` (opcional) y eventos en `payment_event_logs`.

### Progreso (devoluciones)

- [x] Tabla `refund_requests` documentada e implementada
- [x] Endpoint cliente para crear solicitud con email de recepción
- [x] Endpoints admin para listar, decidir (emails), subir voucher y marcar pagada
- [x] UI Admin: tabla “Devoluciones” + panel de pago con referencia/voucher
- [x] Servir y almacenar comprobantes en `/uploads/admin/refunds/`

## Pagos en efectivo (cash) – Estrategia de implementación

Objetivo: permitir que el cliente pague en efectivo al proveedor sin romper el ecosistema de pagos/conciliaciones. El sistema registra la venta y crea una "deuda de comisión" del proveedor hacia la plataforma, que debe ser saldada dentro de un plazo (T+N).

### Modelo de datos

- `payments` existente: usar `payment_method='cash'`, almacenar `amount`, `tax_amount`, `commission_amount`, `provider_amount`, `paid_at`.
- Nueva `provider_commission_debts`:
  - `id BIGINT PK`, `provider_id INT`, `appointment_id INT`, `payment_id INT NULL`,
  - `commission_amount DECIMAL(10,2)`, `currency VARCHAR(3) DEFAULT 'CLP'`,
  - `due_date DATETIME`, `status ENUM('pending','paid','overdue','cancelled') DEFAULT 'pending'`,
  - `settled_at DATETIME NULL`, `settlement_reference VARCHAR(255) NULL`,
  - `notes TEXT NULL`, `voucher_url VARCHAR(500) NULL`,
  - índices por (`provider_id`, `status`, `due_date`).
- `platform_settings`:
  - `cash_commission_due_days` (p.ej. 3), `cash_commission_reminder_days` (p.ej. 1), `default_tax_rate`, `default_commission_rate`, `cash_max_amount` (CLP; default 150000).
- Opcional: `payment_event_logs` para auditoría de acciones (create/mark paid/overdue/email/cron).

### Flujo operativo

1) Reserva: el cliente elige "Tarjeta" o "Efectivo".
2) Si "Efectivo": la cita se confirma sin Checkout.
3) Al finalizar el servicio, el proveedor pulsa "Cobrar en efectivo" (Agenda):
   - Validar tope: si `amount > cash_max_amount` (150.000 CLP por cita), rechazar flujo cash y sugerir tarjeta.
   - Backend crea `payments (cash)` con desglose de impuestos/comisión (comisión sobre base neta),
   - Crea `provider_commission_debts` con `due_date = NOW() + cash_commission_due_days`.
4) Recordatorios automáticos previos al vencimiento; si vence → `overdue` y alertas admin.
5) El proveedor paga la comisión:
   - Opción A: transferencia → admin sube voucher y referencia, marca `paid`.
   - Opción B: Payment Link de Stripe (recomendado) → webhook marca `paid` idempotentemente.

### Endpoints (backend)

- Proveedor/Cliente:
  - `POST /appointments/:id/cash/collect` (auth) → confirma cobro efectivo; crea `payments (cash)` y `provider_commission_debts` (rechaza si `amount > cash_max_amount`).

- Admin (protección `adminAuth` + `x-admin-secret`):
  - `GET /admin/cash-commissions` (filtros: rango, status, provider).
  - `POST /admin/cash-commissions/:id/upload-voucher` (PDF/JPG/PNG ≤5MB) → guarda en `/uploads/admin/cash/` y persiste URL.
  - `POST /admin/cash-commissions/:id/mark-paid` ({ reference, notes }) → `pending|overdue`→`paid`.
  - `POST /admin/cash-commissions/:id/cancel` (si corresponde).

- Webhooks (opción Payment Link):
  - Al cobrar la comisión por Stripe, localizar la deuda por `metadata.debt_id` y marcar `paid`; persistir `stripe_payment_intent_id` en `decision/notes`.

### Frontend

- Reserva/checkout: selector método de pago (Tarjeta/Efectivo). Si efectivo, no se abre Checkout.
- Agenda proveedor: botón "Cobrar en efectivo" con modal de confirmación (monto final opcional). Tras confirmar, muestra "Comisión pendiente $X, vence DD/MM".
- Admin Pagos: nueva sección "Comisiones Cash" con tabla (proveedor, cita, comisión, due_date, estado, acciones: subir voucher/mark paid, export CSV) y KPIs (pendiente, vencida, cobrada).

### Emails y notificaciones

- Al crear deuda: email al proveedor con monto y fecha límite.
- Recordatorios: a `cash_commission_reminder_days` del vencimiento y al vencer.
- Confirmación de pago de comisión: email de recibo de comisión.

### Seguridad/antifraude

- Límite de deudas por proveedor; bloqueo de nuevas reservas si `overdue` > N días.
- Tope de pago en efectivo: **CLP 150.000 por cita**. Montos superiores deben procesarse con tarjeta.
- Auditoría de acciones admin en `payment_event_logs`.
- Idempotencia al marcar pagado (evitar doble registro).

### Cron/operación

- Tarea diaria: marcar `overdue`, enviar recordatorios, generar KPIs.

### Fases de entrega

1) Esquema + endpoints core (collect cash + crear deuda; admin listar/mark paid/upload voucher).
2) UI (selector método de pago, botón "Cobrar en efectivo", sección Admin "Comisiones Cash").
3) Recordatorios automáticos y Payment Links Stripe (opcional).
4) Políticas de bloqueo y panel de KPIs.


## Guía SQL (producción): verificación y aplicación incremental

Objetivo: ejecutar cambios de BD de forma segura e incremental en producción. Los bloques son idempotentes si se usan las consultas de verificación previas. Ejecutar de a poco (copiar/pegar por bloque) y avanzar solo si la verificación retorna vacío.

### A) Appointments – columnas de verificación

- Verificar campos actuales:

```sql
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='appointments' AND COLUMN_NAME='payment_method';
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='appointments' AND COLUMN_NAME='verification_code';
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='appointments' AND COLUMN_NAME='code_generated_at';
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='appointments' AND COLUMN_NAME='verification_attempts';
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='appointments' AND COLUMN_NAME='verified_at';
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='appointments' AND COLUMN_NAME='verified_by_provider_id';
```

- Agregar los que falten (ejecutar solo el/los que no existan):

```sql
ALTER TABLE appointments ADD COLUMN payment_method ENUM('card','cash') NULL AFTER status;
ALTER TABLE appointments ADD COLUMN verification_code VARCHAR(10) NULL AFTER payment_method;
ALTER TABLE appointments ADD COLUMN code_generated_at DATETIME(6) NULL AFTER verification_code;
ALTER TABLE appointments ADD COLUMN verification_attempts INT NOT NULL DEFAULT 0 AFTER code_generated_at;
ALTER TABLE appointments ADD COLUMN verified_at DATETIME(6) NULL AFTER verification_attempts;
ALTER TABLE appointments ADD COLUMN verified_by_provider_id INT NULL AFTER verified_at;
```

### B) Appointments – Cierre Mutuo

- Verificar campos actuales:

```sql
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='appointments' AND COLUMN_NAME='closure_state';
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='appointments' AND COLUMN_NAME='closure_due_at';
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='appointments' AND COLUMN_NAME='closure_provider_action';
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='appointments' AND COLUMN_NAME='closure_client_action';
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='appointments' AND COLUMN_NAME='closure_notes';
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='appointments' AND COLUMN_NAME='cash_verified_at';
```

- Agregar los que falten:

```sql
ALTER TABLE appointments ADD COLUMN closure_state ENUM('none','pending_close','resolved','in_review') NOT NULL DEFAULT 'none' AFTER status;
ALTER TABLE appointments ADD COLUMN closure_due_at DATETIME(6) NULL AFTER closure_state;
ALTER TABLE appointments ADD COLUMN closure_provider_action ENUM('none','code_entered','no_show','issue') NOT NULL DEFAULT 'none' AFTER closure_due_at;
ALTER TABLE appointments ADD COLUMN closure_client_action ENUM('none','ok','no_show','issue') NOT NULL DEFAULT 'none' AFTER closure_provider_action;
ALTER TABLE appointments ADD COLUMN closure_notes JSON NULL AFTER closure_client_action;
ALTER TABLE appointments ADD COLUMN cash_verified_at DATETIME(6) NULL AFTER closure_notes;
```

### C) Appointments – índices de cierre

- Verificar:

```sql
SHOW INDEX FROM appointments WHERE Key_name='idx_appointments_closure_state';
SHOW INDEX FROM appointments WHERE Key_name='idx_appointments_closure_due_at';
```

- Crear si faltan:

```sql
ALTER TABLE appointments ADD INDEX idx_appointments_closure_state (closure_state);
ALTER TABLE appointments ADD INDEX idx_appointments_closure_due_at (closure_due_at);
```

Nota: algunos servidores no soportan `CREATE INDEX IF NOT EXISTS`; por eso usamos `SHOW INDEX` + `ALTER TABLE` manual.

### D) provider_commission_debts – asegurar tabla/columnas

- Verificar existencia:

```sql
SHOW TABLES LIKE 'provider_commission_debts';
```

- Crear si no existe (warning 1050 si ya existe = OK ignorar):

```sql
CREATE TABLE IF NOT EXISTS provider_commission_debts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL,
  appointment_id INT NOT NULL,
  payment_id INT NULL,
  commission_amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'CLP',
  status ENUM('pending','paid','overdue','cancelled') NOT NULL DEFAULT 'pending',
  due_date DATETIME(6) NOT NULL,
  settled_at DATETIME(6) NULL,
  settlement_reference VARCHAR(255) NULL,
  voucher_url VARCHAR(500) NULL,
  notes TEXT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  KEY idx_pcd_provider_status (provider_id, status),
  KEY idx_pcd_due_date (due_date),
  CONSTRAINT fk_pcd_provider FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_pcd_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  CONSTRAINT fk_pcd_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- Asegurar columnas nuevas si la tabla era antigua:

```sql
SHOW COLUMNS FROM provider_commission_debts LIKE 'due_date';
SHOW COLUMNS FROM provider_commission_debts LIKE 'voucher_url';

-- Si falta alguna, añadir:
ALTER TABLE provider_commission_debts ADD COLUMN due_date DATETIME(6) NOT NULL AFTER status;
ALTER TABLE provider_commission_debts ADD COLUMN voucher_url VARCHAR(500) NULL AFTER settlement_reference;
```

### E) platform_settings – semillas requeridas (incluye tope efectivo 150.000 CLP)

- Verificar:

```sql
SELECT setting_key, setting_value FROM platform_settings
WHERE setting_key IN (
  'default_tax_rate','default_commission_rate','cash_commission_due_days','cash_commission_reminder_days','cash_max_amount'
);
```

- Insertar faltantes (solo los que no existan):

```sql
INSERT INTO platform_settings (setting_key, setting_value, setting_type, description)
VALUES ('default_tax_rate','19','number','IVA por defecto (%)');

INSERT INTO platform_settings (setting_key, setting_value, setting_type, description)
VALUES ('default_commission_rate','15','number','Comisión plataforma sobre precio neto (%)');

INSERT INTO platform_settings (setting_key, setting_value, setting_type, description)
VALUES ('cash_commission_due_days','3','number','Días para pagar comisión por cobro en efectivo');

INSERT INTO platform_settings (setting_key, setting_value, setting_type, description)
VALUES ('cash_commission_reminder_days','1','number','Recordatorio antes del vencimiento de comisión cash');

INSERT INTO platform_settings (setting_key, setting_value, setting_type, description)
VALUES ('cash_max_amount','150000','number','Tope máximo por cita para pagos en efectivo (CLP)');
```

## Cierre Mutuo (anti-fraude) – Pagos en efectivo

Objetivo: asegurar una “prueba de servicio” de baja fricción cuando el pago es en efectivo, reduciendo el riesgo de colusión o evasión de comisión. El “Cierre Mutuo” se activa automáticamente 1 hora después de finalizar la cita y requiere una acción del proveedor y del cliente; en su defecto, se aplica una resolución por defecto que favorece la integridad del sistema.

### Estados y tiempos

- Activación: t+1h desde fin de la cita → `closure_state = 'pending_close'` y `closure_due_at = end_time + 25h` (1h para activar + 24h para responder).
- Desbloqueo: al resolverse, `closure_state = 'resolved'`.
- Bloqueos de cash durante `pending_close` vencido:
  - Proveedor: no puede aceptar nuevas reservas en efectivo si posee citas con `pending_close` vencidas.
  - Cliente: no puede crear nuevas reservas en efectivo si posee citas con `pending_close` vencidas.

### Campos (DB)

Agregar a `appointments`:
- `closure_state` ENUM('none','pending_close','resolved','in_review') DEFAULT 'none'
- `closure_due_at` DATETIME NULL
- `closure_provider_action` ENUM('none','code_entered','no_show','issue') DEFAULT 'none'
- `closure_client_action` ENUM('none','ok','no_show','issue') DEFAULT 'none'
- `closure_notes` JSON NULL
- (opcional) `cash_verified_at` DATETIME NULL, cuando hay código válido

Nota: mantener índices por (`closure_state`, `closure_due_at`).

### Acciones y resultados (matriz)

- Proveedor puede elegir: `code_entered` (ingresar código), `no_show`, `issue` (problema).
- Cliente puede elegir: `ok` (todo bien), `no_show`, `issue`.

Resolución automática tras 24h (o inmediata si hay código):
- `code_entered` + (cualquiera): Registrar `payments (cash)` y `provider_commission_debts` (si no existen), marcar resuelto y desbloquear.
- `no_show` (prov) + `no_show` (cli): No se cobra comisión; marcar resuelto y desbloquear.
- `no_show` (prov) + `ok` (cli): Marcar comisión adeudada (fraude proveedor); registrar señal de riesgo y desbloquear.
- (ninguna acción) + `ok` (cli): Marcar comisión adeudada por defecto; desbloquear.
- (ninguna) + (ninguna) al vencer: Marcar comisión adeudada por defecto; desbloquear por “gatillo automático”.
- Cualquier `issue`: mover a `in_review`, notificar admin; mantener bloqueo solo al actor que no respondió hasta resolución.

Ventanas y límites:
- Ventana de validación del código: desde `start_time` hasta `end_time + Xmin` (configurable) para reducir fraude de post-fechado.
- Reintentos limitados y auditoría de intentos.

### Endpoints (backend)

- `POST /appointments/:id/cash/select` (auth) → marca método cash y genera/retorna código de verificación (si no existe).
- `POST /appointments/:id/cash/verify-code` (auth) → valida código; si válido, crea `payments (cash)`, crea `provider_commission_debts (pending, due_date = NOW()+N)`, setea `cash_verified_at` y resuelve cierre. Rechaza si `amount > cash_max_amount`.
- `POST /appointments/:id/closure/provider-action` (auth) { action: 'code_entered'|'no_show'|'issue', notes? }
- `POST /appointments/:id/closure/client-action` (auth) { action: 'ok'|'no_show'|'issue', notes? }
- `GET  /appointments/:id/closure` (auth) → estado de cierre (para UI).

Middlewares de gateo (cash):
- En crear/aceptar reservas con `payment_method='cash'` → bloquear si el usuario (cliente/proveedor) tiene `pending_close` vencidas.

### Cron/operación

- Job horario:
  - Marca `pending_close` a citas cash 1h después del fin.
  - Envía notificaciones (push/email) al activarse y 24h después como recordatorio.
  - Aplica la resolución por defecto al exceder `closure_due_at` (gatillo automático), registra eventos y desbloquea.

### Notificaciones

- Activación (t+1h): “Tu cita quedó Pendiente de Cierre”. Acciones claras (Sí/No; Ingresar código / No-show / Problema).
- Recordatorio (t+24h) y resultado (al resolver o por gatillo automático).

### UI (resumen)

- ProviderAgenda: badge “Pendiente de Cierre” + acciones: “Ingresar código”, “No-show”, “Problema”. Mostrar si hay bloqueo por cierres vencidos.
- ClientReservas: banner “¿Se completó?” con botones “Sí, todo ok” / “No, tuve un problema” (+ opciones). Mostrar si hay bloqueo por cierres vencidos.

### Seguridad/antifraude y auditoría

- Contadores por usuario: “no_show desmentido”, “autocierre por inacción”, “issue frecuente”.
- Tope de pago en efectivo: **CLP 150.000 por cita** (enforced en endpoints `cash/select`, `cash/verify-code`, `cash/collect` y validado en UI).
- Registro de auditoría de acciones y reintentos de código.
- Señales para panel admin y posibles sanciones graduales.

### Checklist (Cierre Mutuo)

- [ ] Migración: campos `closure_*` en `appointments` (+ índices)
- [ ] Endpoints provider/client de cierre y `cash/select`/`cash/verify-code`
- [ ] Gateo: bloquear cash si hay `pending_close` vencidas
- [ ] Cron: activar cierre, recordatorios, gatillo automático
- [ ] Notificaciones push/email (activación, recordatorio, resultado)
- [ ] UI proveedor/cliente (badges, banners, botones de acción)
- [ ] Señales de riesgo y vista en admin
