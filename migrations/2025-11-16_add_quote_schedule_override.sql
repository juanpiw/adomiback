-- 2025-11-16: Campos para que el profesional proponga una nueva fecha/horario en la cotización
-- Este script es idempotente.

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS provider_proposed_date DATE NULL AFTER proposal_valid_until,
  ADD COLUMN IF NOT EXISTS provider_proposed_time_range VARCHAR(120) NULL AFTER provider_proposed_date;

CREATE INDEX IF NOT EXISTS idx_quotes_provider_proposed_date ON quotes (provider_proposed_date);


