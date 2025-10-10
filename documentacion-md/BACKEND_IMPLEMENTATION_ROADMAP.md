# 🗺️ Hoja de Ruta de Implementación del Backend - Adomi

## 📋 **Análisis de Complejidad**

### **Perfiles de Usuario**
1. **Trabajador/Proveedor** (Provider) - 🔴 **ALTA COMPLEJIDAD**
   - Gestión completa de perfil público
   - Sistema de verificación de identidad
   - CRUD de servicios con categorías
   - Gestión de agenda y disponibilidad
   - Sistema de promociones
   - Reportes de ingresos y estadísticas
   - Chat con clientes
   - Métodos de pago (recibir dinero)
   
2. **Cliente** (Client) - 🟡 **MEDIA COMPLEJIDAD**
   - Perfil básico
   - Exploración de servicios (GET heavy)
   - Sistema de reservas
   - Favoritos
   - Chat con proveedores
   - Métodos de pago (pagar servicios)
   - Reseñas y calificaciones

## 🎯 **Estrategia de Implementación**

### **Fase 1: Fundación del Proveedor** 🏗️
**Objetivo:** Permitir que el proveedor configure su perfil y ofrezca servicios

#### **1.1. Perfil del Trabajador** (`/dash/perfil`)
**Orden de implementación:**
1. ✅ **GET** - Obtener perfil del proveedor
2. ✅ **PUT** - Actualizar información básica
3. ✅ **POST** - Subir fotos (perfil y portada)
4. ✅ **GET** - Calcular progreso del perfil
5. ✅ **PUT** - Actualizar "Sobre mí"
6. ✅ **PUT** - Actualizar ubicación y disponibilidad

**Dependencias:**
- Tabla `provider_profiles`
- Tabla `provider_photos`
- Tabla `provider_locations`
- Sistema de upload de imágenes (S3 o local)
- Cálculo de completitud del perfil

#### **1.2. Servicios del Trabajador** (`/dash/servicios`)
**Orden de implementación:**
1. ✅ **GET** - Listar servicios del proveedor
2. ✅ **POST** - Crear nuevo servicio
3. ✅ **PUT** - Actualizar servicio existente
4. ✅ **DELETE** - Eliminar servicio
5. ✅ **PATCH** - Reordenar servicios
6. ✅ **GET** - Obtener categorías de servicios

**Dependencias:**
- Tabla `provider_services`
- Tabla `service_categories`
- Validación de precios y duraciones
- Sistema de imágenes para servicios

#### **1.3. Agenda del Trabajador** (`/dash/agenda`)
**Orden de implementación:**
1. ✅ **GET** - Obtener horarios configurados
2. ✅ **PUT** - Actualizar horarios semanales
3. ✅ **POST** - Crear bloque de disponibilidad
4. ✅ **DELETE** - Eliminar bloque de disponibilidad
5. ✅ **POST** - Agregar excepción/feriado
6. ✅ **GET** - Obtener calendario mensual
7. ✅ **GET** - Obtener citas del día

**Dependencias:**
- Tabla `provider_availability`
- Tabla `availability_exceptions`
- Tabla `appointments`
- Lógica de detección de conflictos
- Cálculo de slots disponibles

#### **1.4. Promociones** (`/dash/promocion`)
**Orden de implementación:**
1. ✅ **GET** - Listar promociones activas
2. ✅ **POST** - Crear promoción
3. ✅ **PUT** - Actualizar promoción
4. ✅ **DELETE** - Eliminar promoción
5. ✅ **PATCH** - Activar/desactivar promoción

**Dependencias:**
- Tabla `promotions`
- Validación de fechas de vigencia
- Cálculo de descuentos

#### **1.5. Ingresos y Estadísticas** (`/dash/ingresos`, `/dash/estadisticas`)
**Orden de implementación:**
1. ✅ **GET** - Ingresos del día
2. ✅ **GET** - Ingresos del mes
3. ✅ **GET** - Ingresos por rango de fechas
4. ✅ **GET** - Estadísticas generales (KPIs)
5. ✅ **GET** - Gráfico de ingresos
6. ✅ **GET** - Servicios más populares
7. ✅ **GET** - Reseñas recientes
8. ✅ **GET** - Métricas de rendimiento

**Dependencias:**
- Tabla `appointments` con estados
- Tabla `payments`
- Tabla `reviews`
- Cálculo de comisiones (15%)
- Agregaciones por fecha

### **Fase 2: Operación del Proveedor** 📊
**Objetivo:** Gestionar operaciones diarias del negocio

