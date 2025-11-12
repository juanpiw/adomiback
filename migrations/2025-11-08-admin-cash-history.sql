-- Auditoría e historial para validación de pagos manuales en efectivo

CREATE TABLE IF NOT EXISTS cash_manual_payments_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  payment_id BIGINT UNSIGNED NOT NULL,
  action ENUM('submitted','under_review','approved','rejected','resubmission_requested') NOT NULL,
  actor_type ENUM('provider','admin','system') NOT NULL DEFAULT 'system',
  actor_id INT NULL,
  notes TEXT NULL,
  metadata JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cash_manual_history_payment
    FOREIGN KEY (payment_id) REFERENCES provider_cash_payments(id) ON DELETE CASCADE,
  INDEX idx_cash_manual_history_payment (payment_id),
  INDEX idx_cash_manual_history_action (action),
  INDEX idx_cash_manual_history_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


