## Agenda y Sistema de Citas – Objetivos y Alcance

### Objetivo general
Diseñar e implementar un sistema integral de agenda y gestión de citas (booking) que permita a clientes agendar servicios con proveedores y a los proveedores administrar su calendario (mes/día), con disponibilidad horaria, reglas de solape, estados de cita, y actualizaciones en tiempo real.

### Objetivos específicos
- Habilitar al cliente para:
  - Seleccionar un servicio del proveedor, una fecha disponible y un horario libre.
  - Confirmar la cita y recibir feedback inmediato.
  - Enviar mensajes al proveedor (chat existente) como acción complementaria.
- Habilitar al proveedor para:
  - Visualizar su agenda mensual y el detalle diario.
  - Crear/editar/cancelar citas desde la UI de agenda.
  - Configurar disponibilidad semanal (bloques activos) y ver franjas disponibles.
- Backend:
  - Proveer endpoints REST robustos para crear/listar/editar/eliminar citas.
  - Calcular “time slots” disponibles a partir de disponibilidad semanal y citas existentes.
  - Emitir eventos en tiempo real (Socket) para notificar a cliente/proveedor sobre nuevas citas y cambios de estado.
- Frontend:
  - Conectar componentes existentes de booking y agenda a los endpoints REST.
  - Manejar estado, validación y toasts de feedback.

## Alcance funcional

### Flujos UX (resumen)
- Cliente (booking panel):
  1) Elegir servicio → 2) Elegir fecha → 3) Cargar horarios libres (time slots) → 4) Elegir hora → 5) Confirmar cita.
  - Atajo “Enviar un mensaje” abre chat con el proveedor.
- Proveedor (agenda):
  - Vista mensual con eventos tipados (cita/descanso/bloqueado) y colores.
  - Vista de detalle diario con lista ordenada por hora, y modal para crear una cita manual.
  - Soporte para cambios de estado (programada, confirmada, completada, cancelada) y eliminación.

### Componentes frontend involucrados
- `libs/shared-ui/booking-panel/booking-panel.component.*` (cliente): expone eventos `serviceSelected`, `dateSelected`, `timeSelected`, `bookingConfirmed`.
- `libs/shared-ui/calendar-mensual/*` y `libs/shared-ui/day-detail/*` (proveedor): emiten `citaCreated` y manejan navegación mes/día.
- Contenedores:
  - Cliente: página de perfil del proveedor (host del booking panel).
  - Proveedor: `dash/pages/agenda/agenda.component.*` (host de calendario/agenda).
- Nuevo servicio sugerido: `AppointmentsService` (REST + sockets, cliente/proveedor).

## Modelo de datos (propuesto)

### Tabla `appointments`
- `id` INT PK AI
- `provider_id` INT NOT NULL → `users.id` (role='provider')
- `client_id` INT NOT NULL → `users.id` (role='client')
- `service_id` INT NOT NULL → `provider_services.id`
- `date` DATE NOT NULL
- `start_time` TIME NOT NULL
- `end_time` TIME NOT NULL
- `status` ENUM('scheduled','confirmed','completed','cancelled') DEFAULT 'scheduled'
- `notes` TEXT NULL
- `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
- `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
Índices recomendados: `(provider_id, date)`, `(client_id, date)`, `(service_id)`

### Tabla opcional `appointment_status_history` (auditoría)
- `id`, `appointment_id`, `old_status`, `new_status`, `changed_by`, `changed_at`.

## Endpoints REST (contratos)

### Citas
- POST `/appointments`
  - Body: `{ provider_id, client_id, service_id, date: 'YYYY-MM-DD', start_time: 'HH:mm', end_time: 'HH:mm', notes? }`
  - Validaciones: ver sección de reglas y solapes.
  - Respuesta: `{ success: true, appointment }`.

- GET `/appointments` (proveedor)
  - Query: `provider_id` (implícito por JWT), `from` y `to` (ISO) o `month=YYYY-MM`.
  - Respuesta: `{ success: true, appointments: [...] }`.

- GET `/appointments/by-day`
  - Query: `date=YYYY-MM-DD` (del proveedor autenticado).
  - Respuesta: `{ success: true, appointments: [...] }`.

- PUT `/appointments/:id`
  - Body (parcial): `{ status?, date?, start_time?, end_time?, notes? }`.
  - Respuesta: `{ success: true, appointment }`.

- DELETE `/appointments/:id`
  - Respuesta: `{ success: true }`.

### Disponibilidad (time-slots)
- GET `/availability/time-slots`
  - Query: `provider_id`, `date=YYYY-MM-DD`, `service_id`.
  - Respuesta: `{ success: true, time_slots: [{ time: 'HH:mm', is_available: boolean }] }`.

## Reglas de negocio y validaciones

1) Pertenencia y roles
   - `service_id` debe pertenecer al `provider_id`.
   - Cliente y proveedor deben existir y estar activos.

2) Duración y ventanas
   - Duración = `provider_services.duration_minutes`.
   - `end_time = start_time + duration`.