#### **2.1. Dashboard Principal** (`/dash/home`)
**Orden de implementación:**
1. ✅ **GET** - Solicitudes pendientes de aprobación
2. ✅ **POST** - Aceptar reserva
3. ✅ **POST** - Rechazar reserva
4. ✅ **GET** - Próxima cita
5. ✅ **GET** - Detalles de cita
6. ✅ **GET** - Resumen de ingresos del día/mes
7. ✅ **PATCH** - Cambiar estado online/offline

**Dependencias:**
- Vista agregada de múltiples tablas
- Estados de citas (pending, confirmed, rejected, completed, cancelled)
- Notificaciones push al aceptar/rechazar
- Cálculo de ingresos en tiempo real

#### **2.2. Mensajes** (`/dash/mensajes`)
**Orden de implementación:**
1. ✅ **GET** - Lista de conversaciones
2. ✅ **GET** - Mensajes de conversación
3. ✅ **POST** - Enviar mensaje
4. ✅ **PATCH** - Marcar como leído
5. ✅ **GET** - Contador de no leídos

**Dependencias:**
- Tabla `conversations`
- Tabla `messages`
- WebSocket o polling para tiempo real
- Sistema de notificaciones

### **Fase 3: Funcionalidades del Cliente** 👥
**Objetivo:** Permitir exploración y reserva de servicios

#### **3.1. Exploración** (`/client/explorar`)
**Orden de implementación:**
1. ✅ **GET** - Buscar servicios/profesionales
2. ✅ **GET** - Filtrar por categoría
3. ✅ **GET** - Filtrar por ubicación
4. ✅ **GET** - Filtrar por precio
5. ✅ **GET** - Ordenar resultados (relevancia, rating, precio)
6. ✅ **GET** - Perfil público del trabajador

**Dependencias:**
- Vista `provider_search_view` con JOINs complejos
- Full-text search o Elasticsearch
- Cálculo de distancia geográfica
- Sistema de relevancia y ranking

#### **3.2. Reservas del Cliente** (`/client/reservas`)
**Orden de implementación:**
1. ✅ **POST** - Crear nueva reserva
2. ✅ **GET** - Listar reservas del cliente
3. ✅ **GET** - Detalle de reserva
4. ✅ **PATCH** - Cancelar reserva
5. ✅ **POST** - Dejar reseña
6. ✅ **POST** - Contactar proveedor

**Dependencias:**
- Tabla `appointments`
- Tabla `reviews`
- Validación de disponibilidad
- Sistema de pagos
- Política de cancelación (24h)

#### **3.3. Favoritos** (`/client/favoritos`)
**Orden de implementación:**
1. ✅ **POST** - Agregar a favoritos
2. ✅ **GET** - Listar favoritos
3. ✅ **DELETE** - Eliminar de favoritos
4. ✅ **GET** - Verificar si es favorito

**Dependencias:**
- Tabla `favorites`
- Relación many-to-many (client ↔ provider)

#### **3.4. Perfil del Cliente** (`/client/perfil`)
**Orden de implementación:**
1. ✅ **GET** - Obtener perfil
2. ✅ **PUT** - Actualizar información personal
3. ✅ **POST** - Subir foto de perfil

**Dependencias:**
- Tabla `client_profiles`
- Sistema de upload de imágenes

#### **3.5. Métodos de Pago del Cliente** (`/client/pagos`)
**Orden de implementación:**
1. ✅ **POST** - Agregar tarjeta (Stripe)
2. ✅ **GET** - Listar tarjetas guardadas
3. ✅ **DELETE** - Eliminar tarjeta
4. ✅ **PATCH** - Establecer tarjeta predeterminada
5. ✅ **GET** - Obtener saldo
6. ✅ **GET** - Historial de transacciones

**Dependencias:**
- Integración con Stripe Payment Methods
- Tabla `payment_methods`
- Tabla `transactions`
- Tabla `wallet_balance`

### **Fase 4: Sistemas Transversales** 🔄
**Objetivo:** Funcionalidades compartidas entre perfiles

#### **4.1. Sistema de Chat**
**Orden de implementación:**
1. ✅ **GET** - Conversaciones del usuario
2. ✅ **POST** - Iniciar conversación
3. ✅ **GET** - Mensajes de conversación
4. ✅ **POST** - Enviar mensaje
5. ✅ **PATCH** - Marcar mensajes como leídos
6. ✅ **GET** - Contador de no leídos

**Dependencias:**
- Tabla `conversations`
- Tabla `messages`
- WebSocket para tiempo real (opcional)
- Notificaciones push

#### **4.2. Sistema de Notificaciones**
**Orden de implementación:**
1. ✅ **GET** - Listar notificaciones del usuario
2. ✅ **POST** - Crear notificación
3. ✅ **PATCH** - Marcar como leída
4. ✅ **DELETE** - Eliminar notificación
5. ✅ **GET** - Contador de no leídas

