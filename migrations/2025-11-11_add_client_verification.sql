-- Client identity verification tables and profile flags

ALTER TABLE client_profiles
  ADD COLUMN verification_status ENUM('none','pending','approved','rejected') NOT NULL DEFAULT 'none' AFTER notes,
  ADD COLUMN is_verified BOOLEAN NOT NULL DEFAULT FALSE AFTER verification_status;

ALTER TABLE client_profiles
  ADD INDEX idx_client_profiles_verification_status (verification_status);

CREATE TABLE IF NOT EXISTS client_verifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  document_type ENUM('cedula','pasaporte','licencia') NOT NULL DEFAULT 'cedula',
  document_number VARCHAR(64) NOT NULL,
  status ENUM('draft','pending','approved','rejected') NOT NULL DEFAULT 'draft',
  rejection_reason VARCHAR(255) NULL,
  review_notes TEXT NULL,
  reviewed_by_admin_id INT NULL,
  submitted_at DATETIME NULL,
  reviewed_at DATETIME NULL,
  metadata JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_client_verifications_client
    FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_client_verifications_admin
    FOREIGN KEY (reviewed_by_admin_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_client_verifications_client (client_id),
  INDEX idx_client_verifications_status (status),
  INDEX idx_client_verifications_submitted (submitted_at),
  INDEX idx_client_verifications_document (document_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS client_verification_files (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  verification_id BIGINT UNSIGNED NOT NULL,
  client_id INT NOT NULL,
  file_type ENUM('front','back','selfie','extra') NOT NULL,
  s3_bucket VARCHAR(128) NOT NULL,
  s3_key VARCHAR(512) NOT NULL,
  mime_type VARCHAR(128) NULL,
  size_bytes INT UNSIGNED NULL,
  checksum_sha256 VARCHAR(128) NULL,
  uploaded_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_client_verification_files_verification
    FOREIGN KEY (verification_id) REFERENCES client_verifications(id) ON DELETE CASCADE,
  CONSTRAINT fk_client_verification_files_client
    FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_client_verification_file (verification_id, file_type),
  INDEX idx_client_verification_files_client (client_id),
  INDEX idx_client_verification_files_key (s3_key(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;





