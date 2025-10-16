# Chat y Mensajería en Adomi (Guía de Implementación)

Objetivo: Implementar un sistema de chat 1-a-1 en tiempo real entre cliente y proveedor, con soporte de conversaciones, mensajes, lectura/no leídos, vista previa del último mensaje y notificaciones en vivo. Esta guía define lo que hay hoy, lo que falta y cómo implementarlo paso a paso.

## 1) Estado actual

- Frontend UI:
  - Cliente: `app/client/pages/conversaciones` usando `ChatContainerComponent` para listar y mostrar mensajes.
  - Proveedor: `app/dash/pages/mensajes` con la misma base de componentes.
  - Acciones emitidas: `sendMessage`, `selectConversation`, `searchConversations`, etc. Falta wiring a datos reales.

- Backend:
  - No hay endpoints de chat aún. Existe `backend/src/modules/chat/index.ts` como esqueleto.
  - No hay WebSocket/socket.io inicializado.
  - Roadmap y documentación señalan endpoints y tablas requeridas.

## 2) Requisitos funcionales

- Conversaciones 1-a-1 (cliente ↔ proveedor)
- Mensajes con timestamp y estado leído/no leído
- Contador de no leídos por conversación
- Vista previa del último mensaje en la lista
- Envío/recepción en tiempo real (socket.io), con fallback polling opcional
- Regla de negocio: el botón "Enviar mensaje" del panel de agendamiento debe habilitarse solo tras tener cita confirmada (temporalmente activo para pruebas)

## 3) Modelo de datos (DB)

Tablas mínimas:

- conversations
  - id INT PK AUTO_INCREMENT
  - client_id INT NOT NULL (FK users.id)
  - provider_id INT NOT NULL (FK users.id)
  - created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  - updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  - UNIQUE KEY unique_client_provider (client_id, provider_id)

- messages
  - id INT PK AUTO_INCREMENT
  - conversation_id INT NOT NULL (FK conversations.id)
  - sender_id INT NOT NULL (FK users.id)
  - receiver_id INT NOT NULL (FK users.id)
  - content TEXT NOT NULL
  - created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  - read_at TIMESTAMP NULL
  - INDEX idx_conversation_created_at (conversation_id, created_at)

Opcional: message_attachments (id, message_id, url, mime_type, size)

Validaciones:
- Los usuarios deben existir y roles válidos (cliente/proveedor)
- sender_id debe ser o el cliente o el proveedor de la conversación

## 4) Endpoints REST

Base: sin prefijo adicional (montados en raíz según arquitectura actual).

- POST `/conversations`
  - Body: { client_id: number, provider_id: number }
  - Lógica: buscar existente por (client_id, provider_id) o crear si no existe; devolver conversación

- GET `/conversations/user/:userId`
  - Devuelve conversaciones del usuario (cliente o proveedor), con último mensaje y contadores no leídos

- GET `/conversations/:id/messages?limit=50&before=<ts>`
  - Lista mensajes (paginado, ordenados por created_at DESC)

- POST `/messages`
  - Body: { conversation_id, content }
  - Lógica: validar ownership; crear mensaje; emitir evento socket `message:new`; actualizar preview

- PATCH `/messages/:id/read`
  - Marca como leído (read_at = NOW()) si el current user es el receiver

- GET `/messages/unread/count`
  - Devuelve contador de no leídos por conversación o total

Notas:
- Auth por JWT (header Authorization). Usar `authenticateToken` existente.
- Responder con shape amigable para el front: ids, nombres básicos, último mensaje, unreadCount.

### 4.1) Ejemplos de uso (curl)

Crear/obtener conversación:
```bash
curl -X POST "$API_BASE/conversations" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"client_id": 101, "provider_id": 37}'
```

Listar conversaciones del usuario:
```bash
curl "$API_BASE/conversations/user/37" -H "Authorization: Bearer $TOKEN"
```

Listar mensajes de una conversación:
```bash
curl "$API_BASE/conversations/1/messages?limit=50" -H "Authorization: Bearer $TOKEN"
```

Enviar mensaje:
```bash
curl -X POST "$API_BASE/messages" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"conversation_id": 1, "receiver_id": 101, "content": "Hola!"}'
```

