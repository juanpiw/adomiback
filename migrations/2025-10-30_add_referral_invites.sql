-- Tabla de términos prohibidos para búsquedas/invitaciones
CREATE TABLE IF NOT EXISTS referral_blacklist_terms (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  term VARCHAR(64) NOT NULL UNIQUE,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de invitaciones / referidos generados desde explorar sin resultados
CREATE TABLE IF NOT EXISTS referral_invites (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  client_id INT NULL,
  search_term VARCHAR(120) NOT NULL,
  invitee_email VARCHAR(255) NULL,
  source ENUM('explore-empty','share-link') NOT NULL DEFAULT 'explore-empty',
  channel ENUM('email','whatsapp','copy') NOT NULL,
  referral_link VARCHAR(500) NULL,
  meta JSON NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  INDEX idx_referral_invites_client (client_id),
  INDEX idx_referral_invites_source (source, channel),
  CONSTRAINT fk_referral_invites_client FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;






