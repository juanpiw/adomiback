# 🔍 Análisis de Migración - Backend Adomi

## 📊 **Estado Actual de la Base de Datos**

### **Tablas Existentes (en db.ts y queries):**

#### **Tablas Core (Ya Funcionando):**
```sql
✅ users (con stripe_customer_id)
✅ service_categories
✅ services (catálogo global de servicios)
✅ provider_services (relación many-to-many)
✅ password_reset_tokens
✅ refresh_tokens
✅ promo_signups
```

#### **Tablas de Stripe (Sistema Actual):**
```sql
✅ stripe_customers (user_id, stripe_customer_id, email, name)
✅ subscriptions (user_id, plan_id, stripe_subscription_id, stripe_customer_id)
✅ plans
✅ plan_expirations
✅ founder_benefits
✅ revenue_tracking
✅ platform_settings
```

#### **Tablas de Verificación:**
```sql
✅ user_verifications (para verificación de identidad)
```

#### **Tablas de Contabilidad:**
```sql
✅ revenue_tracking
✅ platform_settings
```

---

## ⚠️ **Conflictos Detectados**

### **1. Tabla `users`**
**Backend Actual:**
```sql
CREATE TABLE users (
  id INT,
  google_id VARCHAR(255),
  name VARCHAR(255),
  email VARCHAR(255),
  password VARCHAR(255),
  role ENUM('client', 'provider'),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
```

**Schema Nuevo:**
```sql
CREATE TABLE users (
  id INT,
  google_id VARCHAR(255),
  name VARCHAR(255),
  email VARCHAR(255),
  password VARCHAR(255),
  role ENUM('client', 'provider', 'admin'), ← NUEVO
  stripe_customer_id VARCHAR(255), ← YA EXISTE
  is_active BOOLEAN, ← NUEVO
  email_verified BOOLEAN, ← NUEVO
  phone VARCHAR(20), ← NUEVO
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
```

**✅ Solución:** ALTER TABLE para agregar columnas nuevas

---

### **2. Tabla `service_categories`**
**Backend Actual:**
```sql
CREATE TABLE service_categories (
  id INT,
  name VARCHAR(255),
  description TEXT,
  created_at TIMESTAMP
)
```

**Schema Nuevo:**
```sql
CREATE TABLE service_categories (
  id INT,
  name VARCHAR(255),
  slug VARCHAR(255), ← NUEVO
  description TEXT,
  icon_name VARCHAR(50), ← NUEVO
  color_hex VARCHAR(7), ← NUEVO
  is_active BOOLEAN, ← NUEVO
  order_index INT, ← NUEVO
  parent_category_id INT, ← NUEVO
  created_at TIMESTAMP
)
```

**✅ Solución:** ALTER TABLE para agregar columnas nuevas

---

### **3. Tabla `provider_services`**
**Backend Actual (Tabla intermedia):**
```sql
CREATE TABLE provider_services (
  id INT,
  provider_id INT,
  service_id INT, ← Referencia a tabla 'services' (catálogo global)
  is_active BOOLEAN,
  created_at TIMESTAMP
)
```

**Schema Nuevo (Tabla directa):**
```sql
CREATE TABLE provider_services (
  id INT,
  provider_id INT,
  name VARCHAR(255), ← Datos directos, NO referencia
  description TEXT,
  price DECIMAL(10,2),
  duration_minutes INT,
  category_id INT, ← Referencia a service_categories
  custom_category VARCHAR(255),
  ... muchos campos más
)
```

**🔴 CONFLICTO MAYOR:** Modelos completamente diferentes

**Opciones:**
1. **Renombrar la tabla actual** a `provider_services_old` y crear la nueva
2. **Migrar datos** de la tabla vieja a la nueva
3. **Eliminar la tabla vieja** (CUIDADO: puede romper código)

---

### **4. Tabla `stripe_customers`**
**Backend Actual:**
```sql
CREATE TABLE stripe_customers (
  id INT,
  user_id INT,
  stripe_customer_id VARCHAR(255),
  email VARCHAR(255),
  name VARCHAR(255)
)
```

**Schema Nuevo:**
❌ **NO EXISTE** - El nuevo schema pone `stripe_customer_id` directamente en `users`

**🔴 CONFLICTO:** El código actual usa queries a `stripe_customers`

**✅ Solución:** 
- Opción 1: Mantener tabla `stripe_customers` (más seguro)
- Opción 2: Migrar datos a `users.stripe_customer_id` y eliminar tabla
- Opción 3: Tener ambas por compatibilidad

