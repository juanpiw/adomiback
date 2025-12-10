# Oneclick Mall – Flujo y Endpoints (Adomi)

## Objetivo
Permitir inscribir tarjeta (Oneclick Mall) y autorizar cobros Mall a comercios hijos registrados, usando los endpoints REST v1.2 de Transbank. Implementado en backend `backend/src/modules/tbk/routes/tbk-onboarding.routes.ts`.

## Variables de entorno
- `TBK_BASE_URL` (QA: `https://webpay3gint.transbank.cl`, PROD: `https://webpay3g.transbank.cl`)
- Preferidas para Oneclick (evitan choque con Webpay Plus Mall):
  - `TBK_ONECLICK_API_KEY_ID` (o `TBK_ONECLICK_MALL_COMMERCE_CODE`)
  - `TBK_ONECLICK_API_KEY_SECRET`
- Compatibilidad (si no se definen las anteriores, usa `TBK_API_KEY_ID` / `TBK_MALL_COMMERCE_CODE` y `TBK_API_KEY_SECRET`)
- `TBK_ONECLICK_RETURN_URL` (fallback para `responseUrl` en start)

## Endpoints backend (protegidos, provider dueño)
- `POST /providers/:id/tbk/oneclick/inscriptions`
  - Body: `{ email, responseUrl? }`
  - Llama a `POST {TBK_BASE_URL}/rswebpaytransaction/api/oneclick/v1.2/inscriptions`
  - Respuesta: `{ token, url_webpay, userName }`
  - Front debe redirigir a `url_webpay` por POST con `TBK_TOKEN=token`.

- `PUT /providers/:id/tbk/oneclick/inscriptions/:token`
  - Finaliza inscripción (finish). Llama a `PUT .../inscriptions/{token}` (body vacío).
  - Respuesta TBK: incluye `tbk_user`, `authorization_code`, `card_type`, `card_number`, `response_code`.
  - Guardar `username` (el enviado en start) + `tbk_user` para cobros futuros.

- `DELETE /providers/:id/tbk/oneclick/inscriptions`
  - Body: `{ tbk_user, username }`
  - Llama a `DELETE .../inscriptions`. Retorna 204 en TBK.

- `POST /providers/:id/tbk/oneclick/transactions`
  - Body: `{ username, tbk_user, buy_order, details: [{ commerce_code, buy_order, amount, installments_number? }, ...] }`
  - Llama a `POST .../transactions`
  - Respuesta: detalle por sub-transacción. Validar `response_code === 0` y `status === 'AUTHORIZED'` en cada detail.

- `GET /providers/:id/tbk/oneclick/transactions/:buyOrder`
  - Estado de la transacción Mall.

- `POST /providers/:id/tbk/oneclick/transactions/:buyOrder/refunds`
  - Body: `{ commerce_code, detail_buy_order, amount }`
  - Refund/Reverse parcial o total.

- `POST /providers/:id/tbk/oneclick/transactions/capture`
  - Body: `{ commerce_code, buy_order, authorization_code, capture_amount }`
  - Captura diferida (solo si el comercio está configurado para captura diferida).

## Flujo UI resumido
1) Start inscripción → recibir `{ token, url_webpay }` → renderizar form POST a `url_webpay` con `TBK_TOKEN`.
2) TBK devuelve a `responseUrl` con `TBK_TOKEN` → call finish → guardar `tbk_user`, `authorization_code`, últimos 4, tipo de tarjeta.
3) Autorizar pago: enviar `details` con códigos de comercio hijo (el proveedor ingresa su código en la UI) y montos.
4) Consultar estado / refund / capture según necesidad.

## Notas clave
- El parámetro de redirección se llama `TBK_TOKEN` (no `token_ws`).
- Un `username` solo puede tener una inscripción activa: una nueva inscripción invalida la anterior (`tbk_user` viejo).
- Validar cada `detail.response_code` y `detail.status` en las respuestas de authorize/status.
- Headers a TBK: `Tbk-Api-Key-Id`, `Tbk-Api-Key-Secret`, `Content-Type: application/json`.

## Referencias en código
- Rutas: `backend/src/modules/tbk/routes/tbk-onboarding.routes.ts`
- Helpers: `getOneclickHeaders`, `getTbkBase`.

## Reclamos de pago (cliente)
- Endpoint nuevo: `POST /appointments/:id/claims/payment`
  - Body: `{ reason: string; description?: string; evidenceUrls?: string[] }`
  - Marca la cita como `dispute_pending`, congela liberación de pago y crea registro en `appointment_disputes`.
  - Respuesta: `{ success, ticketId }`.