**Dependencias:**
- Tabla `notifications`
- Tipos de notificación por perfil
- Sistema de templates

#### **4.3. Sistema de Reseñas**
**Orden de implementación:**
1. ✅ **POST** - Crear reseña
2. ✅ **GET** - Listar reseñas de proveedor
3. ✅ **PUT** - Actualizar reseña
4. ✅ **DELETE** - Eliminar reseña
5. ✅ **POST** - Responder a reseña (proveedor)

**Dependencias:**
- Tabla `reviews`
- Validación: solo después de cita completada
- Cálculo de rating promedio

## 📊 **Teoría de la Base de Datos**

### **Entidades Core (Ya Existentes)**
```sql
✅ users (id, email, role, stripe_customer_id)
✅ plans (id, name, price, features)
✅ subscriptions (id, user_id, plan_id, status)
✅ plan_expirations (id, user_id, expiration_date)
```

### **Entidades Nuevas Necesarias**

#### **Proveedor (Provider)**
```sql
📋 provider_profiles (perfil completo)
📋 provider_services (servicios ofrecidos)
📋 provider_portfolio (galería de trabajos)
📋 provider_availability (horarios semanales)
📋 availability_exceptions (feriados, días bloqueados)
📋 identity_verifications (KYC, documentos)
📋 provider_locations (zonas de cobertura)
📋 provider_stats (estadísticas agregadas)
```

#### **Cliente (Client)**
```sql
📋 client_profiles (perfil básico)
📋 favorites (favoritos del cliente)
📋 payment_methods (tarjetas guardadas - Stripe)
📋 wallet_balance (saldo del cliente)
```

#### **Operaciones (Shared)**
```sql
📋 appointments (citas/reservas)
📋 appointment_history (cambios de estado)
📋 payments (pagos realizados)
📋 transactions (historial de transacciones)
📋 reviews (reseñas y calificaciones)
📋 review_responses (respuestas del proveedor)
📋 conversations (conversaciones de chat)
📋 messages (mensajes de chat)
📋 notifications (notificaciones del sistema)
```

#### **Configuración (System)**
```sql
📋 service_categories (categorías de servicios)
📋 promotions (promociones activas)
📋 platform_settings (configuración global)
📋 commission_rates (tasas de comisión - 15%)
```

## 🚀 **Plan de Implementación por Prioridad**

### **🥇 PRIORIDAD 1: Perfil y Servicios del Proveedor**
**Razón:** Sin esto, el proveedor no puede ofrecer nada

#### **Endpoints a implementar:**
```
POST   /api/provider/profile          - Crear/actualizar perfil
GET    /api/provider/profile/:id      - Obtener perfil
POST   /api/provider/photos           - Subir fotos (perfil, portada)
GET    /api/provider/completion       - Calcular completitud

POST   /api/provider/services         - Crear servicio
GET    /api/provider/services         - Listar servicios del proveedor
PUT    /api/provider/services/:id     - Actualizar servicio
DELETE /api/provider/services/:id     - Eliminar servicio
PATCH  /api/provider/services/order   - Reordenar servicios

GET    /api/categories                - Listar categorías de servicios
```

**Tablas requeridas:**
- `provider_profiles`
- `provider_services`
- `service_categories`
- `provider_photos`

**Archivos a crear:**
```
backend/src/endpoints/provider-profile.ts
backend/src/endpoints/provider-services.ts
backend/src/queries/provider-profile.ts
backend/src/queries/provider-services.ts
backend/src/validators/provider.validator.ts
```

---

### **🥈 PRIORIDAD 2: Agenda y Disponibilidad**
**Razón:** El proveedor necesita definir cuándo está disponible

#### **Endpoints a implementar:**
```
GET    /api/provider/availability              - Obtener horarios
PUT    /api/provider/availability              - Actualizar horarios semanales
POST   /api/provider/availability/block        - Crear bloque horario
DELETE /api/provider/availability/block/:id    - Eliminar bloque

POST   /api/provider/exceptions                - Crear excepción/feriado
GET    /api/provider/exceptions                - Listar excepciones
DELETE /api/provider/exceptions/:id            - Eliminar excepción

GET    /api/provider/calendar/:year/:month     - Calendario mensual
GET    /api/provider/appointments/:date        - Citas del día
```

**Tablas requeridas:**
- `provider_availability`
- `availability_exceptions`
- `appointments` (básica)

**Archivos a crear:**
```
backend/src/endpoints/provider-availability.ts
backend/src/queries/provider-availability.ts
backend/src/lib/availability-calculator.ts
```

---

### **🥉 PRIORIDAD 3: Sistema de Reservas (Core Business)**
**Razón:** Este es el flujo principal de negocio