---

### **5. Tabla `subscriptions`**
**Backend Actual:**
```sql
CREATE TABLE subscriptions (
  id INT,
  user_id INT,
  plan_id INT,
  stripe_subscription_id VARCHAR(255),
  stripe_customer_id VARCHAR(255), ← Duplicado
  status ENUM(...),
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  ...más campos de Stripe
)
```

**Schema Nuevo:**
```sql
CREATE TABLE subscriptions (
  id INT,
  user_id INT,
  plan_id INT,
  stripe_subscription_id VARCHAR(255),
  status ENUM('active', 'cancelled', 'expired', 'past_due'), ← ENUM diferente
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  cancel_at_period_end BOOLEAN,
  ...
)
```

**🟡 CONFLICTO MENOR:** Estados ENUM diferentes

**✅ Solución:** Actualizar ENUM para incluir todos los estados de Stripe

---

## 🔄 **Plan de Migración Segura**

### **Estrategia Recomendada: Migración Incremental**

#### **Fase 1: Mantener Compatibilidad (SIN ROMPER NADA)**
```sql
-- 1. Agregar columnas nuevas a tablas existentes (ALTER TABLE)
-- 2. Mantener tablas actuales que funcionan (stripe_customers, etc.)
-- 3. Crear solo las tablas nuevas que no existen
-- 4. NO eliminar ni renombrar tablas que se usan actualmente
```

#### **Fase 2: Migración de Datos**
```sql
-- 1. Copiar datos de tablas viejas a nuevas
-- 2. Validar que los datos se copiaron correctamente
-- 3. Actualizar queries para usar nuevas tablas
```

#### **Fase 3: Limpieza (Después de Validar)**
```sql
-- 1. Deprecar tablas viejas
-- 2. Eliminar código que usa tablas viejas
-- 3. DROP tables antiguas
```

---

## 📋 **Script de Migración Segura**

### **Archivo: `migrations/001_safe_migration.sql`**