3) Solapes
   - Una cita no puede solaparse con otra del mismo proveedor: `[start_time, end_time)`.
   - Debe estar dentro de un bloque activo de disponibilidad semanal (día/horario) y no chocar con “descansos/bloqueos” si aplican.

4) Estados
   - Ciclo: `scheduled → confirmed → completed` o `scheduled/confirmed → cancelled`.
   - Cambios de estado deben registrarse (opcional auditoría).

5) Zonas horarias
   - Definir TZ del servidor; formatear en frontend con la misma base.

## Cálculo de time slots (resumen)

Entrada: `provider_id`, `date`, `service_id`.
1) Consultar disponibilidad semanal del proveedor para ese día (bloques activos).
2) Tomar duración del servicio.
3) Generar slots discretizando el bloque: `start`..`end` con step = duración.
4) Restar citas existentes del día (no permitir solape) y excepciones/bloqueos si existieran.
5) Retornar slots con `is_available=true`.

Edge cases: solapamientos parciales, márgenes de setup/cleanup (si en futuro se requiere), primeros/últimos minutos del día.

## Tiempo real (Socket)

- Rooms: `user:{provider_id}` y `user:{client_id}`.
- Eventos (implementados):
  - `appointment:created` (cuando se crea una cita)
  - `appointment:updated` (cambios de estado/horario)
  - `appointment:deleted` (cancelación/eliminación)
- Frontend:
  - Cliente: (pendiente) badge/toast opcional.
  - Proveedor: refrescar lista del día/mes en vivo (implementado).

## Integración Frontend

### Cliente – Booking Panel
- Al seleccionar servicio/fecha: llamar `GET /availability/time-slots` para poblar horarios. (implementado)
- Al confirmar: `POST /appointments`; modal con loading/errores; inserta snapshot de `price`. (implementado)
- Fallback: si no hay slots, `<input type="time">` manual. (implementado)

### Proveedor – Agenda
- `AgendaComponent` (contenedor):
  - Mes: `GET /appointments?month=YYYY-MM` → mapear a `CalendarEvent`. (implementado)
  - Día: `GET /appointments/by-day?date=YYYY-MM-DD` → lista en `DayDetail` (incluye `client_name`). (implementado)
  - Acciones: confirmar (PATCH status) y escucha realtime para actualizar en memoria. (parcial: endpoint listo; UI pendiente)

## Seguridad y permisos
- JWT obligatorio.
- Reglas de acceso:
  - Cliente solo puede crear/eliminar/consultar sus citas; no puede ver citas de otros clientes.
  - Proveedor solo puede ver/gestionar citas donde `provider_id` = su usuario.

## Errores y manejo en UI
- 400 Validación: servicio inválido, duración fuera de rango, slot no disponible.
- 403 Permisos insuficientes.
- 404 Recurso no encontrado.
- 409 Conflicto por solape.
- 500 Error inesperado.
Frontend: mapear a toasts claros; en 409 sugerir seleccionar otro horario.

## Migración y despliegue

1) DDL – crear tabla `appointments` (y opcional `appointment_status_history`).
2) Implementar rutas y validaciones; pruebas unitarias y de integración.
3) Conectar frontend (AppointmentsService) y reemplazar mocks.
4) Tiempo real: unir a `user:{id}` en layouts y reaccionar a eventos.
5) Despliegue: migraciones DB + backend + frontend; smoke test con 2 usuarios.

## Roadmap incremental
- Fase 1: CRUD de citas + time slots + agenda mensual/diaria.
- Fase 2: Estados de confirmación y recordatorios.
- Fase 3: Bloques/pausas administrables y excepciones.
- Fase 4: Integración pagos/depósitos (si aplica) y recordatorios push/email.

## Preguntas abiertas
- ¿Se requieren buffers (tiempo de preparación) entre citas por servicio?
- ¿Se permite double-booking intencional (overbooking) en algún caso?
- ¿Recordatorios automáticos (email/push) y a qué horas?
- ¿Política de cancelación y reembolsos (si se integra pagos)?

## Referencias internas
- Booking panel (cliente): `libs/shared-ui/booking-panel/*`
- Agenda (proveedor): `libs/shared-ui/calendar-mensual/*`, `libs/shared-ui/day-detail/*`
- Servicios del proveedor (duración/precio): `backend/src/modules/provider/routes/provider-services.routes.ts`

---

## Implementación en curso (estado actual)