#### **Endpoints a implementar:**
```
POST   /api/appointments                       - Crear reserva (cliente)
GET    /api/appointments/provider/:id          - Reservas del proveedor
GET    /api/appointments/client/:id            - Reservas del cliente
GET    /api/appointments/:id                   - Detalle de reserva
PATCH  /api/appointments/:id/accept            - Aceptar reserva (proveedor)
PATCH  /api/appointments/:id/reject            - Rechazar reserva (proveedor)
PATCH  /api/appointments/:id/cancel            - Cancelar reserva (cliente)
PATCH  /api/appointments/:id/complete          - Marcar como completada
GET    /api/appointments/pending               - Solicitudes pendientes

GET    /api/provider/:id/available-slots       - Slots disponibles para reservar
POST   /api/appointments/check-availability    - Verificar disponibilidad
```

**Tablas requeridas:**
- `appointments` (completa con estados)
- `appointment_history` (auditoría de cambios)
- Integración con `provider_availability`
- Integración con `payments`

**Estados de cita:**
```typescript
type AppointmentStatus = 
  | 'pending'      // Esperando aprobación del proveedor
  | 'confirmed'    // Aceptada por el proveedor
  | 'rejected'     // Rechazada por el proveedor
  | 'cancelled'    // Cancelada por el cliente
  | 'completed'    // Servicio completado
  | 'no_show'      // Cliente no se presentó
  | 'in_progress'; // En curso
```

**Archivos a crear:**
```
backend/src/endpoints/appointments.ts
backend/src/queries/appointments.ts
backend/src/lib/appointment-validator.ts
backend/src/lib/slot-calculator.ts
backend/src/validators/appointment.validator.ts
```

---

### **🏅 PRIORIDAD 4: Sistema de Pagos**
**Razón:** Necesario para monetizar las reservas

#### **Endpoints a implementar:**
```
POST   /api/payments/create-intent             - Crear intención de pago (Stripe)
POST   /api/payments/confirm                   - Confirmar pago
GET    /api/payments/client/:id                - Historial de pagos del cliente
GET    /api/payments/provider/:id              - Historial de ingresos del proveedor
POST   /api/payments/refund                    - Reembolsar pago

POST   /api/payment-methods                    - Agregar tarjeta (cliente)
GET    /api/payment-methods/client/:id         - Listar tarjetas del cliente
DELETE /api/payment-methods/:id                - Eliminar tarjeta
PATCH  /api/payment-methods/:id/default        - Establecer como predeterminada

GET    /api/wallet/balance/:userId             - Obtener saldo
POST   /api/wallet/withdraw                    - Solicitar retiro (proveedor)
GET    /api/transactions/:userId               - Historial de transacciones
```

**Tablas requeridas:**
- `payments`
- `payment_methods`
- `wallet_balance`
- `transactions`
- `withdrawals`

**Lógica de comisión:**
```typescript
// Cada pago se divide:
// 85% → Proveedor (wallet_balance)
// 15% → Comisión Adomi (platform_revenue)
```

**Archivos a crear:**
```
backend/src/endpoints/payments.ts
backend/src/endpoints/payment-methods.ts
backend/src/endpoints/wallet.ts
backend/src/queries/payments.ts
backend/src/lib/payment-processor.ts
backend/src/lib/commission-calculator.ts
```

---

### **🎖️ PRIORIDAD 5: Exploración y Búsqueda**
**Razón:** Los clientes necesitan encontrar proveedores

#### **Endpoints a implementar:**
```
GET    /api/search/providers                   - Buscar proveedores
GET    /api/search/services                    - Buscar servicios
GET    /api/search/suggestions                 - Sugerencias de búsqueda
GET    /api/categories                         - Categorías principales
GET    /api/categories/:id/providers           - Proveedores por categoría

GET    /api/provider/:id/public-profile        - Perfil público completo
GET    /api/provider/:id/services              - Servicios del proveedor
GET    /api/provider/:id/reviews               - Reseñas del proveedor
GET    /api/provider/:id/portfolio             - Portafolio del proveedor
GET    /api/provider/:id/stats                 - Estadísticas públicas
```

**Tablas requeridas:**
- Vista `provider_public_view` (JOIN de múltiples tablas)
- `provider_profiles`
- `provider_services`
- `reviews`
- `provider_portfolio`

**Filtros necesarios:**
```typescript
interface SearchFilters {
  category?: string;
  location?: string; // Comuna o región
  minPrice?: number;
  maxPrice?: number;
  rating?: number; // Mínimo rating
  verified?: boolean;
  availability?: 'immediate' | 'today' | 'week';
  sortBy?: 'relevance' | 'price_asc' | 'price_desc' | 'rating' | 'distance';
}
```

