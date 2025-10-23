-- Impuestos en appointments y payments + campos de liberación de fondos

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(10,2) NULL AFTER price;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(10,2) NULL AFTER amount,
  ADD COLUMN IF NOT EXISTS can_release BOOLEAN DEFAULT FALSE AFTER refunded_at,
  ADD COLUMN IF NOT EXISTS released_at TIMESTAMP NULL AFTER can_release,
  ADD COLUMN IF NOT EXISTS release_status ENUM('pending','eligible','completed','failed') DEFAULT 'pending' AFTER released_at,
  ADD COLUMN IF NOT EXISTS release_transaction_id INT NULL AFTER release_status,
  ADD COLUMN IF NOT EXISTS release_notes TEXT NULL AFTER release_transaction_id;

-- Configuración de días de retención (Stripe) si no existe
INSERT INTO platform_settings (setting_key, setting_value, setting_type, description)
SELECT 'stripe_release_days', '10', 'number', 'Días de retención antes de poder liberar fondos (Stripe)'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_settings WHERE setting_key = 'stripe_release_days'
);


