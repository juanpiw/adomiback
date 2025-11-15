-- 2025-11-16: Campos para retención (escrow) y disputas de citas pagadas con tarjeta

ALTER TABLE appointments
  MODIFY COLUMN status ENUM(
    'scheduled',
    'pending',
    'pending_reschedule',
    'confirmed',
    'in_progress',
    'completed',
    'cancelled',
    'expired',
    'dispute_pending'
  ) NOT NULL DEFAULT 'scheduled',
  ADD COLUMN service_completion_state ENUM(
    'none',
    'client_confirmed',
    'auto_completed',
    'dispute_pending',
    'completed_refunded'
  ) NOT NULL DEFAULT 'none' AFTER payment_method,
  ADD COLUMN completion_requested_at DATETIME NULL AFTER service_completion_state,
  ADD COLUMN auto_release_at DATETIME NULL AFTER completion_requested_at;

ALTER TABLE payments
  ADD COLUMN captured TINYINT(1) NOT NULL DEFAULT 0 AFTER status,
  ADD COLUMN escrow_reference VARCHAR(255) NULL AFTER captured,
  ADD COLUMN hold_expires_at DATETIME NULL AFTER escrow_reference;

CREATE TABLE IF NOT EXISTS appointment_disputes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  appointment_id BIGINT UNSIGNED NOT NULL,
  client_id INT UNSIGNED NOT NULL,
  provider_id INT UNSIGNED NOT NULL,
  status ENUM('open','reviewing','resolved','rejected') NOT NULL DEFAULT 'open',
  reason TEXT NOT NULL,
  evidence_urls JSON NULL,
  reported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME NULL,
  resolution_notes TEXT NULL,
  CONSTRAINT fk_appointment_disputes_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  INDEX idx_disputes_appointment (appointment_id),
  INDEX idx_disputes_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