Marcar leído:
```bash
curl -X PATCH "$API_BASE/messages/55/read" -H "Authorization: Bearer $TOKEN"
```

## 5) Tiempo real (socket.io)

Inicialización:
- Agregar socket.io en `server-new.ts` o un módulo `lib/websocket.ts`:
  - Crear `const io = new Server(httpServer, { path: '/socket.io', cors: ... })`
  - Middleware de auth: validar JWT en `auth` o en evento `connection` (token en query o header)

Eventos propuestos:
- `connection` / `disconnect`
- `join`: { conversationId } → unir sala `conversation:<id>`
- `message:new`: emitido por server al crear un mensaje → a sala de la conversación
- `message:read`: notificar lectura
- `typing:start` / `typing:stop` (opcional)

Seguridad:
- Validar que el usuario que hace `join` pertenece a la conversación

## 6) Frontend (servicio de chat)

Crear `ChatService` con:
- REST: crear/listar conversaciones, listar mensajes, enviar mensaje, marcar leído
- Socket: conectar con token, `join` a una conversación activa, escuchar `message:new`, emitir `read`
- Reintentos y reconexión con backoff

Integración con UI:
- Cliente: `ConversacionesComponent`
  - Cargar conversaciones en `ngOnInit`
  - Al seleccionar conversación: cargar mensajes, `join` a sala; actualizar a tiempo real
  - Al enviar: POST `/messages`, socket notificará al otro peer

- Proveedor: `DashMensajesComponent` con la misma lógica

## 7) Reglas de negocio (botón "Enviar mensaje")

- Estado temporal: habilitado para pruebas
- Objetivo: habilitar solo si existe una cita confirmada entre las partes (verificar en backend: `appointments` por provider_id/client_id con estado `confirmed` y ventana de vigencia)

## 8) Migraciones

Crear migraciones SQL para `conversations` y `messages`. Incluir índices y claves foráneas. Añadir scripts de `run-migration.js`.

## 9) Despliegue y configuración

- CORS para `/socket.io` y REST
- HTTPS obligatorio en producción
- Path de socket: `/socket.io` (por defecto), configurar LB con sticky sessions si hay múltiples réplicas
- Variables de entorno: `SOCKET_PATH`, `SOCKET_CORS_ORIGINS`

## 10) Pruebas

- Unit tests: repositorios/servicios de chat (crear/listar conversaciones, enviar mensaje, marcar leído)
- Integración: endpoints REST
- E2E (manual o Cypress): flujo cliente↔proveedor enviando/recibiendo en tiempo real

## 11) Roadmap incremental

1. DB + migraciones (conversations/messages)
2. Endpoints REST mínimos (crear/listar/enviar)
3. Socket.io server (join + message:new)
4. Front ChatService (REST + socket)
5. Wiring UI cliente y proveedor
6. Marcado de leído + contadores + previews
7. Guard del botón "Enviar mensaje" según cita confirmada
8. Notificaciones (push/web) opcional

---

Esta guía es la referencia canónica. Cualquier cambio de alcance debe reflejarse aquí antes de implementarse.

## 12) Schema delta v1 (DDL exacto)

Aplicar como migraciones nuevas (no alterar históricas). Este delta crea las tablas mínimas para chat.

```sql
-- conversations: una por par (cliente, proveedor)
CREATE TABLE IF NOT EXISTS conversations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  provider_id INT NOT NULL,
  last_message_id INT NULL,
  last_message_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_conv_client FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_conv_provider FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_client_provider (client_id, provider_id),
  INDEX idx_last_message_at (last_message_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- messages: mensajes de cada conversación
CREATE TABLE IF NOT EXISTS messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NOT NULL,
  sender_id INT NOT NULL,
  receiver_id INT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP NULL,

  CONSTRAINT fk_msg_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_msg_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_msg_receiver FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_conversation_created_at (conversation_id, created_at),
  INDEX idx_receiver_unread (receiver_id, read_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Sugerencias (futuras optimizaciones, no bloqueantes):
- Denormalizar en `conversations` campos `last_message_preview` (VARCHAR(255)) y `unread_count_client` / `unread_count_provider` para listar más rápido.
- Trigger o actualización en servicio para mantener `last_message_id/at` y previsualización.


