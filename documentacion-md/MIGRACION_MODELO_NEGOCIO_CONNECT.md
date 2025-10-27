## Migración de Modelo de Negocio a Intermediario (Stripe Connect)

Objetivo: Migrar desde el modelo Merchant of Record (MoR) actual a un modelo de **plataforma de intermediación** con Stripe Connect (cuentas conectadas tipo Express), donde la comisión de Adomi se cobra como `application_fee` y el neto del servicio se transfiere automáticamente a la cuenta conectada del proveedor.

Este documento define:
- Plan general (fases, riesgos y rollback)
- Plan detallado por componente (DB, Backend, Webhooks, Frontend, Operación)
- Scripts SQL idempotentes para esquema de datos (nuevos campos/tablas/índices)


---

## 1) Estado actual (resumen)

- Cobro con tarjeta vía Stripe Checkout en la cuenta de Adomi (MoR).
- Registro de `payments` con desglose (`amount`, `tax_amount`, `commission_amount`, `provider_amount`), y liberaciones a una wallet interna, no hay Stripe Connect ni `transfer_data`.
- Pagos en efectivo: se registra `payments (cash)` y `provider_commission_debts` para cobrar la comisión a posteriori.
- Webhooks consolidados y estables; `stripe_events` para idempotencia.


## 2) Objetivo del modelo Intermediario (Connect)

- Proveedor vende al Cliente (emite boleta/factura al Cliente por el servicio).
- Adomi vende al Proveedor un servicio de intermediación (emite factura por la comisión + IVA 19%).
- Stripe divide el pago en el cobro (destination charges):
  - `application_fee_amount` → Adomi
  - `transfer_data.destination` (acct_xxx) → Proveedor


## 3) Plan general (fases y control de riesgo)

1. Preparación y compliance
   - Confirmar cobertura de payouts (país/moneda) para proveedores; definir política de comisión y de reembolsos (si devuelven comisión).
   - Activar Stripe Connect (Express) y URLs de onboarding (return/refresh).
2. Datos y configuración
   - Migraciones DB (campos en `users`/`payments`, tablas auxiliares) y variables de entorno.
3. Onboarding Proveedores (piloto)
   - Endpoints para crear cuenta conectada, generar `account_link`, login al dashboard Express.
   - Webhook `account.updated` para sincronizar `payouts_enabled` y requirements.
4. Checkout Connect (piloto)
   - En `checkout.sessions.create`, agregar `payment_intent_data.application_fee_amount` y `transfer_data.destination` si el proveedor está “Conectado y con payouts habilitados”.
   - Registrar `marketplace_model='connect'` e IDs (fee/transfer/charge).
5. Operación Dual (feature flag)
   - Proveedores conectados usan Connect; resto siguen en MoR hasta completar onboarding.
6. Reembolsos/Disputas/Payouts
   - Refund con `reverse_transfer` y `refund_application_fee` según política.
   - Webhooks de `payout.*` (solo para estado informativo) y `charge.dispute.*`.
7. Cutover y desenganche parcial de wallet interna
   - Para Connect, no usar wallet interna para liberaciones; mantenerla para histórico MoR y para cash.

Rollback: toggle de feature flag por proveedor a MoR si hay incidentes. Scripts SQL son aditivos y no rompen el flujo MoR.


## 4) Plan detallado por componente

### 4.1 Base de Datos (esquema)

- `users` (o `provider_profiles` si preferimos separar) – nuevos campos para la cuenta conectada:
  - `stripe_account_id VARCHAR(255)`
  - `stripe_account_type ENUM('standard','express','custom') DEFAULT 'express'`
  - `stripe_onboarding_status ENUM('none','pending','requirements_due','completed','restricted') DEFAULT 'none'`
  - `stripe_payouts_enabled TINYINT(1)`
  - `stripe_requirements JSON`

- `payments` – extender para metadatos Connect y trazabilidad:
  - `marketplace_model ENUM('mor','connect') DEFAULT 'mor'`
  - `stripe_destination_account_id VARCHAR(255)`
  - `stripe_application_fee_id VARCHAR(255)`
  - `stripe_transfer_id VARCHAR(255)`
  - `stripe_charge_id VARCHAR(255)`

- Tablas auxiliares (operación/observabilidad):
  - `provider_connect_onboarding` (log de account links generados y estado)
  - `connect_payout_events` (snapshot de eventos `payout.*` para UI/soporte)

### 4.2 Backend (API)

