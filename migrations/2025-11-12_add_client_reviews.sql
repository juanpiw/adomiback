-- Provider feedback for clients (reviews & aggregates)

CREATE TABLE IF NOT EXISTS client_reviews (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  appointment_id INT NOT NULL,
  client_id INT NOT NULL,
  provider_id INT NOT NULL,
  rating TINYINT UNSIGNED NOT NULL,
  comment TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_client_reviews_appointment
    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  CONSTRAINT fk_client_reviews_client
    FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_client_reviews_provider
    FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT uq_client_reviews_appointment_provider UNIQUE (appointment_id, provider_id),
  CONSTRAINT chk_client_reviews_rating CHECK (rating BETWEEN 1 AND 5),
  INDEX idx_client_reviews_client (client_id),
  INDEX idx_client_reviews_provider (provider_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE client_profiles
  ADD COLUMN client_rating_average DECIMAL(3,2) NULL DEFAULT NULL AFTER is_verified,
  ADD COLUMN client_review_count INT NOT NULL DEFAULT 0 AFTER client_rating_average;

UPDATE client_profiles
   SET client_rating_average = 0,
       client_review_count = 0
 WHERE client_rating_average IS NULL;


