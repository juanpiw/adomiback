## Modelo Merchant of Record (MoR) + Payouts Masivos (Chile)

Objetivo: Operar el marketplace en Chile bajo MoR (Adomi cobra el 100% al cliente) y automatizar pagos a proveedores mediante “Payouts Masivos” bancarios, manteniendo trazabilidad contable, seguridad y conciliación.

---

### 1) Resumen Ejecutivo

- Stripe Connect no soporta cuentas conectadas/payouts locales para Chile hoy. Como alternativa inmediata, Adomi continúa como MoR y automatiza pagos a proveedores vía el banco.
- Tributación MoR:
  - Adomi emite boleta/factura al Cliente por el 100% del servicio y declara IVA sobre ese 100%.
  - El Proveedor emite factura a Adomi por su servicio (su neto), según defina el contador.
- Payouts Masivos: lote bancario (CSV/TXT/API) con múltiples transferencias desde la cuenta de Adomi a las cuentas de los proveedores, según saldo/umbral/reglas.

---

### 2) Arquitectura de Datos (Ledger y Pagos)

- `payments` (existente): registra cobros al cliente (card/cash), desglose `amount`, `commission_amount`, `provider_amount`, `currency`, `status`, `paid_at`.
- `provider_balances` (lógico): saldo acumulado por proveedor (derivable de `payments`), no necesariamente tabla materializada.
- Nuevas tablas sugeridas para payouts:
  - `payout_batches`:
    - `id`, `batch_reference`, `status` (`created|exported|processing|paid|failed|reconciled`), `scheduled_for`, `created_at`, `updated_at`, `raw_request` (JSON opcional), `raw_response` (JSON opcional).
  - `payout_batch_items`:
    - `id`, `batch_id`, `provider_id`, `amount`, `currency`, `bank_code`, `account_type`, `account_number_masked`, `rut_masked`, `beneficiary_name`, `status` (`pending|sent|paid|failed`), `bank_reference`, `error_code`, `error_message`, `created_at`, `updated_at`.
  - `provider_bank_accounts`:
    - `id`, `provider_id`, `rut_encrypted`, `bank_code`, `account_type`, `account_number_encrypted`, `holder_name`, `holder_email`, `verified` (bool), `created_at`, `updated_at`.

Notas:
- Encriptar datos sensibles (`rut_encrypted`, `account_number_encrypted`) en reposo.
- Indexar `payout_batch_items(provider_id, status)` y `payout_batches(status, scheduled_for)`.

---

### 3) Flujo Operativo End-to-End

1) Cobro al cliente (Stripe Checkout) → `payments.completed` (MoR).
2) Ledger: sumar `provider_amount` a saldo del proveedor (derivado vía consultas o proceso ETL ligero).
3) Corte (semanal/quincenal): seleccionar proveedores con saldo ≥ umbral mínimo y sin bloqueos.
4) Generar `payout_batch` y `payout_batch_items`.
5) Exportar lote:
   - CSV/TXT según especificación bancaria o
   - API “Pagos a Proveedores/Nómina” del banco.
6) Estado `exported|processing` y envío al banco.
7) Recepción de confirmaciones/archivo de respuesta o consulta API:
   - Actualizar `payout_batch_items.status` → `paid|failed` + `bank_reference|error`.
8) Conciliación:
   - Verificar contra el extracto bancario (monto total y referencias) → marcar `payout_batches.reconciled`.
9) Notificación a proveedores (email/app) y registro de auditoría.

Idempotencia:
- Usar `batch_reference` único (YYYYMMDD-SEQ) y no reexportar ítems ya `sent|paid`.
- Validar totales por batch antes y después del envío.

---

### 4) Integración Bancaria (CSV/API)

Campos típicos CSV (referencial):
- `beneficiary_rut`, `beneficiary_name`, `bank_code`, `account_type`, `account_number`, `amount`, `currency`, `reference`, `email`.

Ejemplo de encabezado CSV (genérico):
```
beneficiary_rut,beneficiary_name,bank_code,account_type,account_number,amount,currency,reference,email
```

Estrategia:
- Implementar una interfaz `PayoutExporter` con dos implementaciones: `CsvFileExporter` y `BankApiExporter`.
- Guardar el archivo generado en almacenamiento seguro (S3/local) con nombre `payouts_<batch_reference>.csv`.

---

### 5) Seguridad y Cumplimiento

- Cifrado AES-256 para RUT y cuentas; rotación de llaves KMS.
- RBAC: acceso a datos bancarios solo para roles financieros.
- Logs sin PII: ofuscar RUT/cuentas en logs.
- Auditoría: toda operación de creación/envío/reconciliación firmada con usuario/fecha/IP.

---

### 6) Jobs y Scheduler

