## Transbank Marketplace (Webpay Plus Mall + API Comercios Secundarios)

Objetivo: Implementar en Chile un modelo equivalente a “Stripe Connect” usando Transbank (TBK), combinando la API de Comercios Secundarios para gestionar vendedores y Webpay Plus Mall para dividir pagos en una única transacción.

---

### 1) Arquitectura (visión general)

- Rol plataforma (Mall): tu comercio principal (código de comercio TBK del mall) orquesta el pago y recibe su comisión.
- Comercios Secundarios (tiendas): cada proveedor en la plataforma se registra en la API de comercios secundarios y recibe un `codigoComercioSecundario` (12 dígitos, prefijo 5970). Ese código es el destino de su porción del pago.
- Webpay Plus Mall: el pago del cliente se crea con un arreglo `details[]`, donde cada ítem indica `amount`, `commerce_code` (mall o secundario) y `buy_order` propio.

Resultado: una venta con split nativo en TBK (cliente paga una vez; TBK divide los montos entre mall y tiendas).

---

### 2) APIs involucradas

2.1 API Comercios Secundarios (gestión de vendedores)
- Crear: `POST /comercios-secundarios` → retorna `codigoComercioSecundario` (guardar en BD).
- Consultar: `GET /comercios-secundarios` y `GET /comercios-secundarios/{codigo}`.
- Actualizar: `PUT /comercios-secundarios/{codigo}`.
- Eliminar: `DELETE /comercios-secundarios/{codigo}/{motivo}`.

2.2 Webpay Plus Mall (split del cobro)
- Crear transacción: `POST /rswebpaytransaction/api/webpay/v1.2/transactions` (con `details[]`).
- Confirmar/commit: `PUT /rswebpaytransaction/api/webpay/v1.2/transactions/{token}`.
- Estado/reversas/refunds según API Webpay.

---

### 3) Flujo de Onboarding del Proveedor

1) Proveedor se registra en Adomi → validación KYC/KYB interna (RUT, razón social, giro, banco, email de facturación).
2) Backend crea el comercio secundario: `POST /comercios-secundarios` con los datos del proveedor.
3) TBK responde `codigoComercioSecundario` → persistir en `users.stripe_account_id` equivalente (p. ej. `tbk_secondary_code`).
4) Estados/operativa: exponer en UI proveedor si está activo/restringido; permitir edición y baja.

---

### 4) Flujo de Pago (Webpay Plus Mall)

1) Cliente confirma carrito/cita.
2) Backend crea transacción TBK Mall con `details`:
```json
{
  "buy_order": "orden_mp_12345",
  "session_id": "sess_abcd",
  "return_url": "https://app.adomiapp.cl/tbk/retorno",
  "details": [
    { "amount": 10000, "commerce_code": "5970XXXXXXXX", "buy_order": "orden_vendedor_12345" },
    { "amount": 1500,  "commerce_code": "5970YYYYYYYY", "buy_order": "orden_mall_12345" }
  ]
}
```
3) Redirigir a TBK → el cliente paga → TBK redirige a `return_url` con `token_ws`.
4) Backend ejecuta `commit` con `token_ws` → persiste la venta y los split (montos, códigos, autorizaciones).
5) Conciliación: usar informes de TBK y la tabla de pagos internos para cuadrar mall/comercios.

---

#### 4.1 Ejemplo completo (Mall: dos detales) y headers

Headers típicos (INT/CERT):
```
Tbk-Api-Key-Id: <TBK_API_KEY_ID>
Tbk-Api-Key-Secret: <TBK_API_KEY_SECRET>
Content-Type: application/json
```

Request `POST /rswebpaytransaction/api/webpay/v1.2/transactions`:
```json
{
  "buy_order": "orden-marketplace-123",
  "session_id": "sess-abc-123",
  "return_url": "https://app.adomiapp.cl/tbk/retorno",
  "details": [
    { "amount": 10000, "commerce_code": "5970XXXXXXXX", "buy_order": "ord-vendedor-123" },
    { "amount": 1500,  "commerce_code": "5970YYYYYYYY", "buy_order": "ord-mall-123" }
  ]
}
```

