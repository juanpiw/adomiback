-- Añadir campos de Cierre Mutuo en appointments y sembrar cash_max_amount

-- Campos de cierre en appointments
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS closure_state ENUM('none','pending_close','resolved','in_review') NOT NULL DEFAULT 'none' AFTER status,
  ADD COLUMN IF NOT EXISTS closure_due_at DATETIME(6) NULL AFTER closure_state,
  ADD COLUMN IF NOT EXISTS closure_provider_action ENUM('none','code_entered','no_show','issue') NOT NULL DEFAULT 'none' AFTER closure_due_at,
  ADD COLUMN IF NOT EXISTS closure_client_action ENUM('none','ok','no_show','issue') NOT NULL DEFAULT 'none' AFTER closure_provider_action,
  ADD COLUMN IF NOT EXISTS closure_notes JSON NULL AFTER closure_client_action,
  ADD COLUMN IF NOT EXISTS cash_verified_at DATETIME(6) NULL AFTER closure_notes;

-- Índices para consulta eficiente
CREATE INDEX IF NOT EXISTS idx_appointments_closure_state ON appointments (closure_state);
CREATE INDEX IF NOT EXISTS idx_appointments_closure_due_at ON appointments (closure_due_at);

-- Sembrar tope de efectivo en platform_settings (150000 CLP) si no existe
INSERT INTO platform_settings (setting_key, setting_value, setting_type, description)
SELECT 'cash_max_amount', '150000', 'number', 'Tope máximo por cita para pagos en efectivo (CLP)'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_settings WHERE setting_key = 'cash_max_amount'
);