**Archivos a crear:**
```
backend/src/endpoints/search.ts
backend/src/endpoints/public-provider.ts
backend/src/queries/search.ts
backend/src/lib/search-engine.ts
backend/src/lib/distance-calculator.ts
```

---

### **🏆 PRIORIDAD 6: Chat y Mensajería**
**Razón:** Comunicación entre cliente y proveedor

#### **Endpoints a implementar:**
```
POST   /api/conversations                      - Iniciar conversación
GET    /api/conversations/user/:id             - Conversaciones del usuario
GET    /api/conversations/:id/messages         - Mensajes de conversación
POST   /api/messages                           - Enviar mensaje
PATCH  /api/messages/:id/read                  - Marcar como leído
GET    /api/messages/unread/count              - Contador de no leídos
DELETE /api/messages/:id                       - Eliminar mensaje
```

**Tablas requeridas:**
- `conversations`
- `messages`
- `message_attachments` (opcional)

**Características:**
- ✅ Conversaciones 1-a-1 (cliente ↔ proveedor)
- ✅ Mensajes con timestamp
- ✅ Estado leído/no leído
- ✅ Adjuntos (imágenes)
- ✅ Paginación de mensajes
- 🔄 WebSocket para tiempo real (opcional, puede ser polling)

**Archivos a crear:**
```
backend/src/endpoints/chat.ts
backend/src/queries/chat.ts
backend/src/lib/websocket.ts (opcional)
```

---

### **🌟 PRIORIDAD 7: Reseñas y Favoritos**
**Razón:** Sistema de reputación y confianza

#### **Endpoints a implementar:**
```
POST   /api/reviews                            - Crear reseña
GET    /api/reviews/provider/:id               - Reseñas del proveedor
GET    /api/reviews/client/:id                 - Reseñas del cliente
PUT    /api/reviews/:id                        - Actualizar reseña
DELETE /api/reviews/:id                        - Eliminar reseña
POST   /api/reviews/:id/response               - Responder reseña (proveedor)

POST   /api/favorites                          - Agregar favorito
GET    /api/favorites/client/:id               - Favoritos del cliente
DELETE /api/favorites/:id                      - Eliminar favorito
GET    /api/favorites/check/:providerId        - Verificar si es favorito
```

**Tablas requeridas:**
- `reviews`
- `review_responses`
- `favorites`

**Validaciones:**
- Solo se puede reseñar después de cita completada
- Rating de 1 a 5 estrellas
- Texto mínimo de 10 caracteres

**Archivos a crear:**
```
backend/src/endpoints/reviews.ts
backend/src/endpoints/favorites.ts
backend/src/queries/reviews.ts
backend/src/queries/favorites.ts
backend/src/lib/rating-calculator.ts
```

---

### **💎 PRIORIDAD 8: Promociones e Ingresos**
**Razón:** Herramientas de crecimiento para el proveedor

#### **Endpoints a implementar:**
```
POST   /api/promotions                         - Crear promoción
GET    /api/promotions/provider/:id            - Promociones del proveedor
PUT    /api/promotions/:id                     - Actualizar promoción
DELETE /api/promotions/:id                     - Eliminar promoción
PATCH  /api/promotions/:id/toggle              - Activar/desactivar

GET    /api/income/daily                       - Ingresos del día
GET    /api/income/monthly                     - Ingresos del mes
GET    /api/income/range                       - Ingresos por rango
GET    /api/income/summary                     - Resumen completo

GET    /api/statistics/kpis                    - KPIs principales
GET    /api/statistics/revenue-chart           - Datos para gráfico de ingresos
GET    /api/statistics/services-chart          - Servicios más populares
GET    /api/statistics/reviews-table           - Reseñas recientes
```

**Tablas requeridas:**
- `promotions`
- `payments` (agregación)
- `appointments` (agregación)
- `reviews` (agregación)

**Archivos a crear:**
```
backend/src/endpoints/promotions.ts
backend/src/endpoints/income.ts
backend/src/endpoints/statistics.ts
backend/src/queries/income.ts
backend/src/queries/statistics.ts
backend/src/lib/statistics-calculator.ts
```

---

## 🔄 **Orden Sugerido de Implementación**

### **Sprint 1: Fundación del Proveedor** (Semana 1-2)
```
✅ 1. provider_profiles (tabla + CRUD)
✅ 2. provider_services (tabla + CRUD)
✅ 3. service_categories (seed data)
✅ 4. Sistema de upload de imágenes
✅ 5. Cálculo de completitud del perfil
```

**Resultado:** El proveedor puede crear su perfil y publicar servicios

### **Sprint 2: Disponibilidad y Agenda** (Semana 3)
```
✅ 1. provider_availability (tabla + CRUD)
✅ 2. availability_exceptions (tabla + CRUD)
✅ 3. Lógica de cálculo de slots disponibles
✅ 4. Validación de conflictos de horarios
✅ 5. Calendario mensual con citas
```