Response (creación):
```json
{ "token": "...", "url": "https://webpay3gint.transbank.cl/webpayserver/initTransaction" }
```

Redirección a `url` con `token` para pago. Luego `PUT /rswebpaytransaction/api/webpay/v1.2/transactions/{token}` (commit) para confirmar; la respuesta incluye autorizaciones por cada `detail`.

Snippet Node.js (axios):
```js
const axios = require('axios');
const TBK = process.env.TBK_BASE_URL;
const headers = {
  'Tbk-Api-Key-Id': process.env.TBK_API_KEY_ID,
  'Tbk-Api-Key-Secret': process.env.TBK_API_KEY_SECRET,
  'Content-Type': 'application/json'
};

async function createMallTx(payload) {
  const { data } = await axios.post(`${TBK}/rswebpaytransaction/api/webpay/v1.2/transactions`, payload, { headers });
  return data; // { token, url }
}

async function commitMallTx(token) {
  const { data } = await axios.put(`${TBK}/rswebpaytransaction/api/webpay/v1.2/transactions/${token}`, {}, { headers });
  return data; // detalle de autorizaciones por comercio
}
```

Validaciones: la suma de `details.amount` debe coincidir con el total cobrado; `buy_order` debe ser único por comercio.

---

### 5) Modelo de Datos (propuesta mínima)

- `users`
  - `tbk_secondary_code VARCHAR(16)` (NULL si no es vendedor TBK).
  - `tbk_status ENUM('none','pending','active','restricted')`.
- `payments`
  - `gateway ENUM('stripe','tbk')`.
  - `mall_commerce_code VARCHAR(16)`, `secondary_commerce_code VARCHAR(16)`.
  - `tbk_buy_order_mall`, `tbk_buy_order_secondary`, `tbk_token`, `tbk_authorization_code`.
  - `amount`, `commission_amount`, `provider_amount`, `currency`, `status`.
- `tbk_secondary_shops`
  - `id`, `provider_id`, `codigo_comercio_secundario`, `status`, `raw JSON`, `created_at/updated_at`.

Notas: mantener idempotencia con `buy_order` único por ítem y correlación contra `payments`.

---

### 6) Backend (endpoints sugeridos)

- Proveedor (TBK onboarding)
  - `POST /providers/:id/tbk/secondary/create` → crea comercio secundario, guarda `tbk_secondary_code`.
  - `GET /providers/:id/tbk/secondary/status` → estado + datos operativos.
  - `DELETE /providers/:id/tbk/secondary/:code` → baja con motivo.

- Checkout TBK Mall
  - `POST /tbk/mall/transactions` → crea transacción (arma `details` con proveedor + comisión).
  - `POST /tbk/mall/commit` → recibe `token_ws` y confirma.
  - `GET /tbk/mall/status/:token` → estado/consulta.
  - `POST /tbk/mall/refund` → reembolsos parciales/total (mall/tienda según política).

Middleware comunes: autenticación JWT, validación de rol (cliente/proveedor), trazabilidad (requestId), logs sin PII sensible.

---

### 7) Variables de Entorno

```
TBK_MALL_COMMERCE_CODE=5970YYYYYYYY
TBK_API_KEY_ID=...
TBK_API_KEY_SECRET=...
TBK_BASE_URL=https://webpay3gint.transbank.cl   # integración
TBK_RETURN_URL=https://app.adomiapp.cl/tbk/retorno
TBK_FINAL_URL=https://app.adomiapp.cl/tbk/final
TBK_PLATFORM_CHILD_CODE=5970ZZZZZZZZ  # comercio hijo de la plataforma para la comisión
```

Para Comercios Secundarios (si usan credenciales distintas):
```
TBK_SEC_API_BASE=https://.../comercios-secundarios
TBK_SEC_API_KEY_ID=...
TBK_SEC_API_KEY_SECRET=...
```