- `payouts-scheduler` (cron): crea batches en días/hora de corte (configurable), con umbral mínimo y topes por proveedor.
- `payouts-exporter` (cron/manual): toma batches `created`, genera CSV o llama API y marca `exported|processing`.
- `payouts-reconciler` (cron/manual): ingesta archivo de respuesta o consulta API; actualiza estados y concilia totales.

Configurables:
- `PAYOUT_CYCLE_DAYS` (7|14)
- `PAYOUT_MIN_AMOUNT_CLP`
- `PAYOUT_EXPORT_MODE` (`csv|api`)
- `PAYOUT_BANK_API_*` (credenciales, endpoints) si aplica.

---

### 7) UI/UX

- Proveedor (Dashboard):
  - Saldo disponible, fecha de próximo pago, histórico de pagos.
  - Formulario seguro de datos bancarios; verificación básica de RUT.
- Admin:
  - Lista de batches, estado por ítem, export/retry manual, descarga CSV, import de respuesta, filtros por estado/banco.

---

### 8) Contabilidad y Conciliación

- Reporte: totales cobrados (MoR), comisiones propias, netos a proveedores, costos bancarios.
- Conciliar `SUM(payout_batch_items.paid)` con el extracto bancario del período.
- Registro de diferencias y reprocesos (ítems `failed`).

---

### 9) SQL de Soporte (sugerido)

```sql
CREATE TABLE IF NOT EXISTS payout_batches (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  batch_reference VARCHAR(64) NOT NULL UNIQUE,
  status ENUM('created','exported','processing','paid','failed','reconciled') NOT NULL DEFAULT 'created',
  scheduled_for DATETIME NULL,
  raw_request JSON NULL,
  raw_response JSON NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payout_batch_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  batch_id BIGINT UNSIGNED NOT NULL,
  provider_id INT NOT NULL,
  amount BIGINT NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'CLP',
  bank_code VARCHAR(16) NOT NULL,
  account_type VARCHAR(16) NOT NULL,
  account_number_masked VARCHAR(32) NOT NULL,
  rut_masked VARCHAR(32) NOT NULL,
  beneficiary_name VARCHAR(255) NOT NULL,
  status ENUM('pending','sent','paid','failed') NOT NULL DEFAULT 'pending',
  bank_reference VARCHAR(128) NULL,
  error_code VARCHAR(64) NULL,
  error_message VARCHAR(255) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  KEY idx_batch (batch_id),
  KEY idx_provider_status (provider_id, status),
  CONSTRAINT fk_pbi_batch FOREIGN KEY (batch_id) REFERENCES payout_batches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS provider_bank_accounts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL UNIQUE,
  rut_encrypted VARBINARY(512) NOT NULL,
  bank_code VARCHAR(16) NOT NULL,
  account_type VARCHAR(16) NOT NULL,
  account_number_encrypted VARBINARY(512) NOT NULL,
  holder_name VARCHAR(255) NOT NULL,
  holder_email VARCHAR(255) NULL,
  verified TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

### 10) Variables de Entorno (backend)

```
PAYOUT_CYCLE_DAYS=7
PAYOUT_MIN_AMOUNT_CLP=10000
PAYOUT_EXPORT_MODE=csv   # csv|api
PAYOUT_EXPORT_DIR=/var/app/payouts
# Si API banco
PAYOUT_BANK_API_BASE_URL=
PAYOUT_BANK_API_CLIENT_ID=
PAYOUT_BANK_API_CLIENT_SECRET=
```

---

### 11) Roadmap de Implementación (MoR + Payouts Masivos)

1) Datos bancarios del proveedor (backend + UI) con cifrado y validaciones.
2) Cálculo de saldo y criterios de corte (derivado de `payments`).
3) Tablas `payout_batches` y `payout_batch_items` + endpoints admin.
4) Exportador CSV y flujo de envío/descarga; almacenamiento de archivos.
5) Ingesta de respuestas y reconciliación; actualización de estados.
6) Panel Admin: batches, filtros, reintentos; notificaciones a proveedores.
7) Monitoreo/alertas (fallidos, diferencias de conciliación).
8) Pruebas integrales con un banco (sandbox/poC) y documentación operativa.

---

### 12) Operación y Runbooks

- Corte: ejecutar scheduler o disparo manual desde Admin.
- Export: revisar totales y autorizar envío (principio de dos pares de ojos si aplica).
- Reconciliación: importar respuesta y validar con extracto; generar reporte de cierre.
- Incidencias: reintentos para `failed`, contacto con proveedor si datos bancarios inválidos.

---

### 13) Consideraciones Futuras

- Cuando Stripe/PSP local habilite split/payouts en Chile, migrar por feature flag a modelo de intermediación sin cambiar esquema.
- Evaluar PSPs locales con “pagos a terceros/split” para reducir carga operativa.










