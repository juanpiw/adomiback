-- Create table for Stripe webhook idempotency and auditing
CREATE TABLE IF NOT EXISTS stripe_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  payload_hash CHAR(64) NULL,
  status ENUM('received','processed','duplicate','error') NOT NULL DEFAULT 'received',
  delivered_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  processed_at DATETIME(6) NULL,
  error_message TEXT NULL,
  raw_payload JSON NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_stripe_events_event_id (event_id),
  KEY idx_stripe_events_type_time (event_type, delivered_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