- Onboarding Proveedor:
  - `POST /providers/:id/stripe/connect/create` → crea `acct_xxx` y guarda en DB.
  - `POST /providers/:id/stripe/connect/onboarding-link` → crea `account_link` y registra en `provider_connect_onboarding`.
  - `GET /providers/:id/stripe/connect/dashboard` → genera login link al dashboard Express.
- Checkout Connect (feature-flag + fallback):
  - En `checkout-session`, si `CONNECT_ENABLED` y el proveedor tiene `stripe_account_id` y `payouts_enabled`, setear `payment_intent_data` con `application_fee_amount` y `transfer_data.destination`.
  - Guardar metadatos Connect en `payments` (ver Webhooks).
- Refunds/Disputas:
  - `POST /admin/payments/:id/refund` → aplicar refund con `reverse_transfer` y `refund_application_fee` según política si `marketplace_model='connect'`.
 - Billing Proveedor (cobro cash fallback):
   - `POST /providers/:id/billing/setup-intent` → crea Setup Intent y asegura `stripe_customer_id` (para PaymentIntent off_session futuro).
   - `GET /providers/:id/debts` → lista deudas `provider_commission_debts` del proveedor.
 - Admin (cobro cash):
   - `POST /admin/cash-commissions/run-collection` → inicia ciclo de cobro (placeholder: enlistar elegibles; el débito/cargo se realiza en servicio de pagos).

### 4.3 Webhooks

- `account.updated` → sincroniza `stripe_payouts_enabled` y `stripe_onboarding_status/requirements`.
- `checkout.session.completed` (Connect) → persistir `marketplace_model='connect'`, IDs de fee/transfer/charge y `stripe_destination_account_id`.
- `payout.paid`/`payout.failed` (Connect) → snapshot en `connect_payout_events` para UI.
- `charge.dispute.*` → alertas y estado en Admin.

### 4.4 Frontend

- Proveedor (Dashboard): botón “Configurar mis pagos” (onboarding), estado de cuenta (conectada/pendiente), enlace al dashboard Express.
- Handoff post‑pago (proveedor): tras `payment-success` y promoción a provider, si `payouts_enabled=false` → abrir wizard de Connect automáticamente.
  - Google success (intención provider) fuerza redirección a `/auth/select-plan` y marca `providerOnboarding=1` en `sessionStorage` para evitar redirecciones del layout de cliente.
  - `payment-success` hace polling a `/auth/me` hasta `role='provider'`; si el usuario no tiene payouts habilitados, redirige a `/dash/ingresos` para iniciar onboarding (el wizard invoca `POST /providers/:id/stripe/connect/create` y luego `POST /providers/:id/stripe/connect/onboarding-link` y redirige a `account_link.url`).
  - Al retornar desde Stripe (RETURN_URL), mostrar estado y, cuando `account.updated` indique `payouts_enabled=true`, cerrar wizard y dirigir al dashboard.
- Cliente (Checkout): sin cambios visibles (sigue Stripe Checkout). 
- Admin: reportes de `application_fee` (comisiones Connect) y consolidado con comisiones cash.

### 4.5 Operación/Contabilidad

- Documentos: Proveedor emite boleta/factura al Cliente; Adomi emite factura al Proveedor por la comisión (+ IVA 19%).
- Conciliación: ingresos de Adomi = suma de `application_fee` netos; cash sigue con `provider_commission_debts`.


## 5) Variables de entorno

- `STRIPE_CONNECT_ENABLED=true`
- `STRIPE_CONNECT_FEE_PERCENT=15`
- `STRIPE_CONNECT_ONBOARD_RETURN_URL=https://app.adomiapp.cl/dash/ingresos`
- `STRIPE_CONNECT_ONBOARD_REFRESH_URL=https://app.adomiapp.cl/dash/ingresos/onboarding-retry`
- (Opcional) `STRIPE_WEBHOOK_SECRET_CONNECT` si separa endpoint para Connect

Modo operativo actual: TEST
- Frontend: `stripePublishableKey = pk_test_...` (en environment.ts y environment.prod.ts)
- Backend: `STRIPE_SECRET_KEY = sk_test_...` y `STRIPE_WEBHOOK_SECRET = whsec_test_...`
- No mezclar TEST/LIVE en ningún flujo (Checkout, SetupIntent, Webhooks)


## 6) Scripts SQL (idempotentes)

Nota: usar primero verificaciones en `INFORMATION_SCHEMA`. Ejecutar solo los `ALTER TABLE` de columnas faltantes. En MySQL 8.0.29+ se puede usar `ADD COLUMN IF NOT EXISTS`; incluimos ambos enfoques.

