-- Tabla de solicitudes de devolución/reembolso
CREATE TABLE IF NOT EXISTS refund_requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  appointment_id INT NOT NULL,
  payment_id INT NULL,
  client_id INT NOT NULL,
  provider_id INT NOT NULL,
  amount DECIMAL(10,2) NULL,
  currency VARCHAR(3) DEFAULT 'CLP',
  reason TEXT NOT NULL,
  status ENUM('requested','in_review','approved','denied','cancelled','refunded') NOT NULL DEFAULT 'requested',
  requested_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  decided_at DATETIME(6) NULL,
  decided_by_admin_email VARCHAR(191) NULL,
  decision_notes TEXT NULL,
  stripe_refund_id VARCHAR(255) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_refund_requests_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  CONSTRAINT fk_refund_requests_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL,
  CONSTRAINT fk_refund_requests_client FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_refund_requests_provider FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_refund_requests_status (status),
  KEY idx_refund_requests_requested_at (requested_at),
  KEY idx_refund_requests_appointment (appointment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


