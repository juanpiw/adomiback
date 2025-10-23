-- Agregar campos bancarios al perfil del proveedor
ALTER TABLE provider_profiles
  ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100) NULL AFTER last_seen,
  ADD COLUMN IF NOT EXISTS bank_account VARCHAR(50) NULL AFTER bank_name,
  ADD COLUMN IF NOT EXISTS account_holder VARCHAR(255) NULL AFTER bank_account,
  ADD COLUMN IF NOT EXISTS account_rut VARCHAR(20) NULL AFTER account_holder,
  ADD COLUMN IF NOT EXISTS account_type VARCHAR(20) NULL AFTER account_rut;

-- Configuración de días hábiles para liquidación (T+N)
INSERT INTO platform_settings (setting_key, setting_value, setting_type, description)
SELECT 'payout_business_days', '3', 'number', 'Días hábiles para programar la liquidación (T+N)'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_settings WHERE setting_key = 'payout_business_days'
);


