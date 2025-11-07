-- ============================================
-- Account switch columns for users
-- ============================================

START TRANSACTION;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS account_switch_in_progress TINYINT(1) NOT NULL DEFAULT 0 AFTER pending_role,
  ADD COLUMN IF NOT EXISTS account_switch_started_at DATETIME NULL AFTER account_switch_in_progress,
  ADD COLUMN IF NOT EXISTS account_switched_at DATETIME NULL AFTER account_switch_started_at,
  ADD COLUMN IF NOT EXISTS account_switch_source VARCHAR(50) NULL AFTER account_switched_at;

-- Normalizar valores nulos previos
UPDATE users
SET account_switch_in_progress = 0
WHERE account_switch_in_progress IS NULL;

-- Extender enum de eventos del funnel para registrar el cambio de cuenta
ALTER TABLE subscription_funnel_events
  MODIFY COLUMN event_type ENUM(
    'view_plan',
    'promo_validated',
    'registration_completed',
    'promo_activated',
    'converted_to_paid',
    'account_switch_requested'
  ) NOT NULL;

COMMIT;