---

### 8) Estrategia de Comisión y Split

- Comisión plataforma: calcular en backend (porcentaje o fijo) → `details` incluye ítem del mall por la comisión.
- Redondeos CLP: enteros; validar que `sum(details.amount) == total`.
- Múltiples tiendas: un `detail` por tienda del carrito + uno para la comisión del mall (si se cobra en el mismo cargo).

---

### 9) Seguridad y Cumplimiento

- Firmas HMAC según TBK (API Key ID/Secret), TLS, validación de orígenes.
- Auditoría: persistir request/response seguros (sin PAN), requestId, estados.
- Anti-fraude: reglas internas (monto tope, listas grises), validación de RUT/razón social al crear secundario.

---

### 10) QA y Pruebas

- Ambientes TBK: Integración (INT) → Certificación (CERT) → Producción (PROD).
- Casos:
  - Split 1 tienda + mall, split 2+ tiendas + mall.
  - Rechazo tarjeta, reversa, reembolso parcial por tienda.
  - Idempotencia de `buy_order` y reintentos de `commit`.
- Trazas: log de token_ws, status de commit, códigos de autorización.

---

### 11) Roadmap de Implementación (resumen)

1) Habilitar productos TBK: Webpay Plus Mall + Comercios Secundarios.
2) Endpoints de onboarding TBK (crear/gestionar comercios secundarios) + columnas BD.
3) Checkout TBK Mall (crear transacción con `details`) + commit/retorno.
4) Reembolsos/consultas + conciliación.
5) UI proveedor (estado TBK) y panel admin (reportes split).
6) QA end-to-end y certificación TBK.

---

### 11.1 Checklist ejecutable (con entregables y criterios de aceptación)

Fase A — Preparación y ambiente
- [ ] Habilitar productos TBK (Mall + Comercios Secundarios) con Transbank.
  - CA: credenciales activas (API Key Id/Secret) y `TBK_MALL_COMMERCE_CODE` confirmados.
- [ ] Configurar envs en backend (`TBK_*`) y feature flag `GATEWAY=stripe|tbk` por proveedor/país.
  - CA: variables presentes en `.env` y carga verificada al inicio.

Fase B — Migraciones BD (idempotentes)
- [ ] Agregar columnas TBK en `users` y `payments` + tabla `tbk_secondary_shops`.
  - CA: SELECTs de verificación retornan columnas/tablas; sin errores.

Fase C — Onboarding Comercios Secundarios
- [x] POST `/providers/:id/tbk/secondary/create` (auth provider) → crea comercio secundario.
  - CA: guarda `tbk_secondary_code` y fila en `tbk_secondary_shops` (raw JSON).
- [x] GET `/providers/:id/tbk/secondary/status` → retorna estado y datos operativos.
  - CA: refleja campos de TBK y BD.
- [x] DELETE `/providers/:id/tbk/secondary/:code` → baja con motivo.
  - CA: estado actualizado y registro en auditoría.

Fase D — Checkout Mall
- [x] POST `/tbk/mall/transactions` → arma `details[]` (proveedor + comisión Mall) y crea transacción.
  - CA: retorna `{ token, url }`, logs/auditoría guardados.
- [x] POST `/tbk/mall/commit` (retorno) → confirma transacción y persiste autorizaciones.
  - CA: actualiza `payments` (gateway=tbk, montos, códigos, status) y registros por detail.
- [x] GET `/tbk/mall/status/:token` → consulta estado.
  - CA: responde estados coherentes con TBK.
- [x] POST `/tbk/mall/refund` → reembolso total/parcial por `commerce_code`.
  - CA: persiste referencias y estados de reembolso.

Fase E — Operación, conciliación y QA
- [ ] Reportes de conciliación: split Mall/Tiendas vs `payments` internos.
  - CA: export CSV por rango con totales y desglose.