```sql
-- ============================================
-- MIGRACIÓN SEGURA - NO ROMPE CÓDIGO EXISTENTE
-- ============================================

USE adomiapp;

-- ============================================
-- PASO 1: ACTUALIZAR TABLAS EXISTENTES
-- ============================================

-- Actualizar tabla users (agregar campos nuevos)
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE AFTER role,
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE AFTER is_active,
  ADD COLUMN IF NOT EXISTS phone VARCHAR(20) AFTER email_verified,
  MODIFY COLUMN role ENUM('client', 'provider', 'admin') NOT NULL DEFAULT 'client';

-- Índice para is_active
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);

-- Actualizar tabla service_categories (agregar campos nuevos)
ALTER TABLE service_categories
  ADD COLUMN IF NOT EXISTS slug VARCHAR(255) AFTER name,
  ADD COLUMN IF NOT EXISTS icon_name VARCHAR(50) AFTER description,
  ADD COLUMN IF NOT EXISTS color_hex VARCHAR(7) AFTER icon_name,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE AFTER color_hex,
  ADD COLUMN IF NOT EXISTS order_index INT DEFAULT 0 AFTER is_active,
  ADD COLUMN IF NOT EXISTS parent_category_id INT NULL AFTER order_index;

-- Generar slugs para categorías existentes
UPDATE service_categories SET slug = LOWER(REPLACE(name, ' ', '-')) WHERE slug IS NULL;

-- Hacer slug único
ALTER TABLE service_categories ADD UNIQUE KEY IF NOT EXISTS idx_slug_unique (slug);

-- Índices para service_categories
CREATE INDEX IF NOT EXISTS idx_categories_active ON service_categories(is_active);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON service_categories(parent_category_id);

-- Actualizar tabla subscriptions (agregar campos nuevos si no existen)
-- La tabla ya tiene la mayoría de campos necesarios

-- ============================================
-- PASO 2: RENOMBRAR TABLA CONFLICTIVA
-- ============================================

-- Renombrar provider_services actual a provider_services_old
-- (Esta es la tabla intermedia que ya no se usará)
RENAME TABLE provider_services TO provider_services_legacy;

-- Renombrar services a services_legacy (catálogo global que ya no se usará)
RENAME TABLE services TO services_legacy;

-- ============================================
-- PASO 3: CREAR NUEVA TABLA provider_services
-- ============================================

-- Nueva estructura donde cada proveedor define sus propios servicios
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

-- ============================================
-- PASO 4: CREAR TABLAS NUEVAS (NO CONFLICTIVAS)
-- ============================================

-- provider_profiles
-- provider_portfolio
-- provider_locations
-- provider_availability
-- availability_exceptions
-- identity_verifications
-- appointments
-- appointment_history
-- payments
-- payment_methods
-- wallet_balance
-- transactions
-- withdrawals
-- reviews
-- review_responses
-- favorites
-- conversations
-- messages
-- notifications
-- promotions
-- client_profiles
-- notification_preferences
-- commission_rates

-- (Copiar definiciones completas desde DATABASE_SCHEMA_COMPLETE.sql)

-- ============================================
-- PASO 5: MANTENER TABLAS ACTUALES DE STRIPE
-- ============================================

-- NO tocar estas tablas, están funcionando:
-- ✅ stripe_customers (mantener)
-- ✅ subscriptions (solo agregar campos si faltan)
-- ✅ plans (mantener)
-- ✅ plan_expirations (mantener)
-- ✅ founder_benefits (mantener)
-- ✅ revenue_tracking (mantener)
-- ✅ platform_settings (mantener)
-- ✅ user_verifications (mantener)

-- ============================================
-- PASO 6: MIGRAR DATOS (SI NECESARIO)
-- ============================================

-- Migrar servicios de provider_services_legacy a provider_services
-- Solo si hay datos en la tabla vieja

INSERT INTO provider_services (provider_id, name, description, price, duration_minutes, category_id)
SELECT 
  ps_old.provider_id,
  s_old.name,
  s_old.description,
  s_old.price,
  s_old.duration_minutes,
  s_old.category_id
FROM provider_services_legacy ps_old
INNER JOIN services_legacy s_old ON ps_old.service_id = s_old.id
WHERE ps_old.is_active = TRUE;

-- ============================================
-- NOTAS IMPORTANTES
-- ============================================

/*
TABLAS QUE NO SE DEBEN TOCAR (Sistema de Stripe funcionando):
- stripe_customers
- subscriptions (estructura actual)
- plans
- plan_expirations
- founder_benefits
- revenue_tracking
- platform_settings

TABLAS QUE SE RENOMBRAN (Ya no se usarán):
- provider_services → provider_services_legacy
- services → services_legacy

TABLAS NUEVAS (No existían antes):
- provider_profiles ⭐
- provider_portfolio
- provider_locations
- provider_availability
- availability_exceptions
- identity_verifications
- appointments ⭐⭐⭐
- appointment_history
- payments (nueva estructura)
- payment_methods
- wallet_balance
- transactions
- withdrawals
- reviews
- review_responses
- favorites
- conversations
- messages
- notifications
- promotions
- client_profiles
- notification_preferences
- commission_rates
*/
```

---

## 🎯 **Recomendación: Script de Migración por Partes**

### **Archivo 1: `001_update_existing_tables.sql`**
Actualizar tablas que ya existen:
- users (agregar columnas)
- service_categories (agregar columnas)

### **Archivo 2: `002_rename_conflicting_tables.sql`**
Renombrar tablas que tienen conflicto:
- provider_services → provider_services_legacy
- services → services_legacy

### **Archivo 3: `003_create_provider_tables.sql`**
Crear todas las tablas del proveedor:
- provider_profiles
- provider_services (nueva)
- provider_portfolio
- provider_locations
- provider_availability
- availability_exceptions
- identity_verifications

### **Archivo 4: `004_create_operations_tables.sql`**
Crear tablas de operaciones:
- appointments
- appointment_history
- payments (nueva estructura)
- payment_methods
- wallet_balance
- transactions
- withdrawals

### **Archivo 5: `005_create_social_tables.sql`**
Crear tablas sociales:
- reviews
- review_responses
- favorites
- conversations
- messages
- notifications

### **Archivo 6: `006_create_system_tables.sql`**
Crear tablas de sistema:
- promotions
- client_profiles
- notification_preferences
- commission_rates

### **Archivo 7: `007_create_views_and_triggers.sql`**
Crear vistas y triggers:
- provider_search_view
- update_provider_rating_after_review
- update_completed_appointments
- calculate_commission_on_payment

---

## 🔐 **Impacto en Endpoints Existentes**