### 6.1 users – Campos de cuenta conectada

Verificación (ejecutar y revisar filas vacías):
```sql
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='stripe_account_id';
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='stripe_account_type';
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='stripe_onboarding_status';
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='stripe_payouts_enabled';
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='stripe_requirements';
```

Agregar faltantes (usar los que apliquen):
```sql
ALTER TABLE users ADD COLUMN stripe_account_id VARCHAR(255) NULL;
ALTER TABLE users ADD COLUMN stripe_account_type ENUM('standard','express','custom') NULL DEFAULT 'express';
ALTER TABLE users ADD COLUMN stripe_onboarding_status ENUM('none','pending','requirements_due','completed','restricted') NULL DEFAULT 'none';
ALTER TABLE users ADD COLUMN stripe_payouts_enabled TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN stripe_requirements JSON NULL;
```

Índices opcionales:
```sql
CREATE INDEX idx_users_stripe_account_id ON users (stripe_account_id);
```

### 6.2 payments – Metadatos Connect y modelo

Verificación:
```sql
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='marketplace_model';
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='stripe_destination_account_id';
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='stripe_application_fee_id';
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='stripe_transfer_id';
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='stripe_charge_id';
```

Agregar faltantes (usar los que apliquen):
```sql
ALTER TABLE payments ADD COLUMN marketplace_model ENUM('mor','connect') NOT NULL DEFAULT 'mor' AFTER payment_method;
ALTER TABLE payments ADD COLUMN stripe_destination_account_id VARCHAR(255) NULL AFTER stripe_payment_intent_id;
ALTER TABLE payments ADD COLUMN stripe_application_fee_id VARCHAR(255) NULL AFTER stripe_destination_account_id;
ALTER TABLE payments ADD COLUMN stripe_transfer_id VARCHAR(255) NULL AFTER stripe_application_fee_id;
ALTER TABLE payments ADD COLUMN stripe_charge_id VARCHAR(255) NULL AFTER stripe_transfer_id;
```

Índices sugeridos:
```sql
CREATE INDEX idx_payments_marketplace_model ON payments (marketplace_model);
CREATE INDEX idx_payments_destination ON payments (stripe_destination_account_id);
```

### 6.3 provider_connect_onboarding – Log de onboarding

Verificación/creación:
```sql
SHOW TABLES LIKE 'provider_connect_onboarding';
```