- Backend
  - Rutas de citas implementadas: `POST /appointments`, `GET /appointments`, `GET /appointments/by-day`, `PATCH /appointments/:id/status`, `DELETE /appointments/:id`.
  - Rutas cliente: `GET /client/appointments` (lista citas del cliente autenticado).
  - Time-slots: `GET /availability/time-slots` (placeholder 09:00–18:00, resta citas del día, usa duración del servicio).
  - Respuestas enriquecidas: `client_name`/`provider_name`/`service_name` donde aplica.
  - Realtime citas: emite `appointment:created|updated|deleted` a `user:{provider_id}` y `user:{client_id}`.
  - ✅ **Nuevo:** `client_reviews` para que el proveedor califique clientes:
    - `POST /provider/clients/:clientId/reviews` (requiere cita `completed` sin reseña previa).
    - `GET /provider/clients/:clientId/reviews` → `{ summary: { average, count }, reviews: [...] }`.
    - `GET /provider/clients/:clientId/reviewable-appointments` → citas completadas sin reseña (máx 50).
    - Agregados en `client_profiles`: `client_rating_average`, `client_review_count`.
    - `GET /appointments/by-day` ahora expone `client_review_id` para ocultar CTA “Calificar” cuando corresponda.
  - ✅ **Nuevo:** Concurrencia First-to-Commit:
    - Índice único `uq_appointments_provider_slot_active` + columna generada `slot_active` para bloquear slots activos.
    - Inserción de citas envuelta en transacción con `SELECT ... FOR UPDATE`; colisiones devuelven `409 SLOT_TAKEN`.
    - Logs estructurados `[SLOT_TAKEN]` con `context` = `preflight | transaction_lock | constraint_violation`.
    - Script de regresión: `npm run test:appointments` dispara dos POST paralelos y valida que solo persista una cita.

- Frontend
  - AppointmentsService: REST + sockets (falta exponer listClientAppointments/updateStatus en servicio; en curso).
  - Booking Panel: validaciones, hora manual, modal con loading/errores y cierre controlado, creación con `price`. (implementado)
  - Perfil del trabajador: consume slots y create; UI lista. (implementado)
  - Agenda proveedor: carga mes/día, escucha realtime y preselecciona hoy. (implementado). Falta botón Confirmar (UI) → PATCH status.
  - Mis Reservas: pendiente wiring para listar citas del cliente y mostrar estados “Esperando confirmación / Esperando pago (Pagar) / Pasadas / Canceladas”.
  - ✅ **Nuevo:** Agenda y perfil del cliente integran reseñas de clientes:
    - Botón “Calificar cliente” en `DayDetailComponent` cuando la cita está `completed` y sin reseña.
    - `DashAgendaComponent` abre `ReviewModalComponent` reutilizable (texto configurable).
    - Perfil del cliente (`/client/solicitante/:id`) muestra promedio, contador, reseñas recientes y listado de citas calificables.

### Runbook: monitoreo de colisiones `SLOT_TAKEN`
1. **Detección**: filtrar logs por `[SLOT_TAKEN]` y revisar campo `context`.
2. **Métrica rápida** (log aggregator / SQL proxy):
   ```sql
   SELECT JSON_EXTRACT(payload, '$.provider_id') AS provider_id,
          JSON_EXTRACT(payload, '$.date')       AS date,
          COUNT(*)                              AS collisions
     FROM log_events
    WHERE message LIKE '%SLOT_TAKEN%'
      AND created_at >= NOW() - INTERVAL 1 DAY
    GROUP BY 1, 2
    ORDER BY collisions DESC;
   ```
   *(Actualizar el nombre de la tabla según la herramienta de logging).*
3. **Verificación**: abrir agenda del proveedor, revisar disponibilidad publicada y bloqueos manuales.
4. **Respuesta a soporte**: explicar que otro cliente tomó el mismo horario instantes antes; sugerir horarios alternativos (el frontend ya los ofrece en la UI).
5. **Escalamiento**: si el % de colisiones diarias supera 3% de intentos de booking, escalar a Producto para analizar UX de disponibilidad.

### Comunicación de rollout
- Enviar summary a soporte/producto:
  - Nuevo código `SLOT_TAKEN` con mensaje para clientes.
  - Ubicación del log estructurado y comando `npm run test:appointments`.
  - Recordatorio de que el booking panel recomienda alternativas automáticamente.
- Actualizar FAQ interna “No puedo reservar un horario” con pasos para revisar logs y disponibilidad del proveedor.

## Próximos pasos (acciones concretas)

1) Backend – Time-slots (Fase 1.1)
   - Integrar disponibilidad semanal real (bloques activos por día) y descansos/bloqueos.

2) Frontend – Servicios y vistas (Fase 1.1)
   - Extender AppointmentsService con `listClientAppointments()` y `updateStatus()`.
   - /client/reservas: render de listados y CTA "Pagar" cuando `status=confirmed`.
   - /dash/agenda: acción "Confirmar" en detalle del día → `updateStatus('confirmed')`.

3) UX/Toasts (Fase 1.1)
   - Sustituir alert() por toasts; manejar 409 (solape) con explicación y reintento.

4) Realtime (Fase 1.2)
   - Opcional: notificaciones para el cliente al confirmar el proveedor.

## Cambios recientes

- Backend: INSERT de cita guarda snapshot de `price`. Nuevos endpoints `GET /client/appointments` y `PATCH /appointments/:id/status`.
- Frontend: panel de booking validado; hora manual; agenda preselecciona día; realtime citas activo.

## Pruebas (plan mínimo)

- Backend
  - Creación de cita sin solape → 201 y persistencia correcta.
  - Creación con solape → 409 (conflict) y explicación.
  - Cálculo de time-slots para un día con y sin citas previas.

- Frontend
  - Booking: selección servicio/fecha/hora → slots correctos → confirmación → POST → toast y navegación opcional.
  - Agenda: vista mensual muestra eventos, detalle diario ordenado por hora; creación desde modal refresca vistas.