- [ ] Batería de pruebas INT/CERT (casos sección 10).
  - CA: resultados documentados y listos para certificación.

---

### 11.2 SQL idempotente (aplicar solo si faltan)

Verificación previa (ejecutar y revisar resultados vacíos):
```sql
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='tbk_secondary_code';
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='tbk_status';

SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='gateway';
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='mall_commerce_code';
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='secondary_commerce_code';
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='tbk_buy_order_mall';
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='tbk_buy_order_secondary';
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='tbk_token';
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='tbk_authorization_code';

SHOW TABLES LIKE 'tbk_secondary_shops';
```

Altas (ejecutar solo las que falten):
```sql
-- users
ALTER TABLE users ADD COLUMN tbk_secondary_code VARCHAR(16) NULL;
ALTER TABLE users ADD COLUMN tbk_status ENUM('none','pending','active','restricted') NULL DEFAULT 'none';

-- payments
ALTER TABLE payments ADD COLUMN gateway ENUM('stripe','tbk') NULL AFTER payment_method;
ALTER TABLE payments ADD COLUMN mall_commerce_code VARCHAR(16) NULL AFTER gateway;
ALTER TABLE payments ADD COLUMN secondary_commerce_code VARCHAR(16) NULL AFTER mall_commerce_code;
ALTER TABLE payments ADD COLUMN tbk_buy_order_mall VARCHAR(255) NULL AFTER secondary_commerce_code;
ALTER TABLE payments ADD COLUMN tbk_buy_order_secondary VARCHAR(255) NULL AFTER tbk_buy_order_mall;
ALTER TABLE payments ADD COLUMN tbk_token VARCHAR(255) NULL AFTER tbk_buy_order_secondary;
ALTER TABLE payments ADD COLUMN tbk_authorization_code VARCHAR(50) NULL AFTER tbk_token;

-- índices opcionales
CREATE INDEX idx_payments_gateway ON payments (gateway);
CREATE INDEX idx_payments_tbk_orders ON payments (tbk_buy_order_mall, tbk_buy_order_secondary);

-- tbk_secondary_shops (auditoría de onboarding)
CREATE TABLE IF NOT EXISTS tbk_secondary_shops (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL,
  codigo_comercio_secundario VARCHAR(16) NOT NULL,
  status ENUM('pending','active','restricted','deleted') NOT NULL DEFAULT 'pending',
  raw JSON NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  KEY idx_provider_status (provider_id, status),
  CONSTRAINT fk_tbkss_provider FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

### 11.3 Estado de implementación (código y rutas)

- Módulo TBK creado y montado:
  - `backend/src/modules/tbk/index.ts` (setup)
  - Registrado en `backend/src/app.ts`
- Onboarding Comercios Secundarios (implementado):
  - `POST /providers/:id/tbk/secondary/create`
  - `GET /providers/:id/tbk/secondary/status`
  - `DELETE /providers/:id/tbk/secondary/:code`
- Webpay Plus Mall (implementado):
  - `POST /tbk/mall/transactions`
  - `POST /tbk/mall/commit`
  - `GET /tbk/mall/status/:token`
  - `POST /tbk/mall/refund`
- Persistencia mínima en `payments` (gateway=tbk, órdenes y token) y auditoría en `tbk_secondary_shops`.
- Pending: aplicar migraciones SQL (11.2), configurar envs `TBK_*`, probar en INT/CERT y armar reportes/conciliación.

### 12) Migración desde Stripe (cuando aplique)

- Mantener feature flag `GATEWAY=stripe|tbk` por proveedor/país.
- Reutilizar modelo de `payments` agregando campos TBK.
- Adaptar checkout del front: si `GATEWAY=tbk`, redirigir a Webpay; si `stripe`, usar Checkout Stripe.

---

### 13) Referencias

- Transbank Developers (Webpay Plus Mall y Comercios Secundarios).
- Políticas de seguridad PCI DSS (no almacenar PAN).

---

### 14) Dónde encontrar la documentación oficial (no existe un único “Split Payments”)

- Webpay Plus Mall (split de pagos en `details[]`). Ver producto Webpay y su variante Mall en Transbank Developers. Ejemplo y flujo de creación de transacción: [proyecto ejemplo PHP – Webpay Mall (create)](https://proyecto-ejemplo-php.transbankdevelopers.cl/webpay-mall/create)
- Oneclick Mall (tarjetas en un clic, también Mall). Referencia de producto: [Webpay / Oneclick Mall](https://www.transbankdevelopers.cl/producto/webpay#oneclick-mall)
- API Comercios Secundarios (gestión de vendedores): buscar “Comercios Secundarios” en el portal/API TBK (portal.api.tbk.cl) para `POST/GET/PUT/DELETE /comercios-secundarios` y el `codigoComercioSecundario` que debe guardarse en BD.

Notas:
- El “split” se logra combinando la creación de comercios secundarios (IDs por vendedor) y la transacción Mall con `details` que apuntan a cada `commerce_code`.
- Usar ambientes INT/CERT antes de PROD; mantener feature flag `GATEWAY=tbk` para activar el flujo por país/proveedor.


ta del vendedor
Proveedor se registra en Adomi.
Backend crea “Comercio Secundario” en TBK (POST /comercios-secundarios).
TBK devuelve codigoComercioSecundario (5970XXXXXXXX) → se guarda en el perfil del proveedor.
Armar el cobro (carrito/cita)
Cliente confirma compra.
Backend calcula split: monto proveedor y comisión del mall.
Crea transacción Webpay Plus Mall (POST /webpay…/transactions) con details[]:
detail 1: { amount: neto proveedor, commerce_code: codigoComercioSecundario, buy_order: unico }
detail 2: { amount: comisión, commerce_code: mall_commerce_code, buy_order: unico }
TBK responde { token, url }.
Pago del cliente
Front redirige a url de TBK con token.
Cliente paga en TBK.
Retorno y confirmación
TBK redirige a return_url con token_ws.
Backend hace commit (PUT /webpay…/transactions/{token}) y obtiene autorizaciones por cada detail.
Persiste pago: total, montos por comercio, códigos de autorización, estado.
Resultado y conciliación
Si autorizado: muestra éxito y actualiza estados (provider_amount, commission_amount).
Reportes/conciliación: cuadrar montos mall vs secundarios con los logs de TBK.
Reembolsos/errores
Reembolso total/parcial vía endpoints TBK, indicando qué commerce_code afecta.
Manejar rechazos/timeout replicando estado en BD y mostrando mensaje al usuario.
Seguridad/operación
Firmas HMAC (Api-Key-Id/Secret), idempotencia con buy_order único por commerce_code.
Feature flag para seleccionar gateway (tbk vs stripe) por país/proveedor.

---

### 15) Implementado en Adomi (resumen práctico)

- Variables de entorno (INT/CERT de ejemplo ya probadas):
  - `TBK_BASE_URL=https://webpay3gint.transbank.cl`
  - `TBK_MALL_COMMERCE_CODE=597055555535`
  - `TBK_API_KEY_ID=597055555535`
  - `TBK_API_KEY_SECRET=579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C`
  - `TBK_RETURN_URL=https://adomiapp.com/tbk/return`
  - `TBK_PLATFORM_CHILD_CODE=597055555537`
  - `PUBLIC_BASE_URL=https://adomi.impactrenderstudio.com`