**Resultado:** El proveedor puede configurar su disponibilidad

### **Sprint 3: Sistema de Reservas (Core)** (Semana 4-5)
```
✅ 1. appointments (tabla completa)
✅ 2. appointment_history (auditoría)
✅ 3. POST /appointments (crear reserva)
✅ 4. GET /appointments/provider/:id
✅ 5. PATCH /appointments/:id/accept
✅ 6. PATCH /appointments/:id/reject
✅ 7. PATCH /appointments/:id/cancel
✅ 8. Validación de disponibilidad
✅ 9. Política de cancelación (24h)
✅ 10. Notificaciones de cambios de estado
```

**Resultado:** Los clientes pueden reservar servicios y los proveedores gestionarlos

### **Sprint 4: Sistema de Pagos** (Semana 6)
```
✅ 1. payments (tabla)
✅ 2. payment_methods (tabla + Stripe integration)
✅ 3. wallet_balance (tabla)
✅ 4. transactions (tabla)
✅ 5. POST /payments/create-intent
✅ 6. POST /payments/confirm
✅ 7. Cálculo de comisión (15%)
✅ 8. Sistema de retiros
```

**Resultado:** Los pagos fluyen de cliente → plataforma → proveedor

### **Sprint 5: Exploración y Búsqueda** (Semana 7)
```
✅ 1. Vista provider_search_view
✅ 2. GET /search/providers (con filtros)
✅ 3. GET /provider/:id/public-profile
✅ 4. Sistema de relevancia
✅ 5. Filtros por ubicación, precio, rating
✅ 6. Ordenamiento
```

**Resultado:** Los clientes pueden descubrir proveedores

### **Sprint 6: Chat y Notificaciones** (Semana 8)
```
✅ 1. conversations (tabla)
✅ 2. messages (tabla)
✅ 3. notifications (tabla)
✅ 4. CRUD completo de chat
✅ 5. Sistema de notificaciones
✅ 6. Contador de no leídos
```

**Resultado:** Comunicación en tiempo real

### **Sprint 7: Reseñas y Favoritos** (Semana 9)
```
✅ 1. reviews (tabla)
✅ 2. review_responses (tabla)
✅ 3. favorites (tabla)
✅ 4. CRUD de reseñas
✅ 5. Cálculo de rating promedio
✅ 6. Sistema de favoritos
```

**Resultado:** Sistema de confianza y reputación

### **Sprint 8: Promociones e Ingresos** (Semana 10)
```
✅ 1. promotions (tabla)
✅ 2. CRUD de promociones
✅ 3. Reportes de ingresos
✅ 4. Estadísticas avanzadas
✅ 5. Gráficos de datos
```

**Resultado:** Herramientas de crecimiento para el proveedor

---

## 🎯 **Por Dónde Empezar: Perfil del Trabajador**

### **Justificación:**
Tu teoría es correcta. El flujo debería ser:

1. **Perfil** → El proveedor configura su información
2. **Servicios** → Define qué ofrece
3. **Agenda** → Configura cuándo está disponible
4. **Promociones** → Mejora su visibilidad (opcional)
5. **Dashboard** → Ve solicitudes y citas en tiempo real

**Sin perfil y servicios, nada más funciona.**

### **Primera Implementación: `/dash/perfil`**

#### **Endpoints Mínimos Viables (MVP):**
```
1. POST   /api/provider/profile
   Request: { full_name, professional_title, main_commune, years_experience, bio }
   Response: { id, ...profile, profile_completion }

2. GET    /api/provider/profile
   Response: { ...profile, completion_suggestions: [] }

3. POST   /api/provider/photos
   Request: FormData (file, type: 'profile' | 'cover')
   Response: { photo_url }

4. PUT    /api/provider/profile
   Request: { ...campos a actualizar }
   Response: { ...profile actualizado }
```

#### **Segundo Paso: `/dash/servicios`**

```
1. GET    /api/categories
   Response: [{ id, name, description }]

2. POST   /api/provider/services
   Request: { name, description, price, duration_minutes, category_id }
   Response: { id, ...service }

3. GET    /api/provider/services
   Response: [{ ...service }]

4. PUT    /api/provider/services/:id
   Request: { ...campos a actualizar }
   Response: { ...service actualizado }

5. DELETE /api/provider/services/:id
   Response: { success: true }
```

#### **Tercer Paso: `/dash/agenda`**

```
1. GET    /api/provider/availability
   Response: { weekly_schedule: {...}, exceptions: [...] }

2. PUT    /api/provider/availability
   Request: { day: 'monday', blocks: [{ start: '09:00', end: '18:00' }] }
   Response: { ...availability }

3. GET    /api/provider/calendar/:year/:month
   Response: { days: [...], appointments: [...] }
```

