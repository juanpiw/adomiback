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
- Eventos:
  - `appointment:new` (cuando se crea una cita)
  - `appointment:updated` (cambios de estado/horario)
  - `appointment:cancelled`
- Frontend:
  - Cliente: incrementar badge “Reservas” opcional y mostrar toast.
  - Proveedor: refrescar lista del día/mes si corresponde o actualizar en memoria.

## Integración Frontend

### Cliente – Booking Panel
- Al seleccionar servicio/fecha: llamar `GET /availability/time-slots` para poblar horarios.
- Al confirmar: `POST /appointments`; mostrar toast y opcional navegar a “Mis Reservas”.
- Fallback: si no hay slots, mostrar explicación (no disponibilidad) y CTA para enviar mensaje.

### Proveedor – Agenda
- `AgendaComponent` (contenedor):
  - Mes: `GET /appointments?month=YYYY-MM` → mapear a `CalendarEvent` (type y color).
  - Día: `GET /appointments/by-day?date=YYYY-MM-DD` → lista en `DayDetail`.
  - Crear desde modal → `POST /appointments` y refrescar.
  - Cambios de estado/eliminación → `PUT/DELETE` y refrescar.

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
  - appointments: módulo creado como scaffold (`backend/src/modules/appointments/index.ts`) a la espera de rutas.
  - provider-services: endpoints completos (GET/POST/PUT/DELETE) para duración y precio de servicios (base del cálculo de slots).
  - Realtime: rooms por usuario ya operativas (implementadas para chat) y reutilizables para eventos de citas.

- Frontend
  - Agenda proveedor: componentes listos (`calendar-mensual`, `day-detail`, `modal-agendar-cita`) emiten eventos `citaCreated` y navegación mes/día.
  - Booking panel cliente: listo; se añadió modal de confirmación al pulsar “Agendar Cita”.
  - Servicios listos para reuso: `ProviderProfileService` y `ProviderServicesService` (duración/precio).
  - Pendiente: `AppointmentsService` (REST + tipos) y cableado de agenda/booking a endpoints reales.

## Próximos pasos (acciones concretas)

1) Backend – Rutas de citas (Fase 1)
   - POST `/appointments` (crear)
   - GET `/appointments?month=YYYY-MM` (listar mes)
   - GET `/appointments/by-day?date=YYYY-MM-DD` (listar día)
   - PUT `/appointments/:id` (actualizar estado/horario/notas)
   - DELETE `/appointments/:id` (cancelar/eliminar)

2) Backend – Time-slots (Fase 1)
   - GET `/availability/time-slots?provider_id&date&service_id` (cálculo por disponibilidad semanal + citas existentes + duración del servicio)

3) Frontend – AppointmentsService (Fase 1)
   - Métodos: `listMonth`, `listDay`, `create`, `update`, `delete`, `getTimeSlots`

4) Integración – Agenda proveedor (Fase 1)
   - Cargar mes/día desde REST
   - Crear cita desde modal (POST) y refresco de vista

5) Integración – Booking cliente (Fase 1)
   - Cargar time-slots al seleccionar servicio/fecha
   - Crear cita (POST) al confirmar en el modal de booking

6) Realtime (Fase 2)
   - Eventos `appointment:new|updated|cancelled` a `user:{provider_id}` y `user:{client_id}`

## Cambios recientes

- Modal de confirmación en el Booking Panel (cliente) al pulsar “Agendar Cita”; confirma y emite `bookingConfirmed(summary)`.

## Pruebas (plan mínimo)

- Backend
  - Creación de cita sin solape → 201 y persistencia correcta.
  - Creación con solape → 409 (conflict) y explicación.
  - Cálculo de time-slots para un día con y sin citas previas.

- Frontend
  - Booking: selección servicio/fecha/hora → slots correctos → confirmación → POST → toast y navegación opcional.
  - Agenda: vista mensual muestra eventos, detalle diario ordenado por hora; creación desde modal refresca vistas.