- BD (aplicado):
  - `users.tbk_secondary_code`, `users.tbk_status`.
  - `payments.gateway='tbk'`, `tbk_token`, `tbk_buy_order_mall`, `tbk_buy_order_secondary`, `mall_commerce_code`, `secondary_commerce_code`.
  - Índices de agenda y TBK (mejoran consultas/conciliación).
  - `platform_settings`: `default_commission_rate`, `default_tax_rate` (usadas para cálculo de split).

- Backend (montado y operativo):
  - `POST /tbk/mall/transactions`: ahora acepta `{ appointment_id }` (recomendado). Calcula montos (comisión y neto proveedor) leyendo `platform_settings` y `appointments.price`. Genera `details[]` Mall + Secundario y persiste intento en `payments`.
  - `POST /tbk/mall/commit`: confirma con `token_ws` y actualiza estado/autorizarciones.
  - `GET /tbk/mall/status/:token`, `POST /tbk/mall/refund` listos.
  - Onboarding secundarios (`/providers/:id/tbk/secondary/*`) listo; en INT se pueden usar códigos de prueba (p.ej. 597055555536/597055555537) asignados a `users.tbk_secondary_code`.

- Lógica de split (implementación):
  - `total = appointments.price`.
  - `base = IVA > 0 ? round(total / (1 + IVA/100)) : total`.
  - `commission = round(base × commissionRate/100)`.
  - `providerAmount = total − commission`.
  - `details = [ { amount: providerAmount, commerce_code: tbk_secondary_code }, { amount: commission, commerce_code: TBK_PLATFORM_CHILD_CODE } ]`.
  - Si no hay `TBK_PLATFORM_CHILD_CODE` o la comisión es 0, se envía un solo `detail` al `tbk_secondary_code` del proveedor por el total.