---

## 📐 **Arquitectura de la Base de Datos**

### **Modelo de Datos Principal**

```
┌─────────────────┐
│     users       │
│  (id, email,    │
│   role, ...)    │
└────────┬────────┘
         │
         ├──────────────┬─────────────┬──────────────┐
         │              │             │              │
┌────────▼────────┐ ┌──▼─────────┐ ┌▼──────────┐  ┌▼─────────────┐
│ provider_       │ │ provider_  │ │provider_  │  │ client_      │
│ profiles        │ │ services   │ │availability│  │ profiles     │
│                 │ │            │ │           │  │              │
│ - full_name     │ │ - name     │ │ - day     │  │ - full_name  │
│ - title         │ │ - price    │ │ - blocks  │  │ - phone      │
│ - commune       │ │ - duration │ │           │  │ - address    │
│ - bio           │ │ - category │ │           │  │              │
└─────────────────┘ └────────────┘ └───────────┘  └──────────────┘
         │                                                │
         └────────────────┬──────────────────────────────┘
                          │
                  ┌───────▼─────────┐
                  │  appointments   │
                  │                 │
                  │ - provider_id   │
                  │ - client_id     │
                  │ - service_id    │
                  │ - date          │
                  │ - time          │
                  │ - status        │
                  │ - price         │
                  └────────┬────────┘
                           │
                  ┌────────┴────────┬──────────────┐
                  │                 │              │
          ┌───────▼───────┐ ┌──────▼──────┐ ┌────▼─────┐
          │   payments    │ │   reviews   │ │messages  │
          │               │ │             │ │          │
          │ - amount      │ │ - rating    │ │- content │
          │ - commission  │ │ - comment   │ │- read_at │
          │ - status      │ │             │ │          │
          └───────────────┘ └─────────────┘ └──────────┘
```

---

## 🔐 **Consideraciones de Seguridad**

### **Autenticación y Autorización**
```typescript
// Middleware de autenticación
- JWT token en headers
- Validación de rol (provider/client)
- Validación de ownership (solo puede editar su propio perfil)
```

### **Validaciones**
```typescript
// Validaciones por endpoint
- Sanitización de inputs
- Validación de tipos
- Límites de tamaño (imágenes, texto)
- Rate limiting por usuario
```

### **Datos Sensibles**
```typescript
// Protección de datos
- Encriptación de contraseñas (bcrypt)
- No exponer emails en perfiles públicos
- Ocultar datos de pago completos
- HTTPS obligatorio en producción
```

---

## 📊 **Flujo de Datos en el Dashboard del Proveedor**

### **Carga Inicial de `/dash/home`**
```typescript
// Request inicial del dashboard:
GET /api/provider/dashboard-summary

// Response:
{
  pending_requests: [{ id, client, service, date, time }],
  next_appointment: { id, client, service, date, time },
  daily_income: { amount, appointments_count, avg_rating },
  monthly_income: { amount, appointments_count, avg_rating },
  online_status: boolean,
  notifications_count: number
}
```

**Dependencias de datos:**
- Appointments con estado 'pending'
- Appointments con estado 'confirmed' ordenados por fecha
- Payments del día actual
- Payments del mes actual
- Provider status (online/offline)

---

## 🎨 **Mapeo Frontend → Backend**

### **Dashboard del Proveedor**

| Frontend Route | Backend Endpoints | Tablas Principales |
|----------------|-------------------|-------------------|
| `/dash/perfil` | `/provider/profile`, `/provider/photos` | `provider_profiles`, `provider_photos` |
| `/dash/servicios` | `/provider/services`, `/categories` | `provider_services`, `service_categories` |
| `/dash/agenda` | `/provider/availability`, `/provider/calendar` | `provider_availability`, `appointments` |
| `/dash/promocion` | `/promotions` | `promotions` |
| `/dash/ingresos` | `/income/*` | `payments`, `appointments` |
| `/dash/estadisticas` | `/statistics/*` | `payments`, `appointments`, `reviews` |
| `/dash/mensajes` | `/conversations`, `/messages` | `conversations`, `messages` |
| `/dash/home` | `/provider/dashboard-summary` | Vista agregada de múltiples tablas |

### **Dashboard del Cliente**

| Frontend Route | Backend Endpoints | Tablas Principales |
|----------------|-------------------|-------------------|
| `/client/explorar` | `/search/providers`, `/provider/:id/public` | Vista `provider_search_view` |
| `/client/reservas` | `/appointments/client/:id` | `appointments` |
| `/client/favoritos` | `/favorites/client/:id` | `favorites` |
| `/client/perfil` | `/client/profile` | `client_profiles` |
| `/client/pagos` | `/payment-methods`, `/wallet`, `/transactions` | `payment_methods`, `wallet_balance` |
| `/client/conversaciones` | `/conversations`, `/messages` | `conversations`, `messages` |
| `/client/configuracion` | `/client/settings` | `client_profiles`, `notification_preferences` |

