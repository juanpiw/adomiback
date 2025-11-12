# 🗄️ Scripts de Base de Datos - AdomiApp + Stripe + Fundadores

## ✅ **Scripts Ejecutados - Estructura Actual**

### **1. Creación de la Base de Datos**
```sql
-- ✅ EJECUTADO
CREATE DATABASE adomi
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;
USE adomi;
```

### **2. Tabla `users` (Usuarios)**
```sql
-- ✅ EJECUTADO
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    google_id VARCHAR(255) UNIQUE NULL,
    name VARCHAR(255) NULL, -- Opcional para registro solo con email
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NULL,
    phone VARCHAR(50) NULL,
    role ENUM('client', 'provider') NOT NULL DEFAULT 'client',
    bio TEXT NULL,
    language VARCHAR(10) DEFAULT 'es',
    profile_picture_url VARCHAR(2083) NULL,
    location VARCHAR(255) NULL,
    website VARCHAR(2083) NULL,
    password_reset_token VARCHAR(255) NULL,
    password_reset_expires DATETIME NULL,
    active_plan_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### **3. Tabla `service_categories` (Categorías de Servicios)**
```sql
-- ✅ EJECUTADO
CREATE TABLE service_categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    icon_emoji VARCHAR(10) NULL
);
```

### **4. Tabla `services` (Servicios)**
```sql
-- ✅ EJECUTADO
CREATE TABLE services (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT NULL,
    FOREIGN KEY (category_id) REFERENCES service_categories(id) ON DELETE CASCADE
);
```

### **5. Tabla `provider_services` (Servicios por Proveedor)**
```sql
-- ✅ EJECUTADO
CREATE TABLE provider_services (
    id INT AUTO_INCREMENT PRIMARY KEY,
    provider_id INT NOT NULL,
    service_id INT NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    duration_minutes INT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
    UNIQUE(provider_id, service_id)
);
```

### **6. Tabla `plans` (Planes de Suscripción)**
```sql
-- ✅ EJECUTADO
CREATE TABLE plans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,                      -- "Básico", "Premium", "Fundador"
    stripe_price_id VARCHAR(255) UNIQUE NOT NULL,     -- price_1L2X3Y...
    price DECIMAL(10, 2) NOT NULL,                    -- 9990.00
    currency VARCHAR(10) NOT NULL DEFAULT 'clp',      -- "clp"
    billing_period ENUM('month', 'year') NOT NULL,    -- "month" o "year"
    description TEXT NULL,
    features JSON NULL,                               -- ["Perfil destacado", "Analíticas"]
    max_services INT DEFAULT 5,                       -- Límite de servicios
    max_bookings INT DEFAULT 50,                      -- Límite de reservas
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### **7. Tabla `subscriptions` (Suscripciones)**
```sql
-- ✅ EJECUTADO
CREATE TABLE subscriptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNIQUE NOT NULL,                      -- FK a users
    plan_id INT NOT NULL,                             -- FK a plans
    stripe_subscription_id VARCHAR(255) UNIQUE NOT NULL, -- sub_1L2X3Y...
    stripe_customer_id VARCHAR(255) UNIQUE NOT NULL,  -- cus_1L2X3Y...
    status ENUM('active', 'canceled', 'past_due', 'unpaid', 'trialing') NOT NULL,
    current_period_start TIMESTAMP NOT NULL,
    current_period_end TIMESTAMP NOT NULL,
    trial_end TIMESTAMP NULL,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES plans(id)
);
```

