-- Provider manual cash payments tracking

CREATE TABLE IF NOT EXISTS provider_cash_payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'CLP',
  status ENUM('under_review','paid','rejected') NOT NULL DEFAULT 'under_review',
  reference VARCHAR(120) NULL,
  notes TEXT NULL,
  receipt_bucket VARCHAR(128) NULL,
  receipt_key VARCHAR(512) NULL,
  receipt_file_name VARCHAR(255) NULL,
  receipt_uploaded_at DATETIME NULL,
  reviewed_by_admin_id INT NULL,
  reviewed_at DATETIME NULL,
  review_notes TEXT NULL,
  metadata JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_provider_cash_payments_provider
    FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_provider_cash_payments_admin_reviewer
    FOREIGN KEY (reviewed_by_admin_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_provider_cash_payments_provider (provider_id),
  INDEX idx_provider_cash_payments_status (status),
  INDEX idx_provider_cash_payments_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS provider_cash_payment_debts (
  payment_id BIGINT UNSIGNED NOT NULL,
  debt_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (payment_id, debt_id),
  CONSTRAINT fk_provider_cash_payment_debt_payment
    FOREIGN KEY (payment_id) REFERENCES provider_cash_payments(id) ON DELETE CASCADE,
  CONSTRAINT fk_provider_cash_payment_debt_debt
    FOREIGN KEY (debt_id) REFERENCES provider_commission_debts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE provider_commission_debts
  MODIFY COLUMN status ENUM('pending','overdue','under_review','paid','rejected','cancelled') NOT NULL DEFAULT 'pending';

ALTER TABLE provider_commission_debts
  ADD COLUMN manual_payment_id BIGINT UNSIGNED NULL AFTER settlement_reference;

ALTER TABLE provider_commission_debts
  ADD CONSTRAINT fk_provider_commission_manual_payment
    FOREIGN KEY (manual_payment_id) REFERENCES provider_cash_payments(id) ON DELETE SET NULL;

