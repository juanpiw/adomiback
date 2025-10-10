-- ============================================
-- ADOMI - ESQUEMA DE BASE DE DATOS COMPLETO
-- Basado en análisis exhaustivo de flujos del frontend
-- ============================================
--
-- PROPÓSITO GENERAL:
-- Este schema define la estructura completa de la base de datos para Adomi,
-- una plataforma de intermediación que conecta Clientes con Proveedores de servicios.
--
-- PERFILES DE USUARIO:
-- • Cliente (client): Usuario que busca y contrata servicios
-- • Proveedor (provider): Profesional independiente que ofrece servicios
-- • Admin (admin): Administrador de la plataforma
--
-- FLUJO PRINCIPAL:
-- 1. Proveedor crea perfil y publica servicios
-- 2. Cliente explora servicios y encuentra proveedores
-- 3. Cliente agenda cita con proveedor disponible
-- 4. Sistema procesa pago (85% proveedor, 15% comisión Adomi)
-- 5. Proveedor acepta/rechaza solicitud
-- 6. Servicio se completa
-- 7. Cliente deja reseña
--
-- RELACIONES CLAVE:
-- users (1) → (1) provider_profiles → (N) provider_services
-- users (1) → (N) appointments (cliente y proveedor)
-- appointments (1) → (1) payments → (1) reviews
-- users (N) ↔ (N) conversations ↔ (N) messages
--
-- ============================================

-- ============================================
-- IMPORTANTE: Este script eliminará y recreará toda la base de datos
-- Asegúrate de tener un backup antes de ejecutarlo
-- ============================================

DROP DATABASE IF EXISTS adomi;
CREATE DATABASE adomi;
USE adomi;

-- ============================================
-- TABLAS CORE
-- ============================================
--
-- Todas las tablas se crearán desde cero para garantizar
-- que tengan la estructura correcta con todos los campos
--
-- ============================================