### **8. Tabla `stripe_customers` (Clientes Stripe)**
```sql
-- ✅ EJECUTADO
CREATE TABLE stripe_customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNIQUE NOT NULL,
    stripe_customer_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### **9. Tabla `payment_methods` (Métodos de Pago)**
```sql
-- ✅ EJECUTADO
CREATE TABLE payment_methods (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    stripe_payment_method_id VARCHAR(255) UNIQUE NOT NULL,
    type VARCHAR(50) NOT NULL,                        -- "card", "bank_account"
    card_last4 VARCHAR(4) NULL,
    card_brand VARCHAR(50) NULL,                      -- "visa", "mastercard"
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### **10. Tabla `invoices` (Facturación)**
```sql
-- ✅ EJECUTADO
CREATE TABLE invoices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    subscription_id INT NOT NULL,
    stripe_invoice_id VARCHAR(255) UNIQUE NOT NULL,
    amount_paid DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    status ENUM('draft', 'open', 'paid', 'void', 'uncollectible') NOT NULL,
    invoice_pdf_url VARCHAR(500) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id)
);
```

### **11. Tabla `founder_benefits` (Beneficios de Fundadores)**
```sql
-- ✅ EJECUTADO
CREATE TABLE founder_benefits (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNIQUE NOT NULL,
    benefits JSON NOT NULL,                    -- ["Acceso premium gratuito", "Soporte prioritario", "Descuentos especiales"]
    discount_percentage DECIMAL(5,2) DEFAULT 0.00,
    expires_at TIMESTAMP NULL,                 -- NULL = permanente
    notes TEXT NULL,                          -- Notas del admin sobre por qué se asignó
    assigned_by INT NOT NULL,                 -- Admin que asignó el status
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by) REFERENCES users(id)
);
```

### **12. Tabla `revenue_tracking` (Seguimiento de Ingresos)**
```sql
-- ✅ EJECUTADO
CREATE TABLE revenue_tracking (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,                      -- Usuario que pagó
    subscription_id INT NULL,                  -- FK a subscriptions (si es suscripción)
    invoice_id INT NULL,                       -- FK a invoices
    transaction_type ENUM('subscription', 'one_time', 'refund', 'chargeback') NOT NULL,
    gross_amount DECIMAL(10, 2) NOT NULL,      -- Monto total cobrado
    stripe_fee DECIMAL(10, 2) NOT NULL,        -- Comisión de Stripe (2.9% + $0.30)
    platform_fee DECIMAL(10, 2) NOT NULL,      -- Nuestra comisión
    net_amount DECIMAL(10, 2) NOT NULL,        -- Monto neto que recibimos
    currency VARCHAR(10) NOT NULL DEFAULT 'clp',
    stripe_transaction_id VARCHAR(255) NULL,   -- ID de transacción en Stripe
    status ENUM('pending', 'completed', 'failed', 'refunded') DEFAULT 'pending',
    processed_at TIMESTAMP NULL,               -- Cuando se procesó el pago
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL
);
```

### **13. Tabla `platform_settings` (Configuración de la Plataforma)**
```sql
-- ✅ EJECUTADO
CREATE TABLE platform_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT NOT NULL,
    description TEXT NULL,
    updated_by INT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);
```

### **14. Tabla `plan_expirations` (Fechas de Caducidad de Planes)**
```sql
-- ✅ EJECUTADO
CREATE TABLE plan_expirations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    subscription_id INT NULL,
    plan_id INT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    status ENUM('active', 'expired', 'cancelled') DEFAULT 'active',
    auto_renew BOOLEAN DEFAULT FALSE,
    grace_period_days INT DEFAULT 7,
    downgraded_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL,
    FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE,
    INDEX idx_user_expires (user_id, expires_at),
    INDEX idx_status_expires (status, expires_at)
);
```

### **15. Tabla `refresh_tokens` (Tokens de Renovación JWT)**
```sql
-- ✅ EJECUTADO
CREATE TABLE refresh_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token VARCHAR(255) UNIQUE NOT NULL,
    jti VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    is_revoked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_token (token),
    INDEX idx_jti (jti),
    INDEX idx_expires_at (expires_at)
);
```

### **16. Tabla `user_verifications` (Verificación de Documentos de Usuarios)**
```sql
-- ✅ EJECUTADO
CREATE TABLE user_verifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,                           -- Quién se está verificando
    document_type ENUM('id_card', 'background_check') NOT NULL, -- Tipo de documento
    file_url VARCHAR(2083) NOT NULL,                -- Dónde está guardado el archivo
    status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    reviewed_by INT NULL,                           -- Qué admin lo revisó
    notes TEXT NULL,                                -- Notas del admin
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);
```

### **17. Tabla `user_reports` (Reportes y Denuncias entre Usuarios)**
```sql
-- ✅ EJECUTADO
CREATE TABLE user_reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    reporter_id INT NOT NULL,                       -- Quién reporta
    reported_user_id INT NOT NULL,                  -- A quién reportan
    booking_id INT NULL,                            -- (Opcional) Reserva asociada al problema
    report_category VARCHAR(255) NOT NULL,          -- Ej: 'Robo', 'Acoso', 'Mala Praxis'
    description TEXT NOT NULL,                      -- Descripción detallada del incidente
    status ENUM('new', 'investigating', 'resolved', 'dismissed') NOT NULL DEFAULT 'new',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reported_user_id) REFERENCES users(id) ON DELETE CASCADE
    -- No borramos en cascada si se borra la reserva, el reporte es independiente
);
```

### **18. Tabla `terms_acceptances` (Historial de Aceptación de Términos)**
```sql
-- ✅ EJECUTADO
CREATE TABLE terms_acceptances (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    terms_version VARCHAR(50) NOT NULL,             -- Ej: "1.0 - 2025-09-30"
    ip_address VARCHAR(45) NULL,
    accepted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, terms_version)
);
```

### **19. Tabla `client_reviews` (Calificaciones de Proveedores hacia Clientes)**
```sql
-- ✅ EJECUTADO
CREATE TABLE client_reviews (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    appointment_id INT NOT NULL,
    client_id INT NOT NULL,
    provider_id INT NOT NULL,
    rating TINYINT UNSIGNED NOT NULL,
    comment TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_client_reviews_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
    CONSTRAINT fk_client_reviews_client FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_client_reviews_provider FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uq_client_reviews_appointment_provider UNIQUE (appointment_id, provider_id),
    CONSTRAINT chk_client_reviews_rating CHECK (rating BETWEEN 1 AND 5),
    INDEX idx_client_reviews_client (client_id),
    INDEX idx_client_reviews_provider (provider_id)
);
```

**Descripción:** Permite que el proveedor deje retroalimentación sobre el cliente una vez completada la cita. Sirve para construir reputación de clientes y detectar comportamientos de riesgo.

**Campos Clave:**
- `appointment_id`: Cita asociada a la reseña (1:1 por proveedor).
- `client_id`: Cliente evaluado.
- `provider_id`: Proveedor que emite la evaluación.
- `rating`: Valor de 1 a 5 estrellas.
- `comment`: Texto opcional con detalles de la experiencia.

**Reglas:**
- Una reseña por proveedor y cita (`UNIQUE (appointment_id, provider_id)`).
- Eliminación en cascada cuando se borra la cita, cliente o proveedor.
- Constraint `CHECK` para asegurar ratings entre 1 y 5.

### **20. Columnas agregadas a `client_profiles`**
```sql
-- ✅ EJECUTADO
ALTER TABLE client_profiles
  ADD COLUMN client_rating_average DECIMAL(3,2) NULL DEFAULT NULL,
  ADD COLUMN client_review_count INT NOT NULL DEFAULT 0;

UPDATE client_profiles
   SET client_rating_average = 0,
       client_review_count = 0
 WHERE client_rating_average IS NULL;
```

**Objetivo:** Guardar agregados de reputación del cliente para lecturas rápidas desde el dashboard del proveedor. Inicialmente todos los perfiles se normalizan en 0 reseñas con promedio 0.

### **21. Tabla `reviews` (Calificaciones y Reseñas de Clientes hacia Proveedores)**
```sql
-- ✅ EJECUTADO
CREATE TABLE reviews (
    id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT UNIQUE NOT NULL,                 -- Cada reserva solo puede tener una reseña
    client_id INT NOT NULL,
    provider_id INT NOT NULL,
    rating TINYINT UNSIGNED NOT NULL,               -- De 1 a 5 estrellas
    comment TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE
    -- Aquí podrías añadir una FK a una futura tabla 'bookings'
);
```

### **22. Tabla `bookings` (Sistema de Reservas/Citas)**
```sql
-- ✅ EJECUTADO
CREATE TABLE bookings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    client_id INT NOT NULL,
    provider_id INT NOT NULL,
    provider_service_id INT NOT NULL, -- Referencia al servicio específico del proveedor
    booking_time DATETIME NOT NULL, -- Fecha y hora agendada
    status ENUM('pending', 'confirmed', 'completed', 'cancelled_by_client', 'cancelled_by_provider', 'no_show') NOT NULL DEFAULT 'pending',
    final_price DECIMAL(10, 2) NOT NULL, -- Precio final acordado/pagado
    notes_from_client TEXT NULL, -- Notas del cliente al reservar
    notes_from_provider TEXT NULL, -- Notas del proveedor
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (provider_service_id) REFERENCES provider_services(id) ON DELETE CASCADE,
    INDEX idx_booking_time (booking_time),
    INDEX idx_booking_status (status)
);
```

**Descripción:** Tabla central del sistema de reservas. Gestiona todas las citas entre clientes y proveedores.

**Campos Clave:**
- `client_id`: Cliente que solicita el servicio
- `provider_id`: Proveedor que ofrece el servicio  
- `provider_service_id`: Servicio específico del proveedor
- `booking_time`: Fecha y hora de la cita
- `status`: Estado de la reserva (pending, confirmed, completed, etc.)
- `final_price`: Precio final acordado

**Estados de Reserva:**
- `pending`: Reserva pendiente de confirmación
- `confirmed`: Reserva confirmada por ambas partes
- `completed`: Servicio completado exitosamente
- `cancelled_by_client`: Cancelada por el cliente
- `cancelled_by_provider`: Cancelada por el proveedor
- `no_show`: Cliente no se presentó

**Índices:**
- `idx_booking_time`: Para consultas por fecha/hora
- `idx_booking_status`: Para filtros por estado

### **23. Tablas `provider_invites` y `provider_invite_events` (Referidos de Proveedores)**
```sql
-- ✅ EJECUTADO
CREATE TABLE provider_invites (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    inviter_provider_id INT NOT NULL,
    invite_code VARCHAR(32) NOT NULL,
    invitee_email VARCHAR(255) NULL,
    invitee_phone VARCHAR(32) NULL,
    invitee_name VARCHAR(255) NULL,
    status ENUM('issued','registered','verified','expired','revoked') NOT NULL DEFAULT 'issued',
    invitee_provider_id INT NULL,
    registered_at DATETIME NULL,
    verified_at DATETIME NULL,
    expires_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_provider_invites_inviter FOREIGN KEY (inviter_provider_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_provider_invites_invitee FOREIGN KEY (invitee_provider_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uq_provider_invites_code UNIQUE (invite_code),
    INDEX idx_provider_invites_inviter_status (inviter_provider_id, status),
    INDEX idx_provider_invites_status (status),
    INDEX idx_provider_invites_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE provider_invite_events (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    invite_id BIGINT UNSIGNED NOT NULL,
    inviter_provider_id INT NOT NULL,
    event_type ENUM('issued','resent','registered','verified','expired','revoked','limit_blocked','duplicate_invitee') NOT NULL,
    metadata JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_provider_invite_events_invite FOREIGN KEY (invite_id) REFERENCES provider_invites(id) ON DELETE CASCADE,
    INDEX idx_provider_invite_events_inviter (inviter_provider_id),
    INDEX idx_provider_invite_events_type (event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE provider_profiles
  ADD COLUMN invite_quota INT NOT NULL DEFAULT 3 AFTER review_count,
  ADD COLUMN invite_used INT NOT NULL DEFAULT 0 AFTER invite_quota,
  ADD COLUMN pioneer_unlocked_at DATETIME NULL AFTER invite_used;

UPDATE provider_profiles
   SET invite_quota = 3,
       invite_used = 0
 WHERE invite_quota IS NULL OR invite_used IS NULL;
```

**Objetivo:** Soportar el flywheel “Invitaciones Doradas”. `provider_invites` gestiona el ciclo de la invitación; `provider_invite_events` registra actividad para auditoría y métricas. Los campos adicionales en `provider_profiles` almacenan cupos, consumo y la marca temporal cuando el proveedor alcanza el estatus “Pionero”.

### **21. Tabla `promo_signups` (Registros de Promoción/Prueba Gratis)**
```sql
-- ✅ EJECUTADO
CREATE TABLE promo_signups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,                   -- Nombre completo del usuario
    correo VARCHAR(255) NOT NULL,                   -- Email del usuario
    profesion VARCHAR(100) NOT NULL,                -- Profesión o servicio (estilista, chef, etc.)
    notas TEXT NULL,                                -- Notas adicionales del usuario
    status ENUM('pending', 'contacted', 'converted', 'cancelled') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Índices para optimizar consultas
    INDEX idx_email (correo),
    INDEX idx_status (status),
    INDEX idx_profesion (profesion),
    INDEX idx_created_at (created_at),
    
    -- Constraint para email único
    UNIQUE KEY unique_email (correo)
);
```

---

## 🔧 **Correcciones de Redundancia Aplicadas**

### **1. Eliminación de Redundancia en Stripe**
```sql
-- ✅ EJECUTADO
-- Eliminar columna redundante en users (stripe_customer_id)
-- Ahora la única fuente de verdad es la tabla stripe_customers
ALTER TABLE users DROP COLUMN stripe_customer_id;
```

### **2. Eliminación de Redundancia en Beneficios Fundadores**
```sql
-- ✅ EJECUTADO
-- Eliminar columnas redundantes de fundador en users
-- Toda la info de fundadores está centralizada en founder_benefits
ALTER TABLE users DROP FOREIGN KEY users_ibfk_1;
ALTER TABLE users
DROP COLUMN is_founder,
DROP COLUMN founder_discount_percentage,
DROP COLUMN founder_benefits,
DROP COLUMN founder_assigned_by,
DROP COLUMN founder_assigned_at,
DROP COLUMN subscription_status;
```

---

## 📊 **Datos Iniciales Insertados**

### **1. Categorías de Servicios**
```sql
-- ✅ EJECUTADO
INSERT INTO service_categories (name) VALUES
('Belleza y Cuidado Personal'),
('Salud y Bienestar'),
('Mantenimiento y Reparaciones del Hogar'),
('Servicios Profesionales y Educativos'),
('Servicios para Mascotas');
```

### **2. Servicios por Categoría**
```sql
-- ✅ EJECUTADO
INSERT INTO services (category_id, name) VALUES
-- Belleza y Cuidado Personal
(1, 'Estilista / Peluquero(a)'), (1, 'Barbero(a)'), (1, 'Manicurista y Pedicurista'), 
(1, 'Maquillador(a) Profesional'), (1, 'Masoterapeuta / Masajista'), (1, 'Cosmetólogo(a) / Esteticista'), 
(1, 'Asesor(a) de Imagen'), (1, 'Depilador(a)'),

-- Salud y Bienestar
(2, 'Kinesiólogo(a)'), (2, 'Enfermero(a)'), (2, 'Cuidador(a) de Adulto Mayor / Pacientes'), 
(2, 'Entrenador(a) Personal'), (2, 'Nutricionista'), (2, 'Terapeuta Ocupacional'), 
(2, 'Fonoaudiólogo(a)'), (2, 'Podólogo(a) Clínico'), (2, 'Instructor(a) de Yoga / Pilates'), 
(2, 'Cuidador(a) de Niños (Babysitter)'),

-- Mantenimiento y Reparaciones del Hogar
(3, 'Chef Profesional'), (3, 'Electricista'), (3, 'Cerrajero'), (3, 'Técnico en Climatización'), 
(3, 'Técnico en Electrodomésticos'), (3, 'Maestro(a) de Mantenimiento (Handyman)'), 
(3, 'Armador(a) de Muebles'), (3, 'Personal de Aseo y Limpieza'), (3, 'Jardinero(a)'), 
(3, 'Soporte Técnico Computacional'),

-- Servicios Profesionales y Educativos
(4, 'Profesor(a) Particular'), (4, 'Chef a Domicilio'), (4, 'Abogado(a)'), (4, 'Contador(a)'), 
(4, 'Fotógrafo(a)'), (4, 'Profesor(a) de Idiomas'), (4, 'Profesor(a) de Música'), 
(4, 'Organizador(a) Profesional de Espacios'), (4, 'Asesor(a) de Pymes'),

-- Servicios para Mascotas
(5, 'Paseador(a) de Perros'), (5, 'Médico(a) Veterinario(a)'), (5, 'Peluquero(a) Canino y Felino'), 
(5, 'Adiestrador(a) Canino');
```

### **3. Planes de Suscripción**
```sql
-- ✅ EJECUTADO
INSERT INTO plans (name, stripe_price_id, price, currency, billing_period, description, features, max_services, max_bookings) VALUES
('Básico', 'price_basico_mensual', 0.00, 'clp', 'month', 'Plan gratuito para empezar', '["Perfil básico", "Hasta 5 servicios", "Hasta 50 reservas/mes"]', 5, 50),
('Premium', 'price_premium_mensual', 9990.00, 'clp', 'month', 'Plan completo para profesionales', '["Perfil destacado", "Servicios ilimitados", "Reservas ilimitadas", "Analíticas avanzadas"]', 999, 9999),
('Fundador', 'price_fundador_mensual', 19990.00, 'clp', 'month', 'Plan premium con beneficios especiales', '["Perfil destacado", "Servicios ilimitados", "Reservas ilimitadas", "Analíticas avanzadas", "Soporte prioritario", "Herramientas de marketing"]', 999, 9999);
```

### **4. Configuraciones de Plataforma**
```sql
-- ✅ EJECUTADO
INSERT INTO platform_settings (setting_key, setting_value, description) VALUES
('stripe_fee_percentage', '2.9', 'Porcentaje de comisión de Stripe'),
('stripe_fee_fixed', '0.30', 'Comisión fija de Stripe en USD'),
('platform_fee_percentage', '10.0', 'Nuestra comisión por transacción'),
('currency', 'clp', 'Moneda principal de la plataforma'),
('tax_rate', '19.0', 'IVA en Chile'),
('min_payout_amount', '50000', 'Monto mínimo para retiro de fondos'),
('payout_schedule', 'weekly', 'Frecuencia de pagos a proveedores');
```

### **5. Usuarios de Prueba**
```sql
-- ✅ EJECUTADO
INSERT INTO users (name, email, password, phone, role, bio, location) VALUES 
('Ana Pérez (Profesional)', 'ana.perez.profesional@adomi.com', 'hash_de_bcrypt_para_password123', '+56987654321', 'provider', 'Estilista con 10 años de experiencia.', 'Providencia, Santiago'),
('Carlos Rojas (Cliente)', 'carlos.rojas.cliente@adomi.com', 'hash_de_bcrypt_para_password456', '+56912345678', 'client', NULL, 'Maipú, Santiago');
```

### **6. Servicios de Proveedor de Ejemplo**
```sql
-- ✅ EJECUTADO
INSERT INTO provider_services (provider_id, service_id, price, duration_minutes) VALUES
(1, 1, 25000.00, 60),  -- Estilista
(1, 3, 15000.00, 45),  -- Manicurista
(1, 4, 30000.00, 75);  -- Maquilladora
```

### **7. Beneficios de Fundadores**
```sql
-- ✅ EJECUTADO
INSERT INTO founder_benefits (user_id, benefits, discount_percentage, notes, assigned_by) VALUES
(1, '["Acceso premium gratuito", "Soporte prioritario", "Descuentos especiales", "Acceso a características beta"]', 100.00, 'Inversor inicial - $50,000 aportados', 1),
(2, '["Acceso premium gratuito", "Soporte prioritario"]', 50.00, 'Early adopter - Usuario #5', 1);
```

---

## 🔍 **Índices para Optimización**

### **Índices de Performance**
```sql
-- ✅ EJECUTADO
-- Índices en provider_services
CREATE INDEX idx_provider ON provider_services(provider_id);
CREATE INDEX idx_service ON provider_services(service_id);

-- Índice en services por categoría
CREATE INDEX idx_service_category ON services(category_id);

-- Índices en suscripciones
CREATE INDEX idx_subscription_plan ON subscriptions(plan_id);
CREATE INDEX idx_subscription_user ON subscriptions(user_id);

-- Índices en revenue_tracking
CREATE INDEX idx_revenue_status ON revenue_tracking(status);
CREATE INDEX idx_revenue_processed ON revenue_tracking(processed_at);
```

---

## 🔍 **Verificación de Scripts Ejecutados**

### **Comandos para verificar que todo se creó correctamente:**

```sql
-- Verificar que todas las tablas existen
SHOW TABLES;

-- Verificar estructura de la tabla users
DESCRIBE users;

-- Verificar estructura de la tabla plans
DESCRIBE plans;

-- Verificar estructura de la tabla subscriptions
DESCRIBE subscriptions;

-- Verificar estructura de la tabla founder_benefits
DESCRIBE founder_benefits;

-- Verificar que los planes se insertaron
SELECT * FROM plans;

-- Verificar que los fundadores se insertaron
SELECT * FROM founder_benefits;

-- Verificar usuarios de prueba
SELECT id, name, email, role, created_at FROM users;
```

---

## 📊 **Estado Actual de la Base de Datos**

### **✅ Tablas Creadas:**
- [x] `users` - Usuarios del sistema
- [x] `service_categories` - Categorías de servicios
- [x] `services` - Servicios disponibles
- [x] `provider_services` - Servicios por proveedor
- [x] `plans` - Planes de suscripción
- [x] `subscriptions` - Suscripciones activas
- [x] `stripe_customers` - Clientes de Stripe
- [x] `payment_methods` - Métodos de pago
- [x] `invoices` - Facturación
- [x] `founder_benefits` - Beneficios de fundadores
- [x] `revenue_tracking` - Seguimiento de ingresos
- [x] `platform_settings` - Configuración de la plataforma
- [x] `plan_expirations` - Fechas de caducidad de planes
- [x] `refresh_tokens` - Tokens de renovación JWT
- [x] `user_verifications` - Verificación de documentos de usuarios
- [x] `user_reports` - Reportes y denuncias entre usuarios
- [x] `terms_acceptances` - Historial de aceptación de términos
- [x] `reviews` - Calificaciones y reseñas
- [x] `bookings` - Sistema de reservas/citas
- [x] `promo_signups` - Registros de promoción/prueba gratis

### **✅ Características de la Estructura:**
- [x] **Sin redundancia**: Eliminadas columnas duplicadas entre tablas
- [x] **Normalizada**: Estructura optimizada para consultas eficientes
- [x] **Índices optimizados**: Para búsquedas rápidas
- [x] **Integridad referencial**: Foreign keys bien definidas
- [x] **Soporte completo para Stripe**: Todas las tablas necesarias
- [x] **Sistema de fundadores**: Beneficios y descuentos
- [x] **Seguimiento de ingresos**: Contabilidad interna
- [x] **JWT tokens**: Sistema de autenticación robusto
- [x] **Verificación de usuarios**: Documentos y antecedentes
- [x] **Sistema de reportes**: Denuncias y moderación
- [x] **Términos y condiciones**: Historial de aceptación
- [x] **Sistema de reseñas**: Calificaciones y feedback
- [x] **Sistema de promociones**: Registros de prueba gratis y seguimiento

### **✅ Datos Iniciales:**
- [x] 5 categorías de servicios insertadas
- [x] 40+ servicios por categoría insertados
- [x] 3 planes insertados (Básico, Premium, Fundador)
- [x] 2 usuarios de prueba insertados
- [x] 2 fundadores de ejemplo insertados
- [x] Configuraciones de plataforma insertadas

### **🔒 Nuevas Tablas de Seguridad y Moderación:**

#### **Pilar 2: Verificación de Documentos (`user_verifications`)**
- **Propósito**: Verificar identidad y antecedentes de usuarios
- **Tipos de documentos**: Cédula de identidad, antecedentes penales
- **Estados**: Pendiente, Aprobado, Rechazado
- **Auditoría**: Registro de quién revisó y cuándo

#### **Pilar 3: Términos y Condiciones (`terms_acceptances`)**
- **Propósito**: Historial de aceptación de términos por versión
- **Trazabilidad**: IP address y timestamp de aceptación
- **Versionado**: Control de versiones de términos
- **Unicidad**: Un usuario solo puede aceptar cada versión una vez

#### **Pilar 4: Sistema de Reportes (`user_reports`)**
- **Propósito**: Denuncias entre usuarios y moderación
- **Categorías**: Robo, Acoso, Mala Praxis, etc.
- **Estados**: Nuevo, Investigando, Resuelto, Descartado
- **Contexto**: Opcionalmente asociado a reservas específicas

#### **Pilar 4: Sistema de Reseñas (`reviews`)**
- **Propósito**: Calificaciones y feedback post-servicio
- **Escala**: 1-5 estrellas
- **Unicidad**: Una reseña por reserva
- **Participantes**: Cliente califica al proveedor

#### **Pilar 5: Sistema de Reservas (`bookings`)**
Esta tabla es el **corazón del negocio** de Adomi. Permite a los clientes reservar servicios específicos de proveedores.

**Funcionalidades:**
- **Reservas por servicio**: Cada reserva está vinculada a un servicio específico del proveedor
- **Estados de reserva**: Manejo completo del ciclo de vida de una reserva
- **Precios dinámicos**: El precio final puede diferir del precio base del servicio
- **Comunicación bidireccional**: Notas tanto del cliente como del proveedor
- **Trazabilidad completa**: Timestamps de creación y actualización

**Casos de uso:**
- Cliente reserva un corte de pelo para mañana a las 10:00 AM
- Proveedor confirma la reserva y agrega notas
- Cliente cancela la reserva
- Servicio completado exitosamente

#### **Pilar 6: Sistema de Promociones (`promo_signups`)**
- **Propósito**: Capturar leads interesados en prueba gratis de 3 meses
- **Campos**: Nombre, email, profesión, notas adicionales
- **Estados de seguimiento**: Pendiente → Contactado → Convertido/Cancelado
- **Análisis**: Estadísticas por profesión y estado de conversión
- **Seguridad**: Rate limiting (3 intentos por 15 minutos por IP)
- **Unicidad**: Un email por promoción para evitar spam

---

## 🚀 **Próximos Pasos**

Ahora que la base de datos está completamente actualizada y optimizada, podemos proceder con:

1. **✅ Backend con Seguridad JWT** - Ya implementado
2. **✅ Frontend preparado** - Ya implementado
3. **🔄 Integración Stripe** - En progreso
4. **🔄 Sistema de Fundadores** - En progreso
5. **🔄 Dashboard de Administración** - Pendiente
6. **🔄 Sistema de Verificación de Documentos** - Pendiente
7. **🔄 Sistema de Reportes y Moderación** - Pendiente
8. **🔄 Sistema de Términos y Condiciones** - Pendiente
9. **🔄 Sistema de Reseñas y Calificaciones** - Pendiente

### **🔒 Implementación de Pilares de Seguridad:**

- **Pilar 2**: Verificación de documentos (cédula, antecedentes)
- **Pilar 3**: Términos y condiciones con versionado
- **Pilar 4**: Sistema de reportes y reseñas para moderación

**¡La base de datos está completamente actualizada y lista para la integración completa con todos los pilares de seguridad!** 🎉