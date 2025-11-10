-- ============================================
-- Tabla de pagos de planes (Stripe / Webpay Plus)
-- ============================================

START TRANSACTION;

CREATE TABLE IF NOT EXISTS provider_plan_payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL,
  plan_id INT NOT NULL,
  gateway ENUM('stripe','tbk') NOT NULL DEFAULT 'tbk',
  status ENUM('pending','authorized','paid','failed','cancelled','expired') NOT NULL DEFAULT 'pending',
  amount INT NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'CLP',
  tbk_token VARCHAR(128) NULL,
  tbk_buy_order VARCHAR(64) NULL,
  tbk_session_id VARCHAR(64) NULL,
  tbk_authorization_code VARCHAR(32) NULL,
  tbk_response_code INT NULL,
  tbk_installments_number INT NULL,
  tbk_payment_type_code VARCHAR(4) NULL,
  tbk_details JSON NULL,
  redirect_url VARCHAR(512) NULL,
  return_url VARCHAR(512) NULL,
  error_message VARCHAR(255) NULL,
  metadata JSON NULL,
  paid_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY idx_tbk_token (tbk_token),
  UNIQUE KEY idx_tbk_buy_order (tbk_buy_order),
  INDEX idx_provider_status (provider_id, status),
  INDEX idx_plan_status (plan_id, status),
  CONSTRAINT fk_plan_payments_provider FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_plan_payments_plan FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE subscriptions
  MODIFY COLUMN plan_origin ENUM('stripe','promo','manual','tbk') NOT NULL DEFAULT 'stripe';

COMMIT;