- Frontend (cliente):
  - “Mis Reservas” → botón Pagar llama `POST /tbk/mall/transactions` con `{ appointment_id }` y redirige a la `url` de TBK.
  - Ruta de retorno `GET /tbk/return`: lee `token_ws`, llama `POST /tbk/mall/commit` y vuelve a `/client/reservas`.

- Prueba E2E (INT/CERT):
  1) Asegurar `users.tbk_secondary_code` para el proveedor (en INT: 597055555536/597055555537).
  2) Crear cita confirmada con `price > 0`.
  3) En “Mis Reservas” del cliente, presionar “Pagar” → TBK.
  4) Completar con tarjeta de prueba (VISA 4051 8856 0044 6623, CVV 123, fecha cualquiera).
  5) Retorno `token_ws` → commit → verificar `payments.status='completed'`, montos `commission_amount` y `provider_amount` correctos.

- Producción (cuando TBK apruebe):
  - Cambiar `TBK_BASE_URL=https://webpay3g.transbank.cl` y usar `TBK_MALL_COMMERCE_CODE`, `TBK_API_KEY_ID/SECRET` productivos entregados por Transbank.
  - Registrar `TBK_RETURN_URL` en la configuración del comercio y validar con una venta real de $50 (requisito de TBK).



  n el backend, el split se arma al crear la transacción TBK Mall (POST /tbk/mall/transactions) así:
Se recibe appointment_id.
Se lee el precio de la cita y los parámetros de platform_settings:
default_tax_rate (IVA, p.ej. 19)
default_commission_rate (p.ej. 15)
Se calcula:
base = IVA > 0 ? round(total/(1+IVA/100)) : total
comisión = round(base × comisión%)
netoProveedor = total − comisión
Se construye la transacción Mall con 2 detalles:
detalle 1 → commerce_code = tbk_secondary_code del proveedor, amount = netoProveedor
detalle 2 → commerce_code = TBK_PLATFORM_CHILD_CODE, amount = comisión
Se inserta un registro en payments con: amount total, commission_amount, provider_amount, gateway='tbk', buy_orders, tbk_token, y status ‘pending’.
Al volver de TBK, el front llama POST /tbk/mall/commit con token_ws. El backend confirma y actualiza payments.status (pasa a ‘completed’ si autorizado).
Configuración dinámica:
Cambias comisión/IVA en platform_settings sin tocar código.
Cada proveedor debe tener su tbk_secondary_code activo para recibir su tramo del split.
A futuro se puede extender a comisión por proveedor o por servicio (nueva tabla o columnas específicas) y el cálculo se ajusta antes de armar los dos detalles.
