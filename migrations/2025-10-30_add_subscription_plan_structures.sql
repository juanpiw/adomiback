-- ============================================
-- Integración Plan Fundador y estructura de planes
-- ============================================

START TRANSACTION;

-- 1. Ampliar tabla PLANS con límites y metadata configurable
ALTER TABLE plans
  ADD COLUMN plan_type ENUM('paid','founder','free','trial') NOT NULL DEFAULT 'paid' AFTER billing_period,
  ADD COLUMN duration_months INT NULL AFTER plan_type,
  ADD COLUMN max_services INT NOT NULL DEFAULT 0 AFTER features,
  ADD COLUMN max_bookings INT NOT NULL DEFAULT 0 AFTER max_services,
  ADD COLUMN commission_rate DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER max_bookings,
  ADD COLUMN benefits JSON NULL AFTER commission_rate,
  ADD COLUMN metadata JSON NULL AFTER benefits,
  ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

-- Normalizar registros existentes (máximos ilimitados por defecto)
UPDATE plans
SET 
  max_services = 999,
  max_bookings = 9999,
  commission_rate = COALESCE(commission_rate, 0);

-- 2. Tabla de códigos promocionales (Founders, trials, descuentos)
CREATE TABLE IF NOT EXISTS promo_codes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  description VARCHAR(255) NULL,
  plan_id INT NOT NULL,
  plan_type ENUM('founder','trial','discount','custom') NOT NULL DEFAULT 'founder',
  max_redemptions INT NULL,
  current_redemptions INT NOT NULL DEFAULT 0,
  discount_percentage DECIMAL(5,2) NULL,
  duration_months INT NULL,
  grant_commission_override DECIMAL(5,2) NULL,
  applies_to_existing BOOLEAN NOT NULL DEFAULT FALSE,
  valid_from DATETIME NULL,
  expires_at DATETIME NULL,
  allowed_roles JSON NULL,
  metadata JSON NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE,
  INDEX idx_plan_id (plan_id),
  INDEX idx_status_active (is_active),
  INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Ampliar tabla SUBSCRIPTIONS para manejar Fundador y avisos
ALTER TABLE subscriptions
  ADD COLUMN promo_code_id BIGINT UNSIGNED NULL AFTER plan_id,
  ADD COLUMN promo_code VARCHAR(50) NULL AFTER promo_code_id,
  ADD COLUMN plan_origin ENUM('stripe','promo','manual') NOT NULL DEFAULT 'stripe' AFTER promo_code,
  ADD COLUMN services_used INT NOT NULL DEFAULT 0 AFTER cancel_at_period_end,
  ADD COLUMN bookings_used INT NOT NULL DEFAULT 0 AFTER services_used,
  ADD COLUMN warning_sent_at DATETIME NULL AFTER bookings_used,
  ADD COLUMN expired_notified_at DATETIME NULL AFTER warning_sent_at,
  ADD COLUMN grace_expires_at DATETIME NULL AFTER expired_notified_at,
  ADD COLUMN promo_expires_at DATETIME NULL AFTER grace_expires_at,
  ADD COLUMN metadata JSON NULL AFTER promo_expires_at;

ALTER TABLE subscriptions
  ADD CONSTRAINT fk_subscriptions_promo_code
    FOREIGN KEY (promo_code_id) REFERENCES promo_codes(id) ON DELETE SET NULL;

CREATE INDEX idx_subscription_status ON subscriptions (status);
CREATE INDEX idx_subscription_plan_origin ON subscriptions (plan_origin);
CREATE INDEX idx_subscription_ends_at ON subscriptions (current_period_end);
CREATE INDEX idx_subscription_grace ON subscriptions (grace_expires_at);

-- 4. Eventos/bitácora de suscripciones
CREATE TABLE IF NOT EXISTS provider_subscription_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  subscription_id BIGINT UNSIGNED NOT NULL,
  event_type ENUM(
    'created','status_changed','renewed','cancelled','expired',
    'promo_applied','limit_reached','warning_sent','grace_started',
    'funnel_view','funnel_validated','funnel_registered','funnel_converted'
  ) NOT NULL,
  prev_status ENUM('active','cancelled','expired','past_due','warning','pending') NULL,
  new_status ENUM('active','cancelled','expired','past_due','warning','pending') NULL,
  metadata JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
  INDEX idx_subscription_event (subscription_id, event_type),
  INDEX idx_event_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Registro de eventos de funnel (antes del registro completo)
CREATE TABLE IF NOT EXISTS subscription_funnel_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_type ENUM('view_plan','promo_validated','registration_completed','promo_activated','converted_to_paid') NOT NULL,
  email VARCHAR(191) NULL,
  provider_id INT NULL,
  promo_code VARCHAR(50) NULL,
  metadata JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_funnel_event (event_type, created_at),
  INDEX idx_funnel_email (email),
  INDEX idx_funnel_provider (provider_id),
  INDEX idx_funnel_promo (promo_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

COMMIT;