---

## 🚦 **Estado Actual del Backend**

### **✅ Ya Implementado:**
- Sistema de autenticación (register, login, forgot/reset password)
- Sistema de planes y suscripciones (Stripe integration)
- Sistema de fundadores con beneficios
- Gestión de expiraciones de planes
- Sistema de contabilidad básico
- Email templates
- Swagger documentation

### **❌ Falta Implementar:**
- **Perfil del proveedor** (0%)
- **Servicios del proveedor** (0%)
- **Agenda y disponibilidad** (0%)
- **Sistema de reservas** (0%)
- **Sistema de pagos transaccionales** (0%)
- **Búsqueda de proveedores** (0%)
- **Chat y mensajería** (0%)
- **Reseñas y favoritos** (0%)
- **Promociones** (0%)
- **Ingresos y estadísticas** (0%)
- **Perfil del cliente** (0%)

---

## 🎯 **Propuesta de Primera Implementación**

### **Objetivo:** Hacer funcional el flujo completo del proveedor

#### **Semana 1: Perfil del Proveedor**
```bash
# Crear tablas
- provider_profiles
- provider_photos
- provider_locations

# Crear endpoints
- POST   /api/provider/profile
- GET    /api/provider/profile
- PUT    /api/provider/profile
- POST   /api/provider/photos
- GET    /api/provider/completion

# Testing
- Crear perfil completo
- Subir fotos
- Verificar cálculo de completitud
```

#### **Semana 2: Servicios del Proveedor**
```bash
# Usar tabla existente service_categories (ya existe)
# Crear tabla provider_services (nueva estructura)

# Crear endpoints
- GET    /api/categories
- POST   /api/provider/services
- GET    /api/provider/services
- PUT    /api/provider/services/:id
- DELETE /api/provider/services/:id
- PATCH  /api/provider/services/order

# Testing
- Crear 5 servicios diferentes
- Actualizar precios
- Reordenar
- Eliminar servicio
```

Con estos 2 sprints, el proveedor ya tiene:
- ✅ Perfil completo
- ✅ Servicios publicados
- ✅ Datos visibles en `/dash/perfil` y `/dash/servicios`

**Siguiente paso natural:** Agenda → Reservas → Pagos

---

## 📚 **Recursos Disponibles**

### **Documentación de Flujos Frontend**
```
adomi-app/flujos-front/
├── flujo-servicios/
│   ├── perfil-trabajador/
│   │   ├── README.md (794 líneas)
│   │   ├── database-schema.md (1042 líneas)
│   │   ├── api-endpoints.md (1600 líneas)
│   │   ├── ui-components.md (1140 líneas)
│   │   └── implementation-plan.md (607 líneas)
│   ├── agenda/
│   ├── ingresos/
│   └── README.md
├── 01-exploracion/
├── 02-reservas/
├── 04-favoritos/
└── 05-perfil-cliente/
```

### **Base de Datos Actual**
```
backend/
├── adomiapp.db (SQLite - desarrollo)
├── init.sql (schema básico)
└── migrations/ (migraciones futuras)
```

### **Endpoints Actuales**
```
backend/src/endpoints/
├── auth.ts ✅
├── plans.ts ✅
├── subscriptions.ts ✅
├── stripe-checkout.ts ✅
├── plan-expirations.ts ✅
├── founders.ts ✅
├── accounting.ts ✅
├── verifications.ts (parcial)
└── [FALTA TODO LO DEMÁS]
```

---

## 💡 **Recomendación Final**

### **Empezar por:**
1. **Revisar** la documentación de `flujos-front/flujo-servicios/perfil-trabajador/`
2. **Crear** el esquema de base de datos para `provider_profiles` y `provider_services`
3. **Implementar** los endpoints de perfil (CRUD básico)
4. **Testear** con el frontend en `http://localhost:4200/dash/perfil`
5. **Iterar** añadiendo servicios, luego agenda, luego reservas

### **Próximos Pasos:**
```
1. ✅ Crear BACKEND_IMPLEMENTATION_ROADMAP.md (este archivo)
2. 🔄 Crear schema SQL completo basado en flujos-front
3. 🔄 Implementar endpoints de perfil del proveedor
4. 🔄 Implementar endpoints de servicios
5. 🔄 Conectar frontend con backend real
6. 🔄 Testing end-to-end
```

---

**🚀 ¿Listo para empezar con la implementación del perfil del proveedor?**