### **✅ NO SE ROMPEN (Siguen funcionando):**
```
/auth/register ✅
/auth/login ✅
/auth/forgot-password ✅
/auth/reset-password ✅
/plans ✅
/subscriptions/* ✅ (usa stripe_customers y subscriptions actuales)
/stripe-checkout/* ✅
/webhooks/stripe ✅
/plan-expirations/* ✅
/founders/* ✅
/accounting/* ✅
```

### **⚠️ PUEDEN NECESITAR AJUSTES:**
```
/verifications/* ⚠️ (verificar si usa nueva estructura)
```

### **❌ NO EXISTEN AÚN (Por implementar):**
```
/provider/profile
/provider/services
/provider/availability
/appointments
/payments (nueva estructura)
... todos los endpoints nuevos
```

---

## 🚀 **Plan de Ejecución Recomendado**

### **Opción A: Migración Segura (Recomendada)**

```bash
# 1. Backup de la base de datos actual
mysqldump -u root -p adomiapp > backup_before_migration_$(date +%Y%m%d).sql

# 2. Ejecutar migraciones en orden
mysql -u root -p adomiapp < migrations/001_update_existing_tables.sql
mysql -u root -p adomiapp < migrations/002_rename_conflicting_tables.sql
mysql -u root -p adomiapp < migrations/003_create_provider_tables.sql
mysql -u root -p adomiapp < migrations/004_create_operations_tables.sql
mysql -u root -p adomiapp < migrations/005_create_social_tables.sql
mysql -u root -p adomiapp < migrations/006_create_system_tables.sql
mysql -u root -p adomiapp < migrations/007_create_views_and_triggers.sql

# 3. Verificar que todo se creó
mysql -u root -p adomiapp -e "SHOW TABLES;"

# 4. Testear endpoints existentes (deben seguir funcionando)
curl http://localhost:3000/health
curl http://localhost:3000/plans
```

### **Opción B: Ejecutar Todo de Una (Más Rápido pero Riesgoso)**

```bash
# ⚠️ CUIDADO: Puede romper código existente

# 1. Backup
mysqldump -u root -p adomiapp > backup.sql

# 2. Ejecutar schema completo
mysql -u root -p adomiapp < DATABASE_SCHEMA_COMPLETE.sql

# 3. Rezar que no se rompió nada 🙏
```

---

## 🛠️ **Decisión a Tomar**

### **Pregunta Clave:**
¿Quieres mantener compatibilidad con el código actual de Stripe o reescribir?

#### **Opción 1: Compatibilidad Total** (Más Seguro)
- ✅ Mantener `stripe_customers` tal cual
- ✅ Mantener estructura actual de `subscriptions`
- ✅ Solo agregar tablas nuevas
- ✅ Endpoints de Stripe siguen funcionando sin cambios
- ⏱️ Tiempo: 1 día de migración

#### **Opción 2: Reescritura Completa** (Más Limpio)
- ⚠️ Eliminar `stripe_customers`, mover a `users.stripe_customer_id`
- ⚠️ Actualizar queries de Stripe
- ⚠️ Testear todo el flujo de pagos
- ⚠️ Actualizar `subscriptions.ts`, `stripe-customers.ts`
- ⏱️ Tiempo: 3-5 días de refactoring

---

## 💡 **Mi Recomendación**

### **Estrategia: Migración Incremental sin Romper Nada**

**Semana 1:**
1. Ejecutar migraciones que NO afectan código existente
2. Crear todas las tablas nuevas
3. Mantener `stripe_customers` y `subscriptions` como están
4. Implementar primer endpoint: `/provider/profile`
5. Validar que Stripe sigue funcionando

**Semana 2+:**
1. Implementar endpoints nuevos usando tablas nuevas
2. Gradualmente migrar código a nuevas estructuras
3. Cuando todo funcione, deprecar tablas legacy

**Ventajas:**
- ✅ Código actual sigue funcionando
- ✅ Puedes desarrollar en paralelo
- ✅ Rollback fácil si algo falla
- ✅ Testing incremental

---

## 📝 **Siguiente Paso**

### **Crear Script de Migración Segura:**

¿Quieres que cree el script de migración segura que:
1. Mantiene funcionando todo el código actual de Stripe
2. Agrega solo las tablas nuevas necesarias
3. Actualiza tablas existentes sin romperlas
4. Permite empezar a trabajar en `/provider/profile` inmediatamente?

Este sería el enfoque más prudente para un sistema en producción.

---

**¿Procedemos con migración segura o migración completa?** 🤔