-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │ TABLA: users                                                                 │
-- ├─────────────────────────────────────────────────────────────────────────────┤
-- │ PROPÓSITO:                                                                   │
-- │ Tabla central de autenticación y gestión de usuarios. Almacena credenciales │
-- │ y define el rol del usuario (cliente, proveedor o admin).                   │
-- │                                                                              │
-- │ FUNCIONALIDADES DEL FRONTEND:                                               │
-- │ • Login/Register (http://localhost:4200/auth/login)                         │
-- │ • Recuperación de contraseña (http://localhost:4200/auth/forgot)           │
-- │ • Selección de plan (http://localhost:4200/auth/select-plan)               │
-- │                                                                              │
-- │ RELACIONES:                                                                  │
-- │ • users (1) → (1) provider_profiles (si role = 'provider')                 │
-- │ • users (1) → (1) client_profiles (si role = 'client')                     │
-- │ • users (1) → (N) subscriptions (suscripciones activas)                    │
-- │ • users (1) → (N) appointments (como cliente o proveedor)                  │
-- │                                                                              │
-- │ CAMPOS CLAVE:                                                                │
-- │ • role: Define el tipo de usuario y su dashboard (/client o /dash)         │
-- │ • stripe_customer_id: Vincula con Stripe para pagos                        │
-- │ • is_active: Permite suspender cuentas sin eliminarlas                     │
-- │ • email_verified: Requisito para ciertas funcionalidades                   │
-- └─────────────────────────────────────────────────────────────────────────────┘
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  google_id VARCHAR(255) NULL,
  name VARCHAR(255) NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NULL,
  role ENUM('client', 'provider', 'admin') NOT NULL DEFAULT 'client',
  stripe_customer_id VARCHAR(255) NULL,
  is_active BOOLEAN DEFAULT TRUE,
  email_verified BOOLEAN DEFAULT FALSE,
  phone VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_email (email),
  INDEX idx_role (role),
  INDEX idx_stripe_customer (stripe_customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │ TABLA: plans                                                                 │
-- ├─────────────────────────────────────────────────────────────────────────────┤
-- │ PROPÓSITO:                                                                   │
-- │ Define los planes de suscripción disponibles para proveedores. Los clientes │
-- │ NO pagan suscripción, es gratis para ellos.                                 │
-- │                                                                              │
-- │ FUNCIONALIDADES DEL FRONTEND:                                               │
-- │ • Selección de plan (/auth/select-plan) durante registro de proveedor      │
-- │ • Upgrade de plan desde dashboard proveedor                                 │
-- │ • Alertas de plan próximo a vencer (PlanUpgradeAlertComponent)             │
-- │                                                                              │
-- │ RELACIONES:                                                                  │
-- │ • plans (1) → (N) subscriptions                                             │
-- │                                                                              │
-- │ EJEMPLOS DE PLANES:                                                          │
-- │ • Básico: $9,900/mes - Límite de 10 citas/mes                             │
-- │ • Pro: $19,900/mes - Citas ilimitadas, destacado en búsqueda              │
-- │ • Premium: $29,900/mes - Todo lo anterior + promociones                    │
-- └─────────────────────────────────────────────────────────────────────────────┘
CREATE TABLE plans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'CLP',
  billing_period ENUM('monthly', 'yearly') NOT NULL,
  features JSON,
  stripe_price_id VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │ TABLA: subscriptions                                                         │
-- ├─────────────────────────────────────────────────────────────────────────────┤
-- │ PROPÓSITO:                                                                   │
-- │ Almacena las suscripciones activas de los proveedores. Vincula users con    │
-- │ plans y gestiona el ciclo de vida de la suscripción (Stripe).              │
-- │                                                                              │
-- │ FUNCIONALIDADES DEL FRONTEND:                                               │
-- │ • Checkout de Stripe (/auth/checkout)                                       │
-- │ • Gestión de suscripción desde dashboard                                    │
-- │ • Alertas de expiración (PlanUpgradeAlertComponent)                         │
-- │                                                                              │
-- │ RELACIONES:                                                                  │
-- │ • users (1) → (N) subscriptions                                             │
-- │ • plans (1) → (N) subscriptions                                             │
-- │ • subscriptions (1) → (1) plan_expirations (fecha de vencimiento)          │
-- │                                                                              │
-- │ ESTADOS:                                                                     │
-- │ • active: Suscripción vigente                                               │
-- │ • cancelled: Cancelada pero aún en período                                  │
-- │ • expired: Período vencido                                                  │
-- │ • past_due: Pago atrasado                                                   │
-- └─────────────────────────────────────────────────────────────────────────────┘
CREATE TABLE subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  plan_id INT NOT NULL,
  stripe_subscription_id VARCHAR(255),
  status ENUM('active', 'cancelled', 'expired', 'past_due') NOT NULL,
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES plans(id),
  INDEX idx_user (user_id),
  INDEX idx_status (status),
  INDEX idx_stripe_subscription (stripe_subscription_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- CATEGORÍAS Y SERVICIOS GLOBALES
-- ============================================
--
-- Estas tablas definen el catálogo global de categorías de servicios
-- que se usan tanto en la creación de servicios como en la búsqueda.
--
-- ============================================

-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │ TABLA: service_categories                                                    │
-- ├─────────────────────────────────────────────────────────────────────────────┤
-- │ PROPÓSITO:                                                                   │
-- │ Catálogo maestro de categorías de servicios. Permite organizar y filtrar    │
-- │ servicios por tipo (Belleza, Salud, Hogar, etc.).                          │
-- │                                                                              │
-- │ FUNCIONALIDADES DEL FRONTEND:                                               │
-- │ • Selector de categoría en ServiceFormComponent (/dash/servicios)          │
-- │ • Filtros de exploración (/client/explorar)                                 │
-- │ • CategoriesSectionComponent en favoritos (/client/favoritos)              │
-- │ • Búsqueda global (GlobalSearchModalComponent)                              │
-- │                                                                              │
-- │ RELACIONES:                                                                  │
-- │ • service_categories (1) → (N) provider_services                            │
-- │ • service_categories (1) → (N) service_categories (sub-categorías)         │
-- │                                                                              │
-- │ CATEGORÍAS PRINCIPALES:                                                      │
-- │ 1. Belleza y Estética (#FF6B9D, icon: scissors)                            │
-- │ 2. Salud y Bienestar (#4ECDC4, icon: heart)                                │
-- │ 3. Hogar y Limpieza (#95E1D3, icon: home)                                  │
-- │ 4. Tecnología (#667eea, icon: laptop)                                       │
-- │ 5. Educación (#FFA07A, icon: book)                                          │
-- │ 6. Eventos (#DDA15E, icon: camera)                                          │
-- │ 7. Deportes (#06D6A0, icon: activity)                                       │
-- │ 8. Mascotas (#FFB4A2, icon: paw)                                            │
-- │ 9. Transporte (#B5838D, icon: truck)                                        │
-- │ 10. Otro (#94A3B8, icon: more) - Para servicios personalizados            │
-- │                                                                              │
-- │ USO:                                                                         │
-- │ Seed data se inserta al final de este archivo con colores e iconos         │
-- └─────────────────────────────────────────────────────────────────────────────┘
CREATE TABLE service_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  icon_name VARCHAR(50),
  color_hex VARCHAR(7),
  is_active BOOLEAN DEFAULT TRUE,
  order_index INT DEFAULT 0,
  parent_category_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (parent_category_id) REFERENCES service_categories(id),
  INDEX idx_slug (slug),
  INDEX idx_active (is_active),
  INDEX idx_parent (parent_category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- PERFIL DEL PROVEEDOR
-- ============================================
--
-- FUNCIONALIDAD FRONTEND: http://localhost:4200/dash/perfil
-- Tab "Perfil Público" con componentes:
-- • ProgressPerfilComponent (muestra completitud%)
-- • InfoBasicaComponent (nombre, título, comuna, años experiencia)
-- • SeccionFotosComponent (foto perfil y portada)
-- • SobreMiComponent (descripción bio)
-- • MisServiciosComponent (lista de servicios)
-- • PortafolioComponent (galería de trabajos)
-- • UbicacionDisponibilidadComponent (zonas de cobertura)
--
-- También alimenta:
-- • /client/explorar/:workerId (perfil público del trabajador)
-- • /dash/home (InicioHeaderComponent con avatar y nombre)
-- • Tab "Ver Perfil Público" en /dash/perfil
--
-- ============================================

-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │ TABLA: provider_profiles                                                     │
-- ├─────────────────────────────────────────────────────────────────────────────┤
-- │ PROPÓSITO:                                                                   │
-- │ Perfil completo y público del proveedor. Contiene toda la información que   │
-- │ se muestra en su perfil público y en resultados de búsqueda.               │
-- │                                                                              │
-- │ FUNCIONALIDADES DEL FRONTEND:                                               │
-- │ • Tab "Perfil Público" completo (/dash/perfil?tab=perfil-publico)         │
-- │ • Perfil público para clientes (/client/explorar/:workerId)                │
-- │ • Resultados de búsqueda (/client/explorar)                                 │
-- │ • Tarjetas de profesionales (ProfessionalCardComponent)                     │
-- │ • Vista previa del perfil (VerPerfilPublicoComponent)                       │
-- │ • Header del dashboard (/dash/home con InicioHeaderComponent)              │
-- │                                                                              │
-- │ RELACIONES:                                                                  │
-- │ • users (1) → (1) provider_profiles                                         │
-- │ • provider_profiles (1) → (N) provider_services                             │
-- │ • provider_profiles (1) → (N) provider_portfolio                            │
-- │ • provider_profiles (1) → (N) provider_locations                            │
-- │ • provider_profiles (1) → (1) identity_verifications                        │
-- │                                                                              │
-- │ CAMPOS CALCULADOS AUTOMÁTICAMENTE:                                           │
-- │ • profile_completion: Se recalcula al guardar (ver función abajo)          │
-- │ • rating_average: Se actualiza via trigger al crear review                 │
-- │ • review_count: Se actualiza via trigger al crear review                   │
-- │ • completed_appointments: Se actualiza via trigger al completar cita       │
-- │                                                                              │
-- │ CÁLCULO DE COMPLETITUD (100%):                                              │
-- │ • full_name: 10%                                                            │
-- │ • professional_title: 10%                                                   │
-- │ • main_commune: 10%                                                         │
-- │ • years_experience > 0: 5%                                                  │
-- │ • bio (min 50 chars): 15%                                                   │
-- │ • profile_photo_url: 15%                                                    │
-- │ • cover_photo_url: 10%                                                      │
-- │ • Tiene servicios (>=1): 15%                                                │
-- │ • Tiene portafolio (>=2): 10%                                               │
-- │                                                                              │
-- │ USO EN BÚSQUEDA:                                                            │
-- │ • Los clientes filtran por main_commune, rating_average, is_verified       │
-- │ • Se ordena por rating_average o completed_appointments                     │
-- │ • profile_completion > 70% para aparecer en búsqueda destacada             │
-- └─────────────────────────────────────────────────────────────────────────────┘
CREATE TABLE provider_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  professional_title VARCHAR(255),
  main_commune VARCHAR(100),
  main_region VARCHAR(100),
  years_experience INT DEFAULT 0,
  bio TEXT,
  profile_photo_url VARCHAR(500),
  cover_photo_url VARCHAR(500),
  profile_completion INT DEFAULT 0,
  is_verified BOOLEAN DEFAULT FALSE,
  verification_status ENUM('none', 'pending', 'approved', 'rejected') DEFAULT 'none',
  profile_views INT DEFAULT 0,
  rating_average DECIMAL(3,2) DEFAULT 0,
  review_count INT DEFAULT 0,
  completed_appointments INT DEFAULT 0,
  last_profile_update TIMESTAMP,
  is_online BOOLEAN DEFAULT FALSE,
  last_seen TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_provider (provider_id),
  INDEX idx_verification (verification_status),
  INDEX idx_commune (main_commune),
  INDEX idx_region (main_region),
  INDEX idx_verified (is_verified),
  INDEX idx_completion (profile_completion),
  INDEX idx_rating (rating_average),
  INDEX idx_online (is_online),
  
  CONSTRAINT chk_provider_profiles_completion CHECK (profile_completion >= 0 AND profile_completion <= 100),
  CONSTRAINT chk_provider_profiles_experience CHECK (years_experience >= 0),
  CONSTRAINT chk_provider_profiles_rating CHECK (rating_average >= 0 AND rating_average <= 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │ TABLA: provider_services                                                     │
-- ├─────────────────────────────────────────────────────────────────────────────┤
-- │ PROPÓSITO:                                                                   │
-- │ Servicios individuales que ofrece cada proveedor. Un proveedor puede tener  │
-- │ múltiples servicios con diferentes precios y duraciones.                    │
-- │                                                                              │
-- │ FUNCIONALIDADES DEL FRONTEND:                                               │
-- │ • CRUD completo en /dash/servicios (ServicesListComponent)                 │
-- │ • Formulario crear/editar (ServiceFormComponent)                            │
-- │ • Tarjetas de servicio (ServiceCardComponent)                               │
-- │ • Lista en perfil público (MisServiciosComponent en /dash/perfil)          │
-- │ • Mostrar en /client/explorar/:workerId (perfil público)                   │
-- │ • Selector de servicio al agendar cita (ModalAgendarCitaComponent)         │
-- │                                                                              │
-- │ RELACIONES:                                                                  │
-- │ • users (1) → (N) provider_services                                         │
-- │ • service_categories (1) → (N) provider_services                            │
-- │ • provider_services (1) → (N) appointments (servicio reservado)            │
-- │                                                                              │
-- │ CAMPOS IMPORTANTES:                                                          │
-- │ • price: Precio en pesos chilenos (CLP)                                     │
-- │ • duration_minutes: Duración del servicio (15-480 min)                      │
-- │ • category_id: Referencia a categoría o NULL si usa custom_category        │
-- │ • custom_category: Categoría personalizada cuando elige "Otro"             │
-- │ • order_index: Para reordenar servicios en el perfil                        │
-- │ • is_featured: Para destacar servicio en resultados                         │
-- │ • booking_count: Contador de veces que se ha reservado                      │
-- │ • average_rating: Rating promedio de reseñas de este servicio              │
-- │                                                                              │
-- │ LÓGICA DE NEGOCIO:                                                          │
-- │ • No se puede eliminar un servicio con citas futuras programadas           │
-- │ • Al crear servicio, profile_completion aumenta +15%                        │
-- │ • Se pueden desactivar (is_active=false) sin eliminar                       │
-- │ • El order_index permite drag-and-drop en el frontend                       │
-- └─────────────────────────────────────────────────────────────────────────────┘
CREATE TABLE provider_services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  duration_minutes INT NOT NULL,
  category_id INT,
  custom_category VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  order_index INT DEFAULT 0,
  service_image_url VARCHAR(500),
  is_featured BOOLEAN DEFAULT FALSE,
  booking_count INT DEFAULT 0,
  average_rating DECIMAL(3,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES service_categories(id) ON DELETE SET NULL,
  INDEX idx_provider (provider_id),
  INDEX idx_category (category_id),
  INDEX idx_active (is_active),
  INDEX idx_featured (is_featured),
  INDEX idx_order (provider_id, order_index),
  INDEX idx_price (price),
  
  CONSTRAINT chk_provider_services_price CHECK (price >= 0),
  CONSTRAINT chk_provider_services_duration CHECK (duration_minutes > 0 AND duration_minutes <= 480),
  CONSTRAINT chk_provider_services_order CHECK (order_index >= 0),
  CONSTRAINT chk_provider_services_rating CHECK (average_rating >= 0 AND average_rating <= 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Portafolio del proveedor (galería de trabajos)
CREATE TABLE provider_portfolio (
  id INT AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL,
  file_url VARCHAR(500) NOT NULL,
  file_type ENUM('image', 'video') NOT NULL,
  title VARCHAR(255),
  description TEXT,
  order_index INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  file_size INT,
  mime_type VARCHAR(100),
  thumbnail_url VARCHAR(500),
  is_featured BOOLEAN DEFAULT FALSE,
  view_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_provider (provider_id),
  INDEX idx_type (file_type),
  INDEX idx_active (is_active),
  INDEX idx_order (provider_id, order_index),
  
  CONSTRAINT chk_provider_portfolio_order CHECK (order_index >= 0),
  CONSTRAINT chk_provider_portfolio_file_size CHECK (file_size > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ubicaciones de cobertura del proveedor
CREATE TABLE provider_locations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL,
  commune VARCHAR(100) NOT NULL,
  region VARCHAR(100) NOT NULL,
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_provider (provider_id),
  INDEX idx_commune (commune),
  INDEX idx_region (region),
  UNIQUE KEY unique_provider_commune (provider_id, commune)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- VERIFICACIÓN DE IDENTIDAD
-- ============================================

-- Verificaciones de identidad (KYC)
CREATE TABLE identity_verifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL,
  document_type ENUM('cedula', 'pasaporte', 'licencia') NOT NULL,
  document_number VARCHAR(50),
  front_document_url VARCHAR(500) NOT NULL,
  back_document_url VARCHAR(500),
  selfie_url VARCHAR(500),
  status ENUM('pending', 'approved', 'rejected', 'expired') DEFAULT 'pending',
  rejection_reason TEXT,
  verified_at TIMESTAMP NULL,
  verified_by INT NULL,
  verification_notes TEXT,
  document_quality_score DECIMAL(3,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_provider (provider_id),
  INDEX idx_status (status),
  INDEX idx_created (created_at),
  
  CONSTRAINT chk_identity_verifications_quality_score CHECK (document_quality_score IS NULL OR (document_quality_score >= 0 AND document_quality_score <= 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- DISPONIBILIDAD Y AGENDA
-- ============================================
--
-- FUNCIONALIDAD FRONTEND: http://localhost:4200/dash/agenda
-- Componentes:
-- • CalendarMensualComponent (calendario con citas)
-- • HorariosConfigComponent (configurar horarios semanales)
-- • DayDetailComponent (detalle del día con citas)
-- • InicioGestionDisponibilidadComponent (/dash/home gestión rápida)
--
-- Estas tablas definen CUÁNDO está disponible el proveedor para recibir citas.
-- Es la base del sistema de reservas - sin disponibilidad, no hay slots libres.
--
-- ============================================

-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │ TABLA: provider_availability                                                 │
-- ├─────────────────────────────────────────────────────────────────────────────┤
-- │ PROPÓSITO:                                                                   │
-- │ Define los horarios semanales recurrentes del proveedor. Por ejemplo:       │
-- │ "Lunes de 9:00 a 13:00" y "Lunes de 15:00 a 19:00" (dos bloques).         │
-- │                                                                              │
-- │ FUNCIONALIDADES DEL FRONTEND:                                               │
-- │ • Configuración de horarios (/dash/agenda con HorariosConfigComponent)     │
-- │ • Gestión rápida de disponibilidad (/dash/home)                             │
-- │ • Muestra slots disponibles al cliente al agendar                           │
-- │                                                                              │
-- │ RELACIONES:                                                                  │
-- │ • users (1) → (N) provider_availability                                     │
-- │                                                                              │
-- │ LÓGICA DE CÁLCULO DE SLOTS:                                                 │
-- │ 1. Obtener bloques del día (ej: Lunes 9:00-13:00, 15:00-19:00)            │
-- │ 2. Restar citas ya agendadas ese día                                        │
-- │ 3. Restar excepciones (availability_exceptions)                             │
-- │ 4. Generar slots disponibles cada X minutos (según duración del servicio)  │
-- │                                                                              │
-- │ EJEMPLO:                                                                     │
-- │ day_of_week: 'monday', start_time: '09:00', end_time: '13:00'              │
-- │ → Disponible todos los lunes de 9am a 1pm                                   │
-- │                                                                              │
-- │ VALIDACIONES:                                                                │
-- │ • end_time debe ser mayor que start_time                                    │
-- │ • No puede haber bloques solapados para el mismo día                        │
-- │ • Se puede tener múltiples bloques por día (mañana y tarde)                │
-- └─────────────────────────────────────────────────────────────────────────────┘
CREATE TABLE provider_availability (
  id INT AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL,
  day_of_week ENUM('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday') NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_provider (provider_id),
  INDEX idx_day (day_of_week),
  INDEX idx_active (is_active),
  
  CONSTRAINT chk_provider_availability_time_order CHECK (end_time > start_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Excepciones de disponibilidad (feriados, días bloqueados)
CREATE TABLE availability_exceptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL,
  exception_date DATE NOT NULL,
  reason VARCHAR(255),
  is_available BOOLEAN DEFAULT FALSE,
  start_time TIME NULL,
  end_time TIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_provider (provider_id),
  INDEX idx_date (exception_date),
  UNIQUE KEY unique_provider_date (provider_id, exception_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- CITAS Y RESERVAS (CORE DEL NEGOCIO)
-- ============================================
--
-- FUNCIONALIDADES FRONTEND:
-- • /client/explorar/:workerId → BookingPanelComponent (agendar cita)
-- • /client/reservas → Lista de reservas del cliente
-- • /dash/home → InicioSolicitudesComponent (solicitudes pendientes)
-- • /dash/home → InicioProximaCitaComponent (próxima cita)
-- • /dash/agenda → CalendarMensualComponent (calendario mensual)
-- • /dash/agenda → DayDetailComponent (citas del día)
-- • Modales: AcceptReservaModalComponent, RejectReservaModalComponent,
--            DetallesCitaModalComponent, ModalAgendarCitaComponent
--
-- Esta es LA TABLA MÁS IMPORTANTE del sistema. Representa el core business
-- de Adomi: la conexión entre cliente y proveedor para un servicio específico.
--
-- FLUJO COMPLETO DE UNA CITA:
-- 1. Cliente agenda → status: 'pending'
-- 2. Proveedor acepta → status: 'confirmed'
-- 3. Se procesa pago → registro en payments
-- 4. Servicio se completa → status: 'completed'
-- 5. Cliente deja reseña → registro en reviews
--
-- ============================================

-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │ TABLA: appointments                                                          │
-- ├─────────────────────────────────────────────────────────────────────────────┤
-- │ PROPÓSITO:                                                                   │
-- │ Representa una cita/reserva entre un cliente y un proveedor para un servicio│
-- │ específico en una fecha y hora determinadas.                                │
-- │                                                                              │
-- │ FUNCIONALIDADES DEL FRONTEND:                                               │
-- │ • Cliente agenda cita (/client/explorar/:workerId)                          │
-- │ • Proveedor ve solicitudes pendientes (/dash/home)                          │
-- │ • Proveedor acepta/rechaza (modales en InicioSolicitudesComponent)         │
-- │ • Ver próxima cita (/dash/home → InicioProximaCitaComponent)               │
-- │ • Ver detalles de cita (DetallesCitaModalComponent)                         │
-- │ • Calendario mensual (/dash/agenda → CalendarMensualComponent)             │
-- │ • Lista de reservas del cliente (/client/reservas)                          │
-- │ • Nueva cita manual (ModalAgendarCitaComponent en /dash/agenda)            │
-- │                                                                              │
-- │ RELACIONES:                                                                  │
-- │ • appointments (N) → (1) users (provider_id)                                │
-- │ • appointments (N) → (1) users (client_id)                                  │
-- │ • appointments (N) → (1) provider_services (service_id)                     │
-- │ • appointments (1) → (1) payments (pago asociado)                           │
-- │ • appointments (1) → (0..1) reviews (reseña opcional)                       │
-- │ • appointments (1) → (N) appointment_history (auditoría de cambios)        │
-- │                                                                              │
-- │ ESTADOS DEL CICLO DE VIDA:                                                  │
-- │ • pending: Esperando aceptación del proveedor (solicitud nueva)            │
-- │ • confirmed: Aceptada por proveedor, cita confirmada                        │
-- │ • rejected: Rechazada por proveedor (con rejection_reason)                  │
-- │ • cancelled: Cancelada por cliente (con cancellation_reason)                │
-- │ • completed: Servicio completado exitosamente                               │
-- │ • no_show: Cliente no se presentó a la cita                                 │
-- │ • in_progress: Servicio en curso (opcional, para tracking en vivo)         │
-- │                                                                              │
-- │ FLUJO DE ESTADOS:                                                            │
-- │ pending → confirmed → in_progress → completed → [review creado]            │
-- │    ↓          ↓                                                              │
-- │ rejected   cancelled                                                         │
-- │                                                                              │
-- │ COMISIÓN Y PAGOS:                                                            │
-- │ • commission_rate: Normalmente 15% (configurable)                           │
-- │ • commission_amount: Se calcula automáticamente via trigger                 │
-- │ • price: Precio total que paga el cliente                                   │
-- │ • Al completar cita: 85% va a wallet del proveedor, 15% comisión Adomi     │
-- │                                                                              │
-- │ POLÍTICA DE CANCELACIÓN (Términos y Condiciones):                           │
-- │ • +24h antes: Sin penalización (cancellation_fee = 0)                       │
-- │ • -24h antes: Puede aplicar cargo por cancelación                           │
-- │ • cancelled_by: 'client' | 'provider' | 'system'                           │
-- │                                                                              │
-- │ VALIDACIONES IMPORTANTES:                                                    │
-- │ • No puede haber dos citas solapadas para el mismo proveedor               │
-- │ • La fecha/hora debe estar dentro de provider_availability                 │
-- │ • La fecha/hora NO debe estar en availability_exceptions                    │
-- │ • end_time = start_time + service.duration_minutes                          │
-- └─────────────────────────────────────────────────────────────────────────────┘
CREATE TABLE appointments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL,
  client_id INT NOT NULL,
  service_id INT NOT NULL,
  appointment_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status ENUM('pending', 'confirmed', 'rejected', 'cancelled', 'completed', 'no_show', 'in_progress') DEFAULT 'pending',
  price DECIMAL(10,2) NOT NULL,
  commission_rate DECIMAL(5,2) DEFAULT 15.00,
  commission_amount DECIMAL(10,2),
  notes TEXT,
  cancellation_reason TEXT,
  cancelled_by ENUM('client', 'provider', 'system') NULL,
  cancelled_at TIMESTAMP NULL,
  rejection_reason TEXT,
  confirmed_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  client_location VARCHAR(255),
  color VARCHAR(7) DEFAULT '#667eea',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES provider_services(id) ON DELETE CASCADE,
  INDEX idx_provider (provider_id),
  INDEX idx_client (client_id),
  INDEX idx_service (service_id),
  INDEX idx_date (appointment_date),
  INDEX idx_status (status),
  INDEX idx_datetime (appointment_date, start_time),
  
  CONSTRAINT chk_appointments_time_order CHECK (end_time > start_time),
  CONSTRAINT chk_appointments_price CHECK (price >= 0),
  CONSTRAINT chk_appointments_commission_rate CHECK (commission_rate >= 0 AND commission_rate <= 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Historial de cambios de citas
CREATE TABLE appointment_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  appointment_id INT NOT NULL,
  changed_by INT NOT NULL,
  old_status VARCHAR(20),
  new_status VARCHAR(20) NOT NULL,
  change_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_appointment (appointment_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- PAGOS Y TRANSACCIONES
-- ============================================
--
-- FUNCIONALIDADES FRONTEND:
-- • /client/pagos → SavedCardsSectionComponent, TransactionsTableComponent
-- • /dash/ingresos → Reportes de ingresos (InicioIngresosMesComponent, InicioIngresosDiaComponent)
-- • /dash/estadisticas → RevenueChartComponent (gráfico de ingresos)
-- • /client/reservas → Procesamiento de pagos al reservar
--
-- MODELO DE NEGOCIO DE ADOMI:
-- • Cliente paga 100% del servicio
-- • Sistema retiene 15% como comisión
-- • Proveedor recibe 85% en su wallet
-- • Proveedor puede retirar fondos de su wallet
--
-- INTEGRACIÓN CON STRIPE:
-- • stripe_payment_intent_id: Vincula con Stripe Payment Intent
-- • payment_method: 'card' usa Stripe, 'cash' se paga en persona
--
-- ============================================

-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │ TABLA: payments                                                              │
-- ├─────────────────────────────────────────────────────────────────────────────┤
-- │ PROPÓSITO:                                                                   │
-- │ Registra cada pago realizado por un cliente por un servicio. Calcula y      │
-- │ separa automáticamente la comisión (15%) y el monto del proveedor (85%).   │
-- │                                                                              │
-- │ FUNCIONALIDADES DEL FRONTEND:                                               │
-- │ • Historial de transacciones cliente (/client/pagos)                        │
-- │ • Reportes de ingresos proveedor (/dash/ingresos)                           │
-- │ • Gráficos de ingresos (/dash/estadisticas → RevenueChartComponent)        │
-- │ • Ingresos del día/mes (/dash/home → InicioIngresosMesComponent)           │
-- │                                                                              │
-- │ RELACIONES:                                                                  │
-- │ • payments (N) → (1) appointments                                           │
-- │ • payments (N) → (1) users (client_id - quien pagó)                        │
-- │ • payments (N) → (1) users (provider_id - quien recibe)                    │
-- │ • payments (1) → (N) transactions (movimientos de wallet)                  │
-- │                                                                              │
-- │ CÁLCULO DE COMISIÓN (automático via trigger):                               │
-- │ amount = $25,000 (precio del servicio)                                      │
-- │ commission_rate = 15%                                                        │
-- │ commission_amount = $25,000 * 0.15 = $3,750 (para Adomi)                   │
-- │ provider_amount = $25,000 - $3,750 = $21,250 (para proveedor)              │
-- │                                                                              │
-- │ MÉTODOS DE PAGO:                                                            │
-- │ • card: Tarjeta via Stripe (online)                                         │
-- │ • cash: Efectivo (se paga en persona)                                       │
-- │ • transfer: Transferencia bancaria                                          │
-- │ • wallet: Saldo de billetera del cliente                                    │
-- │                                                                              │
-- │ ESTADOS:                                                                     │
-- │ • pending: Pago iniciado pero no confirmado                                 │
-- │ • completed: Pago exitoso, fondos transferidos                              │
-- │ • failed: Pago rechazado o fallido                                          │
-- │ • refunded: Pago reembolsado (cancellation < 24h o disputa)                │
-- │                                                                              │
-- │ REEMBOLSOS:                                                                  │
-- │ • Se registra en refunded_at y refund_reason                                │
-- │ • El monto refunded se deduce del wallet del proveedor                      │
-- │ • Se crea una transaction de tipo 'refund'                                  │
-- └─────────────────────────────────────────────────────────────────────────────┘
CREATE TABLE payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  appointment_id INT NOT NULL,
  client_id INT NOT NULL,
  provider_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  commission_amount DECIMAL(10,2) NOT NULL,
  provider_amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'CLP',
  payment_method ENUM('card', 'cash', 'transfer', 'wallet') NOT NULL,
  stripe_payment_intent_id VARCHAR(255),
  status ENUM('pending', 'completed', 'failed', 'refunded') DEFAULT 'pending',
  paid_at TIMESTAMP NULL,
  refunded_at TIMESTAMP NULL,
  refund_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_appointment (appointment_id),
  INDEX idx_client (client_id),
  INDEX idx_provider (provider_id),
  INDEX idx_status (status),
  INDEX idx_paid_at (paid_at),
  INDEX idx_stripe_intent (stripe_payment_intent_id),
  
  CONSTRAINT chk_payments_amount CHECK (amount >= 0),
  CONSTRAINT chk_payments_commission CHECK (commission_amount >= 0),
  CONSTRAINT chk_payments_provider_amount CHECK (provider_amount >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Métodos de pago guardados (cliente)
CREATE TABLE payment_methods (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  stripe_payment_method_id VARCHAR(255) NOT NULL,
  card_brand VARCHAR(20),
  card_last4 VARCHAR(4),
  card_exp_month INT,
  card_exp_year INT,
  is_default BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_client (client_id),
  INDEX idx_stripe_pm (stripe_payment_method_id),
  INDEX idx_default (is_default)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Saldo de billetera (proveedor y cliente)
CREATE TABLE wallet_balance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  balance DECIMAL(10,2) DEFAULT 0,
  pending_balance DECIMAL(10,2) DEFAULT 0,
  total_earned DECIMAL(10,2) DEFAULT 0,
  total_withdrawn DECIMAL(10,2) DEFAULT 0,
  currency VARCHAR(3) DEFAULT 'CLP',
  last_transaction_at TIMESTAMP NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user (user_id),
  
  CONSTRAINT chk_wallet_balance_balance CHECK (balance >= 0),
  CONSTRAINT chk_wallet_balance_pending CHECK (pending_balance >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Transacciones de billetera
CREATE TABLE transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type ENUM('payment_received', 'payment_sent', 'withdrawal', 'refund', 'commission') NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'CLP',
  description VARCHAR(255),
  payment_id INT NULL,
  appointment_id INT NULL,
  balance_before DECIMAL(10,2),
  balance_after DECIMAL(10,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL,
  INDEX idx_user (user_id),
  INDEX idx_type (type),
  INDEX idx_created (created_at),
  INDEX idx_payment (payment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Retiros de saldo (proveedor)
CREATE TABLE withdrawals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'CLP',
  bank_account VARCHAR(255) NOT NULL,
  bank_name VARCHAR(100),
  account_holder VARCHAR(255),
  status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
  processed_at TIMESTAMP NULL,
  transaction_reference VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_provider (provider_id),
  INDEX idx_status (status),
  INDEX idx_created (created_at),
  
  CONSTRAINT chk_withdrawals_amount CHECK (amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- RESEÑAS Y FAVORITOS
-- ============================================
--
-- FUNCIONALIDADES FRONTEND:
-- • /client/reservas → ReviewModalComponent (dejar reseña después de cita)
-- • /client/explorar/:workerId → ReviewsComponent (ver reseñas del proveedor)
-- • /dash/estadisticas → ReviewsTableComponent (reseñas recientes)
-- • /client/favoritos → Sistema completo de favoritos
--
-- SISTEMA DE REPUTACIÓN:
-- • Solo se puede reseñar después de cita completada
-- • Rating de 1-5 estrellas (obligatorio)
-- • Comentario de texto (opcional)
-- • Proveedor puede responder a la reseña
-- • Rating promedio se calcula automáticamente via trigger
--
-- ============================================

-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │ TABLA: reviews                                                               │
-- ├─────────────────────────────────────────────────────────────────────────────┤
-- │ PROPÓSITO:                                                                   │
-- │ Almacena las reseñas que los clientes dejan a los proveedores después de    │
-- │ completar un servicio. Es el sistema de reputación y confianza de Adomi.   │
-- │                                                                              │
-- │ FUNCIONALIDADES DEL FRONTEND:                                               │
-- │ • Modal de reseña (/client/reservas → ReviewModalComponent)                │
-- │ • Lista de reseñas en perfil público (/client/explorar/:workerId)          │
-- │ • Tabla de reseñas recientes (/dash/estadisticas → ReviewsTableComponent)  │
-- │ • Sistema de estrellas interactivo (StarRatingComponent)                    │
-- │                                                                              │
-- │ RELACIONES:                                                                  │
-- │ • reviews (N) → (1) appointments (UNA reseña por cita)                     │
-- │ • reviews (N) → (1) users (provider_id - quien recibe)                     │
-- │ • reviews (N) → (1) users (client_id - quien escribe)                      │
-- │ • reviews (1) → (0..1) review_responses (respuesta del proveedor)          │
-- │                                                                              │
-- │ CAMPOS DE RATING:                                                            │
-- │ • rating: Rating general (1-5 estrellas, obligatorio)                       │
-- │ • service_quality_rating: Calidad del servicio (opcional, 1-5)             │
-- │ • communication_rating: Comunicación (opcional, 1-5)                        │
-- │ • punctuality_rating: Puntualidad (opcional, 1-5)                           │
-- │                                                                              │
-- │ MODERACIÓN:                                                                  │
-- │ • is_visible: Permite ocultar reseñas inapropiadas                          │
-- │ • is_flagged: Marca reseñas reportadas para revisión                        │
-- │ • flag_reason: Motivo del reporte                                           │
-- │                                                                              │
-- │ TRIGGER AUTOMÁTICO:                                                          │
-- │ Al insertar review → actualiza provider_profiles.rating_average             │
-- │                    → actualiza provider_profiles.review_count               │
-- │                                                                              │
-- │ VALIDACIÓN IMPORTANTE:                                                       │
-- │ • Solo se puede crear review si appointment.status = 'completed'           │
-- │ • Un appointment solo puede tener UNA review (UNIQUE constraint)           │
-- │ • rating debe estar entre 1 y 5                                            │
-- └─────────────────────────────────────────────────────────────────────────────┘
CREATE TABLE reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  appointment_id INT NOT NULL UNIQUE,
  provider_id INT NOT NULL,
  client_id INT NOT NULL,
  rating INT NOT NULL,
  comment TEXT,
  service_quality_rating INT,
  communication_rating INT,
  punctuality_rating INT,
  is_visible BOOLEAN DEFAULT TRUE,
  is_flagged BOOLEAN DEFAULT FALSE,
  flag_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_provider (provider_id),
  INDEX idx_client (client_id),
  INDEX idx_appointment (appointment_id),
  INDEX idx_rating (rating),
  INDEX idx_visible (is_visible),
  INDEX idx_created (created_at),
  
  CONSTRAINT chk_reviews_rating CHECK (rating >= 1 AND rating <= 5),
  CONSTRAINT chk_reviews_service_quality CHECK (service_quality_rating IS NULL OR (service_quality_rating >= 1 AND service_quality_rating <= 5)),
  CONSTRAINT chk_reviews_communication CHECK (communication_rating IS NULL OR (communication_rating >= 1 AND communication_rating <= 5)),
  CONSTRAINT chk_reviews_punctuality CHECK (punctuality_rating IS NULL OR (punctuality_rating >= 1 AND punctuality_rating <= 5))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Respuestas del proveedor a reseñas
CREATE TABLE review_responses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  review_id INT NOT NULL UNIQUE,
  provider_id INT NOT NULL,
  response_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_review (review_id),
  INDEX idx_provider (provider_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Favoritos del cliente
CREATE TABLE favorites (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  provider_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_client (client_id),
  INDEX idx_provider (provider_id),
  UNIQUE KEY unique_client_provider (client_id, provider_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- CHAT Y MENSAJERÍA
-- ============================================
--
-- FUNCIONALIDADES FRONTEND:
-- • /client/conversaciones → ChatContainerComponent completo
-- • /dash/mensajes → Sistema de chat del proveedor
-- • Componentes: ChatConversationListComponent, ChatMessagesAreaComponent,
--                ChatInputComponent, ChatUserItemComponent
-- • Mobile: Vista de lista → Click en usuario → Vista de chat individual
-- • Desktop: Sidebar de usuarios + área de mensajes simultánea
--
-- SISTEMA DE CHAT:
-- • Conversaciones 1-a-1 entre cliente y proveedor
-- • Mensajes con timestamp y estado leído/no leído
-- • Contador de mensajes no leídos por conversación
-- • Notificaciones cuando llega mensaje nuevo
-- • Preview del último mensaje en lista de conversaciones
--
-- ============================================

-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │ TABLA: conversations                                                         │
-- ├─────────────────────────────────────────────────────────────────────────────┤
-- │ PROPÓSITO:                                                                   │
-- │ Representa una conversación 1-a-1 entre un cliente y un proveedor.          │
-- │ Cada par cliente-proveedor tiene UNA sola conversación.                    │
-- │                                                                              │
-- │ FUNCIONALIDADES DEL FRONTEND:                                               │
-- │ • Lista de conversaciones (/client/conversaciones, /dash/mensajes)         │
-- │ • ChatConversationListComponent (lista de usuarios)                         │
-- │ • Contador de no leídos en NotificationBellComponent                        │
-- │ • Click en "Enviar un mensaje" crea o abre conversación                    │
-- │                                                                              │
-- │ RELACIONES:                                                                  │
-- │ • conversations (N) → (1) users (provider_id)                               │
-- │ • conversations (N) → (1) users (client_id)                                 │
-- │ • conversations (1) → (N) messages                                          │
-- │                                                                              │
-- │ CAMPOS IMPORTANTES:                                                          │
-- │ • last_message_at: Para ordenar conversaciones (más reciente arriba)       │
-- │ • last_message_preview: Muestra preview en la lista                         │
-- │ • provider_unread_count: Contador de no leídos para el proveedor          │
-- │ • client_unread_count: Contador de no leídos para el cliente              │
-- │                                                                              │
-- │ LÓGICA:                                                                      │
-- │ • Al enviar mensaje: actualizar last_message_at y last_message_preview     │
-- │ • Incrementar unread_count del receptor                                     │
-- │ • Al marcar como leído: decrementar unread_count                            │
-- │ • UNIQUE constraint impide duplicar conversación entre mismo par           │
-- └─────────────────────────────────────────────────────────────────────────────┘
CREATE TABLE conversations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL,
  client_id INT NOT NULL,
  last_message_at TIMESTAMP NULL,
  last_message_preview TEXT,
  provider_unread_count INT DEFAULT 0,
  client_unread_count INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_provider (provider_id),
  INDEX idx_client (client_id),
  INDEX idx_last_message (last_message_at),
  UNIQUE KEY unique_conversation (provider_id, client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Mensajes de chat
CREATE TABLE messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NOT NULL,
  sender_id INT NOT NULL,
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP NULL,
  attachment_url VARCHAR(500),
  attachment_type VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_conversation (conversation_id),
  INDEX idx_sender (sender_id),
  INDEX idx_created (created_at),
  INDEX idx_read (is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- NOTIFICACIONES
-- ============================================

-- Notificaciones del sistema
CREATE TABLE notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  action_url VARCHAR(500),
  icon_name VARCHAR(50),
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP NULL,
  related_appointment_id INT NULL,
  related_payment_id INT NULL,
  related_review_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (related_appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  FOREIGN KEY (related_payment_id) REFERENCES payments(id) ON DELETE CASCADE,
  FOREIGN KEY (related_review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  INDEX idx_user (user_id),
  INDEX idx_read (is_read),
  INDEX idx_type (type),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- PROMOCIONES
-- ============================================

-- Promociones del proveedor
CREATE TABLE promotions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL,
  service_id INT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  discount_type ENUM('percentage', 'fixed') NOT NULL,
  discount_value DECIMAL(10,2) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  max_uses INT NULL,
  current_uses INT DEFAULT 0,
  promo_code VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES provider_services(id) ON DELETE CASCADE,
  INDEX idx_provider (provider_id),
  INDEX idx_service (service_id),
  INDEX idx_active (is_active),
  INDEX idx_dates (start_date, end_date),
  INDEX idx_code (promo_code),
  
  CONSTRAINT chk_promotions_discount_value CHECK (discount_value > 0),
  CONSTRAINT chk_promotions_date_order CHECK (end_date >= start_date),
  CONSTRAINT chk_promotions_uses CHECK (current_uses >= 0 AND (max_uses IS NULL OR current_uses <= max_uses))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- PERFIL DEL CLIENTE
-- ============================================

-- MODIFICACIONES (2025-10-10):
--  - Se agrega columna 'notes' (TEXT NULL) en 'client_profiles' para notas permanentes del cliente.

-- Perfil del cliente
CREATE TABLE client_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  profile_photo_url VARCHAR(500),
  address VARCHAR(255),
  commune VARCHAR(100),
  region VARCHAR(100),
  preferred_language ENUM('es', 'en') DEFAULT 'es',
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_client (client_id),
  INDEX idx_commune (commune)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Preferencias de notificaciones
CREATE TABLE notification_preferences (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  email_notifications BOOLEAN DEFAULT TRUE,
  push_notifications BOOLEAN DEFAULT TRUE,
  sms_notifications BOOLEAN DEFAULT FALSE,
  marketing_emails BOOLEAN DEFAULT FALSE,
  appointment_reminders BOOLEAN DEFAULT TRUE,
  payment_notifications BOOLEAN DEFAULT TRUE,
  review_notifications BOOLEAN DEFAULT TRUE,
  chat_notifications BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- CONFIGURACIÓN DE LA PLATAFORMA
-- ============================================

-- Configuración global
CREATE TABLE platform_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  setting_key VARCHAR(100) NOT NULL UNIQUE,
  setting_value TEXT NOT NULL,
  setting_type ENUM('string', 'number', 'boolean', 'json') DEFAULT 'string',
  description TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_key (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tasas de comisión por categoría (opcional)
CREATE TABLE commission_rates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NULL,
  rate DECIMAL(5,2) NOT NULL DEFAULT 15.00,
  effective_from DATE NOT NULL,
  effective_until DATE NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (category_id) REFERENCES service_categories(id) ON DELETE CASCADE,
  INDEX idx_category (category_id),
  INDEX idx_active (is_active),
  INDEX idx_dates (effective_from, effective_until),
  
  CONSTRAINT chk_commission_rates_value CHECK (rate >= 0 AND rate <= 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- VISTAS OPTIMIZADAS PARA BÚSQUEDA
-- ============================================

-- Vista de búsqueda de proveedores
CREATE OR REPLACE VIEW provider_search_view AS
SELECT 
  p.id as provider_id,
  p.email,
  pp.full_name,
  pp.professional_title,
  pp.main_commune,
  pp.main_region,
  pp.bio,
  pp.profile_photo_url,
  pp.is_verified,
  pp.rating_average,
  pp.review_count,
  pp.completed_appointments,
  pp.is_online,
  pp.profile_completion,
  GROUP_CONCAT(DISTINCT sc.name SEPARATOR ', ') as service_categories,
  MIN(ps.price) as min_price,
  MAX(ps.price) as max_price,
  COUNT(DISTINCT ps.id) as service_count
FROM users p
INNER JOIN provider_profiles pp ON p.id = pp.provider_id
LEFT JOIN provider_services ps ON p.id = ps.provider_id AND ps.is_active = TRUE
LEFT JOIN service_categories sc ON ps.category_id = sc.id
WHERE p.role = 'provider' AND p.is_active = TRUE
GROUP BY p.id, pp.full_name, pp.professional_title, pp.main_commune, pp.main_region, 
         pp.bio, pp.profile_photo_url, pp.is_verified, pp.rating_average, 
         pp.review_count, pp.completed_appointments, pp.is_online, pp.profile_completion;

-- ============================================
-- DATOS INICIALES (SEED)
-- ============================================

-- Categorías de servicios
INSERT INTO service_categories (name, slug, description, icon_name, color_hex, order_index) VALUES 
('Belleza y Estética', 'belleza', 'Servicios de belleza, peluquería y estética', 'scissors', '#FF6B9D', 1),
('Salud y Bienestar', 'salud', 'Masajes, terapias y servicios de salud', 'heart', '#4ECDC4', 2),
('Hogar y Limpieza', 'hogar', 'Limpieza, reparaciones y mantenimiento', 'home', '#95E1D3', 3),
('Tecnología', 'tecnologia', 'Reparación de dispositivos, soporte técnico', 'laptop', '#667eea', 4),
('Educación', 'educacion', 'Clases particulares, tutorías', 'book', '#FFA07A', 5),
('Eventos', 'eventos', 'Fotografía, catering, organización', 'camera', '#DDA15E', 6),
('Deportes', 'deportes', 'Entrenamiento personal, coaching', 'activity', '#06D6A0', 7),
('Mascotas', 'mascotas', 'Veterinaria, peluquería, paseo', 'paw', '#FFB4A2', 8),
('Transporte', 'transporte', 'Mudanzas, delivery, conductor', 'truck', '#B5838D', 9),
('Otro', 'otro', 'Servicios personalizados', 'more', '#94A3B8', 10)
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- Configuración de la plataforma
INSERT INTO platform_settings (setting_key, setting_value, setting_type, description) VALUES 
('default_commission_rate', '15.00', 'number', 'Tasa de comisión por defecto (%)'),
('cancellation_hours', '24', 'number', 'Horas mínimas para cancelar sin penalización'),
('max_portfolio_items', '10', 'number', 'Máximo de items en el portafolio'),
('verification_review_time', '3', 'number', 'Días estimados para revisar verificación'),
('min_withdrawal_amount', '10000', 'number', 'Monto mínimo para retiro (CLP)'),
('max_daily_appointments', '20', 'number', 'Máximo de citas por día')
ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value);

-- ============================================
-- TRIGGERS ÚTILES
-- ============================================

-- Actualizar rating promedio del proveedor al crear reseña
DELIMITER //
CREATE TRIGGER update_provider_rating_after_review
AFTER INSERT ON reviews
FOR EACH ROW
BEGIN
  UPDATE provider_profiles
  SET 
    rating_average = (
      SELECT AVG(rating) 
      FROM reviews 
      WHERE provider_id = NEW.provider_id AND is_visible = TRUE
    ),
    review_count = (
      SELECT COUNT(*) 
      FROM reviews 
      WHERE provider_id = NEW.provider_id AND is_visible = TRUE
    )
  WHERE provider_id = NEW.provider_id;
END//
DELIMITER ;

-- Actualizar contador de reservas completadas
DELIMITER //
CREATE TRIGGER update_completed_appointments
AFTER UPDATE ON appointments
FOR EACH ROW
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    UPDATE provider_profiles
    SET completed_appointments = completed_appointments + 1
    WHERE provider_id = NEW.provider_id;
  END IF;
END//
DELIMITER ;

-- Calcular comisión automáticamente
-- NOTA: commission_amount y provider_amount ya vienen calculados desde el appointment
-- o se pueden calcular en el backend al crear el payment.
-- Si quieres calcular aquí, necesitas obtener commission_rate desde otra tabla.
-- Por ahora, comentamos este trigger ya que los campos se calculan en el backend.

-- DELIMITER //
-- CREATE TRIGGER calculate_commission_on_payment
-- BEFORE INSERT ON payments
-- FOR EACH ROW
-- BEGIN
--   -- El commission_rate está en appointments, no en payments
--   -- Los valores commission_amount y provider_amount se calculan en el backend
--   -- antes de insertar el payment
-- END//
-- DELIMITER ;

-- ============================================
-- ÍNDICES COMPUESTOS PARA OPTIMIZACIÓN
-- ============================================

-- Búsqueda de proveedores por ubicación y categoría
CREATE INDEX idx_provider_location_search ON provider_profiles(main_commune, main_region, is_verified, rating_average);

-- Consultas de citas por fecha y estado
CREATE INDEX idx_appointments_provider_date_status ON appointments(provider_id, appointment_date, status);
CREATE INDEX idx_appointments_client_date_status ON appointments(client_id, appointment_date, status);

-- Estadísticas de pagos
CREATE INDEX idx_payments_provider_date ON payments(provider_id, paid_at);
CREATE INDEX idx_payments_status_date ON payments(status, paid_at);

-- Conversaciones activas
CREATE INDEX idx_conversations_last_message ON conversations(last_message_at DESC);

-- ============================================
-- RESUMEN Y NOTAS DE IMPLEMENTACIÓN
-- ============================================

/*
┌─────────────────────────────────────────────────────────────────────────────┐
│ RESUMEN DEL SCHEMA                                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ TOTAL DE TABLAS: 25 tablas                                                  │
│                                                                              │
│ DISTRIBUCIÓN:                                                                │
│ • Core (4): users, plans, subscriptions, plan_expirations                  │
│ • Proveedor (8): provider_profiles, provider_services, provider_portfolio, │
│                  provider_locations, provider_availability,                 │
│                  availability_exceptions, identity_verifications,           │
│                  promotions                                                  │
│ • Cliente (4): client_profiles, payment_methods, wallet_balance,           │
│                notification_preferences                                      │
│ • Operaciones (6): appointments, appointment_history, payments,            │
│                    transactions, withdrawals, favorites                      │
│ • Comunicación (3): conversations, messages, notifications                 │
│ • Sistema (3): service_categories, platform_settings, commission_rates,    │
│                reviews, review_responses                                     │
│                                                                              │
│ RELACIONES PRINCIPALES:                                                      │
│                                                                              │
│     ┌──────┐                                                                │
│     │users │                                                                │
│     └──┬───┘                                                                │
│        │                                                                     │
│    ┌───┴────────────────────────┐                                          │
│    │                            │                                          │
│ ┌──▼────────┐            ┌──────▼─────┐                                   │
│ │ provider_ │            │  client_   │                                   │
│ │ profiles  │            │  profiles  │                                   │
│ └──┬────────┘            └──────┬─────┘                                   │
│    │                            │                                          │
│    ├─→ provider_services        ├─→ payment_methods                       │
│    ├─→ provider_portfolio       ├─→ favorites                              │
│    ├─→ provider_availability    └─→ [appointments]                         │
│    ├─→ identity_verifications                                              │
│    └─→ promotions                                                          │
│                                                                              │
│        ┌────────────────┐                                                   │
│        │  appointments  │ ← CORE BUSINESS                                  │
│        └────┬───────────┘                                                   │
│             │                                                                │
│      ┌──────┼──────┐                                                        │
│      │      │      │                                                        │
│   ┌──▼─┐ ┌─▼──┐ ┌─▼────┐                                                  │
│   │pay-│ │rev-│ │conver│                                                  │
│   │ments│ │iews│ │sations│                                                │
│   └────┘ └────┘ └──────┘                                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

FLUJO DE DATOS PRINCIPAL:

1. REGISTRO Y SETUP:
   users → provider_profiles → provider_services → provider_availability
   
2. CLIENTE BUSCA:
   service_categories → provider_search_view → provider_profiles + services
   
3. CLIENTE AGENDA:
   provider_availability → appointments (pending) → payments (pending)
   
4. PROVEEDOR ACEPTA:
   appointments (pending → confirmed) → payments (completed) → wallet_balance
   
5. SERVICIO COMPLETADO:
   appointments (completed) → reviews → provider_profiles.rating_average
   
6. COMUNICACIÓN:
   users ↔ conversations ↔ messages ↔ notifications

═══════════════════════════════════════════════════════════════════════════════

NOTAS DE IMPLEMENTACIÓN:

1. PERMISOS Y SEGURIDAD:
   - JWT token valida identidad del usuario
   - Middleware requireProvider / requireClient valida rol
   - Middleware requireOwnership valida que el recurso pertenece al usuario
   - Solo el proveedor puede editar su propio perfil (provider_id = req.user.id)
   - Solo el cliente puede editar su propio perfil (client_id = req.user.id)
   - Las reseñas solo se pueden crear si appointment.status = 'completed'
   - Los pagos requieren validación de Stripe Payment Intent
   - Contraseñas hasheadas con bcrypt (ya implementado en auth.ts)

2. LÓGICA DE NEGOCIO:
   - Comisión por defecto: 15% (configurable en platform_settings)
   - Cancelación sin cargo: +24h respecto a la hora de inicio
   - Cancelación con cargo: -24h puede tener penalización
   - Verificación de identidad: proceso manual por admin o automático via proveedor KYC
   - Slots disponibles: calcular en base a (availability - appointments - exceptions)
   - Un proveedor puede tener múltiples servicios
   - Un cliente puede tener múltiples citas simultáneas con diferentes proveedores
   - Un proveedor NO puede tener citas solapadas (validar en backend)

3. CÁLCULOS AUTOMÁTICOS (via Triggers):
   - provider_profiles.rating_average se actualiza al insertar review
   - provider_profiles.review_count se actualiza al insertar review
   - provider_profiles.completed_appointments se actualiza al completar cita
   - payments.commission_amount se calcula al insertar payment
   - payments.provider_amount se calcula al insertar payment
   - conversations.last_message_at se actualiza al insertar message
   - conversations.unread_count se incrementa al insertar message

4. OPTIMIZACIONES:
   - Índices en todos los campos de búsqueda y filtrado
   - Índices compuestos para queries comunes (provider_id + date, etc.)
   - Vista provider_search_view pre-calculada para búsquedas rápidas
   - Usar caché (Redis) para búsquedas frecuentes de proveedores
   - Paginación obligatoria en listas grandes (limit + offset)
   - Agregaciones pre-calculadas para estadísticas (actualizar cada hora)

5. INTEGRACIONES EXTERNAS:
   - Stripe Payment Intents para pagos con tarjeta
   - Stripe Customer para gestión de clientes
   - S3 o storage local para imágenes (profile, cover, portfolio)
   - Nodemailer para envío de emails (ya configurado)
   - WebSocket para chat en tiempo real (opcional, puede usar polling)
   - Push notifications para notificaciones móviles

6. MIGRACIONES:
   - Crear archivos numerados: 001_initial_schema.sql, 002_add_portfolio.sql, etc.
   - Cada migración debe tener su rollback correspondiente
   - Testear migraciones en base de datos de desarrollo primero
   - Usar transacciones para migraciones críticas
   - Documentar cada cambio de schema en el commit

7. DATOS DE PRUEBA (Seed Data):
   - Insertar 10 categorías de servicios (Belleza, Salud, etc.)
   - Crear 3-5 proveedores de prueba con perfiles completos
   - Crear 5-10 clientes de prueba
   - Generar 10-20 servicios distribuidos entre proveedores
   - Simular 10-30 citas en diferentes estados
   - Crear 5-10 reseñas para tener ratings
   - Insertar configuraciones en platform_settings

8. VALIDACIONES CRÍTICAS:
   - Email único en users (UNIQUE constraint)
   - Una conversación por par cliente-proveedor (UNIQUE constraint)
   - Una reseña por appointment (UNIQUE constraint)
   - Precios y montos >= 0 (CHECK constraints)
   - Ratings entre 1-5 (CHECK constraints)
   - Fechas válidas: end > start
   - Tiempos válidos: end_time > start_time
   - Commission rate entre 0-100%

9. PERFORMANCE Y ESCALABILIDAD:
   - Los índices están optimizados para queries comunes
   - Usar SELECT solo campos necesarios, no SELECT *
   - Paginación en todas las listas (page, limit)
   - Lazy loading de relaciones cuando sea posible
   - Caché de resultados de búsqueda por 5-10 minutos
   - Compress responses con gzip
   - Usar connection pooling para MySQL

10. MONITOREO Y LOGS:
    - Log de todas las transacciones en payments
    - Log de cambios de estado en appointment_history
    - Log de acciones críticas (crear/eliminar servicio, aceptar/rechazar cita)
    - Métricas en platform_settings: total_bookings, total_revenue, avg_rating
    - Alertas cuando commission_rate cambia
    - Alertas cuando hay muchos rejected appointments

═══════════════════════════════════════════════════════════════════════════════

ORDEN DE CREACIÓN DE TABLAS (Respeta dependencias):

PASO 1 - CORE:
  ✅ users
  ✅ plans
  ✅ subscriptions

PASO 2 - CATEGORÍAS:
  ✅ service_categories (seed data incluido)

PASO 3 - PERFILES:
  ✅ provider_profiles
  ✅ client_profiles
  ✅ notification_preferences

PASO 4 - SERVICIOS Y CONTENIDO:
  ✅ provider_services
  ✅ provider_portfolio
  ✅ provider_locations

PASO 5 - DISPONIBILIDAD:
  ✅ provider_availability
  ✅ availability_exceptions

PASO 6 - VERIFICACIÓN:
  ✅ identity_verifications

PASO 7 - CITAS (CORE):
  ✅ appointments
  ✅ appointment_history

PASO 8 - PAGOS:
  ✅ payment_methods
  ✅ wallet_balance
  ✅ payments
  ✅ transactions
  ✅ withdrawals

PASO 9 - REPUTACIÓN:
  ✅ reviews
  ✅ review_responses
  ✅ favorites

PASO 10 - COMUNICACIÓN:
  ✅ conversations
  ✅ messages
  ✅ notifications

PASO 11 - MARKETING:
  ✅ promotions

PASO 12 - SISTEMA:
  ✅ platform_settings
  ✅ commission_rates

PASO 13 - VISTAS:
  ✅ provider_search_view

PASO 14 - TRIGGERS:
  ✅ update_provider_rating_after_review
  ✅ update_completed_appointments
  ✅ calculate_commission_on_payment

═══════════════════════════════════════════════════════════════════════════════

PRÓXIMOS PASOS DESPUÉS DE EJECUTAR ESTE SCHEMA:

1. ✅ Verificar que todas las tablas se crearon correctamente:
   SHOW TABLES;

2. ✅ Verificar relaciones:
   SHOW CREATE TABLE appointments;

3. ✅ Insertar datos de prueba (seed data al final de este archivo)

4. ✅ Crear primer endpoint: GET /api/provider/profile

5. ✅ Testear endpoint con Postman

6. ✅ Conectar frontend con backend

7. ✅ Verificar datos en http://localhost:4200/dash/perfil

8. ✅ Iterar con siguientes endpoints según prioridades

═══════════════════════════════════════════════════════════════════════════════
*/