Crear si no existe:
```sql
CREATE TABLE IF NOT EXISTS provider_connect_onboarding (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL,
  stripe_account_id VARCHAR(255) NULL,
  account_link_url VARCHAR(1000) NULL,
  account_link_expires_at DATETIME NULL,
  status ENUM('created','opened','expired','completed','failed') NOT NULL DEFAULT 'created',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  KEY idx_provider_status (provider_id, status),
  CONSTRAINT fk_pco_provider FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 6.4 connect_payout_events – Snapshot de eventos de payout

Verificación/creación:
```sql
SHOW TABLES LIKE 'connect_payout_events';
```

Crear si no existe:
```sql
CREATE TABLE IF NOT EXISTS connect_payout_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  stripe_payout_id VARCHAR(255) NOT NULL,
  stripe_account_id VARCHAR(255) NOT NULL,
  amount BIGINT NOT NULL,
  currency VARCHAR(10) NOT NULL,
  status ENUM('paid','failed','canceled','in_transit') NOT NULL,
  arrival_date DATETIME NULL,
  received_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  raw JSON NULL,
  UNIQUE KEY uk_payout_account (stripe_payout_id, stripe_account_id),
  KEY idx_account_status (stripe_account_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 6.5 Semillas `platform_settings` (si aplica)

```sql
INSERT INTO platform_settings (setting_key, setting_value, setting_type, description)
SELECT 'stripe_connect_enabled','false','boolean','Feature flag global para usar Connect' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM platform_settings WHERE setting_key='stripe_connect_enabled');

INSERT INTO platform_settings (setting_key, setting_value, setting_type, description)
SELECT 'stripe_connect_fee_percent','15','number','Porcentaje comisión Connect (%)' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM platform_settings WHERE setting_key='stripe_connect_fee_percent');
```


## 7) Cambios de código (resumen)

- Backend (nuevos endpoints): crear cuenta, onboarding link, dashboard link.
- Checkout: al crear la sesión, si elegible → setear `payment_intent_data.application_fee_amount` y `transfer_data.destination`.
- Webhooks: `account.updated`, `checkout.session.completed` (guardar metadatos Connect en `payments`), `payout.*`, `charge.dispute.*`.
- Frontend: UI proveedor para onboarding/estado; admin para reportes de comisiones (application_fee).


## 8) Pruebas y QA

- Stripe CLI: `checkout.session.completed`, `account.updated`, `payout.paid`, `payout.failed`.
- Casos de fallback: proveedor sin `acct_xxx` o con `payouts_enabled=false` → usar MoR.
- Reembolsos: validar política de `reverse_transfer`/`refund_application_fee`.


## 9) Rollout y Cutover

- Piloto con proveedores seleccionados; feature flag por proveedor.
- Monitoreo de webhooks y conciliación de `application_fee` vs reportes.
- Campaña para completar onboarding; fecha de corte para usar Connect por defecto.


## 10) Consideraciones de efectivo (cash)

- Sin cambios de lógica: mantener `payments (cash)` y `provider_commission_debts`.
- Integrar en reportes unificados con comisiones Connect.


## 11) Riesgos y mitigaciones

- Payouts no soportados/bloqueados → fallback a MoR por proveedor; guías de KYC.
- Reembolsos/disputas complejos → definir política clara y aplicarla de forma consistente.
- Convivencia MoR/Connect/cash → feature flags y reportes diferenciados.


## 12) Rollback

- Toggle de `STRIPE_CONNECT_ENABLED=false` global o por proveedor.
- Checkout vuelve a MoR; tablas y columnas nuevas son aditivas (no bloquean MoR ni cash).

## 13) Cobro de comisiones por pagos en efectivo en modelo Connect (híbrido)

Problema: el pago en efectivo ocurre fuera de Stripe. Connect no puede dividir dinero físico. La plataforma debe cobrar la comisión al proveedor a posteriori.

Estrategia híbrida recomendada (prioridad → fallback):

- Opción A – Débito de saldo de la cuenta conectada (preferida):
  - Cuando el proveedor acumule saldo disponible en su cuenta Connect (por trabajos con tarjeta), ejecutar un débito del saldo del proveedor hacia la plataforma por el total adeudado (o parcial), creando una transferencia desde la cuenta conectada a la cuenta de plataforma.
  - Ventajas: checkout limpio (siempre `application_fee_amount = base_fee`), conciliación clara (el proveedor ve ingresos y débitos separados), desacopla cobro de comisiones del flujo de ventas.
  - Implementación: autenticación "como" la cuenta conectada (cabecera `Stripe-Account: acct_xxx`) y creación de una `transfer` con `destination` = cuenta de la plataforma, agrupada por `transfer_group` del ciclo. Validar disponibilidad/soporte con Stripe para el tipo de cuenta (Express) y país.
- Opción B – Netting automático en futuros cobros con tarjeta:
  - Cuando haya cargos con tarjeta usando Connect (destination charges), incrementar dinámicamente `application_fee_amount` para recuperar deuda de comisiones cash acumulada del proveedor, respetando un tope por cargo para no impactar en exceso un único pago.
  - Ventajas: no requiere tarjeta del proveedor y no depende de un job si se hace on-the-fly.
- Opción C – Cargo a tarjeta del proveedor (fallback):
  - Si el proveedor no genera cobros con tarjeta (saldo Connect 0), registrar una tarjeta por Setup Intent y crear un PaymentIntent al cierre del ciclo por el total adeudado (o parcial) con `off_session=true`.
- Opción D – Transferencia manual (respaldo operativo):
  - Mantener flujo actual de transferencia + comprobante; útil si (A), (B) y (C) fallan.

Notas sobre Stripe:
- El uso de débitos desde el saldo de la cuenta conectada (A) depende de capacidades y políticas de Stripe para el tipo de cuenta Connect y jurisdicción; coordinar con soporte Stripe. Si no es viable en algún caso, utilizar (B) y (C).

### 13.1 Cambios de datos (extensiones)

Extender `provider_commission_debts` para soportar neteo parcial y cobros con tarjeta:

```sql
-- Verificación
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='provider_commission_debts' AND COLUMN_NAME='settlement_method';
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='provider_commission_debts' AND COLUMN_NAME='attempt_count';
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='provider_commission_debts' AND COLUMN_NAME='last_attempt_at';
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='provider_commission_debts' AND COLUMN_NAME='settled_amount';
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='provider_commission_debts' AND COLUMN_NAME='stripe_payment_intent_id';
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='provider_commission_debts' AND COLUMN_NAME='stripe_charge_id';

-- Altas (usar solo las que falten)
ALTER TABLE provider_commission_debts ADD COLUMN settlement_method ENUM('netting','card','manual') NULL AFTER status;
ALTER TABLE provider_commission_debts ADD COLUMN attempt_count INT NOT NULL DEFAULT 0 AFTER due_date;
ALTER TABLE provider_commission_debts ADD COLUMN last_attempt_at DATETIME(6) NULL AFTER attempt_count;
ALTER TABLE provider_commission_debts ADD COLUMN settled_amount DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER commission_amount;
ALTER TABLE provider_commission_debts ADD COLUMN stripe_payment_intent_id VARCHAR(255) NULL AFTER voucher_url;
ALTER TABLE provider_commission_debts ADD COLUMN stripe_charge_id VARCHAR(255) NULL AFTER stripe_payment_intent_id;
-- Para opción A (débito de saldo):
ALTER TABLE provider_commission_debts ADD COLUMN stripe_transfer_id VARCHAR(255) NULL AFTER stripe_charge_id;
ALTER TABLE provider_commission_debts ADD COLUMN transfer_group VARCHAR(255) NULL AFTER stripe_transfer_id;
ALTER TABLE provider_commission_debts ADD COLUMN last_balance_available BIGINT NULL AFTER last_attempt_at; -- en moneda menor (CLP enteros)
ALTER TABLE provider_commission_debts ADD COLUMN last_balance_checked_at DATETIME(6) NULL AFTER last_balance_available;

-- Índices útiles
CREATE INDEX idx_pcd_status_due ON provider_commission_debts (status, due_date);
CREATE INDEX idx_pcd_transfer ON provider_commission_debts (stripe_transfer_id);
```

Nueva tabla de asentamientos (parciales o totales) de deudas:

```sql
CREATE TABLE IF NOT EXISTS provider_commission_settlements (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  debt_id BIGINT UNSIGNED NOT NULL,
  provider_id INT NOT NULL,
  payment_id INT NULL, -- pago de cita con tarjeta que generó el neteo
  appointment_id INT NULL,
  settled_amount DECIMAL(10,2) NOT NULL,
  method ENUM('balance_debit','netting','card','manual') NOT NULL,
  stripe_payment_intent_id VARCHAR(255) NULL,
  stripe_charge_id VARCHAR(255) NULL,
  stripe_transfer_id VARCHAR(255) NULL,
  transfer_group VARCHAR(255) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY idx_debt (debt_id),
  KEY idx_provider_created (provider_id, created_at),
  CONSTRAINT fk_pcs_debt FOREIGN KEY (debt_id) REFERENCES provider_commission_debts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Opcional: tabla de clientes/PM del proveedor (si guardaremos una tarjeta a su nombre para comisiones):

```sql
CREATE TABLE IF NOT EXISTS provider_billing_profiles (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL,
  stripe_customer_id VARCHAR(255) NULL,
  default_payment_method_id VARCHAR(255) NULL,
  status ENUM('none','setup_required','ready') NOT NULL DEFAULT 'none',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uk_provider (provider_id),
  KEY idx_customer (stripe_customer_id),
  CONSTRAINT fk_pbp_provider FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

`platform_settings` (parámetros del motor de cobro):

```sql
INSERT INTO platform_settings (setting_key, setting_value, setting_type, description)
SELECT 'cash_debt_cycle_days','7','number','Días por ciclo de cobro de comisiones cash' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM platform_settings WHERE setting_key='cash_debt_cycle_days');

INSERT INTO platform_settings (setting_key, setting_value, setting_type, description)
SELECT 'cash_debt_max_attempts','3','number','Máximo de intentos de cobro en ciclo (card fallback)' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM platform_settings WHERE setting_key='cash_debt_max_attempts');

INSERT INTO platform_settings (setting_key, setting_value, setting_type, description)
SELECT 'cash_debt_netting_cap_percent','30','number','Máximo % del bruto por cargo para netear deuda' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM platform_settings WHERE setting_key='cash_debt_netting_cap_percent');

INSERT INTO platform_settings (setting_key, setting_value, setting_type, description)
SELECT 'cash_debt_preferred_method','balance_debit','string','Método preferido: balance_debit, netting, card, manual' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM platform_settings WHERE setting_key='cash_debt_preferred_method');
```

### 13.2 Backend – Motor de cobro híbrido

- Débito de saldo (Opción A, preferida):
  - Job periódico (semanal/diario):
    - Para cada proveedor con `provider_commission_debts.status IN ('pending','overdue')`:
      - Consultar saldo disponible: `GET /v1/balance` con `Stripe-Account: acct_xxx`.
      - Si `available >= deuda_total_pendiente` (o parcial): crear `POST /v1/transfers` autenticando con `Stripe-Account: acct_xxx` con payload `{ amount, currency: 'clp', destination: <acct plataforma>, transfer_group }`.
      - Registrar `stripe_transfer_id`, `transfer_group` y un asiento en `provider_commission_settlements (method='balance_debit')`.
      - Actualizar deudas (sumar `settled_amount`, marcar `paid` si corresponde).
    - Idempotencia: usar un `transfer_group` único por ciclo y proveedor; antes de crear transfer, verificar si ya existe un settlement con ese `transfer_group`.
    - Límites: si saldo insuficiente, saltar a fallback.

- Netting (Opción B):
  - En `checkout.sessions.create`, si `provider_debt_remaining > 0`, calcular `extra_fee = min(debt_remaining, cap_porcentaje * amount)` y sumar a `application_fee_amount`; guardar `extra_fee` en `metadata` para el webhook.
  - En `checkout.session.completed`, registrar settlement `method='netting'` y descontar deuda.

- Card fallback (Opción C):
  - Endpoints para Setup Intent y guardado de `payment_method` (tabla `provider_billing_profiles`).
  - Job de ciclo: crear PaymentIntent `off_session` por el monto adeudado o parcial; manejar `payment_intent.succeeded`/`payment_intent.payment_failed` con reintentos hasta `cash_debt_max_attempts`.

- Manual (Opción D):
  - Mantener endpoints para marcar pagadas con voucher (method='manual').

Endpoints nuevos sugeridos:

- Proveedor:
  - `POST /providers/:id/billing/setup-intent` → retorna `client_secret` para guardar tarjeta.
  - `GET /providers/:id/debts` → lista deudas y estado.
- Admin:
  - `POST /admin/cash-commissions/run-collection` → ejecuta ciclo de cobro manual.
  - `POST /admin/providers/:id/debts/retry` → reintentar cobro card fallback.

### 13.3 Webhooks

- `checkout.session.completed` (Connect): aplicar netting registrado (asentamientos parciales) y actualizar deudas.
- `payment_intent.succeeded` (card fallback proveedor): cerrar deudas y registrar asentamiento.
- `payment_intent.payment_failed` (card fallback): actualizar intentos y programar reintentos.
- `transfer.created/transfer.updated/transfer.reversed` (si están disponibles): actualizar `provider_commission_settlements` y reconciliar estados de débitos de saldo.

## 14) Roadmap de Tareas (Backlog ejecutable)

Estructura por fases para implementar el modelo Intermediario (Connect) con coexistencia MoR y cash. Cada tarea incluye criterios de aceptación (CA) y dependencias (Dep).

### Fase 0 — Compliance, definiciones y preparación
- [ ] Validar cobertura de payouts para proveedores (país/moneda) con Stripe. (CA: respuesta Stripe y decisión documentada) (Dep: ninguna)
- [ ] Definir base de comisión (bruto vs. neto) y política de reembolsos (¿devolución de comisión?). (CA: decisión en doc) (Dep: ninguna)
- [ ] Definir proceso tributario: Proveedor emite boleta/factura a Cliente; Adomi factura comisión + IVA 19%. (CA: flujo aprobado por contador) (Dep: ninguna)
- [ ] Evaluar/planificar integración con SII para facturación de comisión. (CA: plan y responsables) (Dep: decisiones tributarias)
- [ ] Configurar envs: `STRIPE_CONNECT_ENABLED`, URLs onboarding (return/refresh), `STRIPE_CONNECT_FEE_PERCENT`. (CA: envs presentes en prod/stg) (Dep: ninguna)

### Fase 1 — Datos (migraciones SQL idempotentes)
- [ ] Aplicar 6.1 (users) y 6.2 (payments): columnas e índices de Connect. (CA: columnas visibles; tests select ok) (Dep: F0)
- [ ] Crear 6.3 `provider_connect_onboarding` y 6.4 `connect_payout_events`. (CA: tablas creadas) (Dep: F0)
- [ ] Semillas 6.5 `platform_settings` + 13.1 parámetros de cobro cash. (CA: registros presentes) (Dep: F0)
- [ ] Extender `provider_commission_debts` y crear `provider_commission_settlements` y `provider_billing_profiles`. (CA: tablas/columnas creadas) (Dep: F0)

### Fase 2 — Onboarding de Proveedores (Express)
- [x] Endpoint idempotente: `POST /providers/:id/stripe/connect/create` (CA: crea o reutiliza acct_xxx; guarda en DB) (Dep: F1)
- [x] Endpoint: `POST /providers/:id/stripe/connect/onboarding-link` (CA: retorna `account_link.url`; log en onboarding table) (Dep: F2-1)
- [x] Endpoint: `GET /providers/:id/stripe/connect/dashboard` (CA: retorna login link) (Dep: F2-1)
- [ ] Seguridad: validar `:id` = usuario autenticado y rol provider. (CA: tests de auth) (Dep: F2-1)
- [ ] Webhook `account.updated`: sincronizar `payouts_enabled`, `onboarding_status`, `requirements`; auto-fallback a MoR si se restringe. (CA: estados reflejados) (Dep: F1)

### Fase 3 — Checkout (Connect + fallback MoR)
- [x] Feature flag por proveedor: si `stripe_account_id && payouts_enabled` → Connect; else → MoR. (CA: decisión en runtime) (Dep: F2)
- [x] Crear Checkout Session (Connect): `payment_intent_data.application_fee_amount` + `transfer_data.destination`. (CA: cobro exitoso y split) (Dep: F3-1)
- [x] Webhook `checkout.session.completed`: registrar `marketplace_model='connect'` y IDs (fee/transfer/charge). (CA: fila `payments` completa) (Dep: F3-2)
- [x] Zero-decimals CLP: unit_amount entero y redondeos consistentes. (CA: pruebas con montos edge) (Dep: F3-2)

### Fase 4 — Motor de Comisiones por Efectivo (híbrido)
- [ ] Débito de saldo (preferido): job periódico que consulta balance del proveedor (Stripe-Account) y crea `transfer` a plataforma. (CA: settlements `balance_debit` y deudas actualizadas) (Dep: F1, F2)
- [ ] Idempotencia por `transfer_group` y reconciliación vía eventos de transfer (si disponibles). (CA: no duplicados) (Dep: F4-1)
- [ ] Netting (alternativa): calcular `extra_fee` topeado y aplicar en Checkout Connect; registrar settlement `netting`. (CA: descontar deuda parcialmente) (Dep: F3)
- [x] Fallback tarjeta: endpoints Setup Intent y listado de deudas; job `off_session` PaymentIntent (pendiente); manejar webhooks `payment_intent.succeeded/failed`. (CA: endpoints disponibles; cobro pendiente) (Dep: F1)
- [ ] Manual: endpoints admin para voucher y mark paid. (CA: operaciones auditadas) (Dep: F1)
 - [x] Admin: endpoint `run-collection` (placeholder) para iniciar ciclo de cobro y enlistar elegibles. (CA: retorna `queued`) (Dep: F1)

### Fase 5 — Admin, Reportería y Observabilidad
- [ ] Extender `/admin` pagos/liquidaciones: comisiones Connect (application_fee), deudas cash, settlements, export CSV. (CA: vistas y filtros) (Dep: F3, F4)
- [ ] KPIs: deuda total, % recuperado por método, aging, transfer/payout status. (CA: tablero) (Dep: F4)
- [ ] Logs/Auditoría: `stripe_events`, `provider_commission_settlements`, `payment_event_logs` enlazados. (CA: trazabilidad completa) (Dep: F1, F4)

### Fase 6 — UI Proveedor
- [ ] Wizard “Configurar mis pagos” (onboarding Express). (CA: cuenta conectada) (Dep: F2)
- [ ] Estado de cuenta: payouts_enabled/requirements; enlace a dashboard Stripe. (CA: estados correctos) (Dep: F2)
- [ ] Comisiones cash: vista de deudas, botón “Agregar tarjeta de respaldo”, mensajes de neteo/débito. (CA: flujo completo) (Dep: F4)

### Fase 7 — QA y Seguridad
- [ ] Pruebas con Stripe CLI: `checkout.session.completed`, `account.updated`, `payment_intent.*`, `payout.*`/`transfer.*`. (CA: todos verdes) (Dep: F2–F4)
- [ ] Pruebas de auth/RBAC en endpoints proveedor/admin. (CA: sin escalamiento de privilegios) (Dep: F2, F4)
- [ ] Validación de idempotencia (event.id, transfer_group, refund ids). (CA: sin duplicados) (Dep: F2–F4)

### Fase 8 — Rollout
- [ ] Piloto con N proveedores; monitoreo y soporte. (CA: métricas OK y feedback) (Dep: F2–F7)
- [ ] Cutover por defecto a Connect; campaña para completar onboarding. (CA: tasa de adopción) (Dep: F8-1)
- [ ] Plan de rollback por proveedor (feature flag). (CA: rollback probado) (Dep: F8-1)

### Fase 9 — Documentación y Operación
- [ ] Actualizar documentación (este doc + runbooks de soporte/contabilidad). (CA: docs publicadas) (Dep: F2–F8)
- [ ] Playbooks de reembolsos/disputas y de cobro cash (balance_debit/card/manual). (CA: playbooks disponibles) (Dep: F4)

### Criterios globales de Hecho (DoD)
- [ ] Flujos MoR y Connect conviven sin regresiones; cash sigue operativo.
- [ ] Pagos Connect registran fee/transfer/charge y estado consistente en DB.
- [ ] Comisiones cash se recuperan por balance_debit y/o card fallback; auditoría completa.
- [ ] Admin/Reportes muestran cifras consistentes y exportables.
- [ ] Seguridad y privacidad revisadas; logs sin PII sensible.

## 15) Diagrama de Etapas (Estado actual y pendientes)

```mermaid
flowchart LR
  A[0. Preparación/Compliance] --> B[1. Migraciones DB y Settings]
  B --> C[2. Onboarding Proveedor (Express)]
  C --> D[3. Checkout Connect (Destination Charges)]
  D --> E[4. Motor Cash: Débito de saldo]
  E --> F[4b. Fallback Tarjeta (off_session)]
  F --> G[5. Admin/Reportes/Observabilidad]
  G --> H[6. UI Proveedor - Integraciones]
  H --> I[7. QA/Seguridad]
  I --> J[8. Rollout Piloto]
  J --> K[9. Cutover]

  subgraph Estado
    direction TB
    S1([Onboarding Endpoints]):::done
    S2([Webhook account.updated]):::done
    S3([Checkout con Connect]):::done
    S4([Persistencia metadatos Connect]):::done
    S5([Billing: SetupIntent + Deudas]):::done
    S6([Admin run-collection]):::done
    S7([Job balance_debit]):::todo
    S8([Cobro off_session + webhooks]):::doing
    S9([Stripe Elements UI]):::doing
    S10([Reportes/KPIs Connect+Cash]):::todo
  end

  classDef done fill:#16a34a,color:#fff,stroke:#0f5132;
  classDef doing fill:#f59e0b,color:#fff,stroke:#7c2d12;
  classDef todo fill:#9ca3af,color:#1f2937,stroke:#374151;

  A -.-> S1
  C -.-> S2
  D -.-> S3
  D -.-> S4
  H -.-> S9
  E -.-> S7
  F -.-> S8
  G -.-> S10
```

Leyenda breve:
- done: implementado y cableado
- doing: en ejecución/QA
- todo: pendiente

### 13.4 Frontend

- Proveedor: sección “Comisiones por cobros en efectivo” con:
  - Estado de deuda y fecha de ciclo.
  - Botón “Agregar tarjeta de respaldo” (Setup Intent).
  - Mensajes sobre neteo automático desde cobros con tarjeta.

### 13.5 Algoritmo de netting (pseudocódigo)

```
// En create checkout session (cuando provider usa Connect)
gross = amount_total_clp            // entero (CLP)
base_fee = round(commission_percent * gross)
debt_remaining = getProviderDebt(provider_id)
cap = round((cash_debt_netting_cap_percent / 100) * gross)
extra_fee = min(debt_remaining, cap)
application_fee_amount = base_fee + extra_fee
// Crear Checkout con payment_intent_data.application_fee_amount = application_fee_amount

// En webhook checkout.session.completed
applied = extra_fee_from_session_metadata
if (applied > 0) {
  insert provider_commission_settlements (method='netting', settled_amount=applied, payment_id, appointment_id)
  update provider_commission_debts set settled_amount = settled_amount + applied
  if (settled_amount >= commission_amount) status = 'paid'
}
```

### 13.6 Auditoría y KPIs

- Tablero: deudas generadas, neteadas (A), cobradas por tarjeta (B), manuales (C), % recuperado por método, aging por proveedor.
- Logs de asentamientos (`provider_commission_settlements`) enlazados a `payments` (cuando aplica) para trazabilidad.


