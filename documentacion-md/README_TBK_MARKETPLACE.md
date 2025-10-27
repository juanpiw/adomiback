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


