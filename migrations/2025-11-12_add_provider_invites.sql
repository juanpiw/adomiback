-- Flywheel “Invitaciones Doradas” schema

CREATE TABLE IF NOT EXISTS provider_invites (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  inviter_provider_id INT NOT NULL,
  invite_code VARCHAR(32) NOT NULL,
  invitee_email VARCHAR(255) NULL,
  invitee_phone VARCHAR(32) NULL,
  invitee_name VARCHAR(255) NULL,
  status ENUM('issued','registered','verified','expired','revoked') NOT NULL DEFAULT 'issued',
  invitee_provider_id INT NULL,
  registered_at DATETIME NULL,
  verified_at DATETIME NULL,
  expires_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_provider_invites_inviter FOREIGN KEY (inviter_provider_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_provider_invites_invitee FOREIGN KEY (invitee_provider_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT uq_provider_invites_code UNIQUE (invite_code),
  INDEX idx_provider_invites_inviter_status (inviter_provider_id, status),
  INDEX idx_provider_invites_status (status),
  INDEX idx_provider_invites_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS provider_invite_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invite_id BIGINT UNSIGNED NOT NULL,
  inviter_provider_id INT NOT NULL,
  event_type ENUM('issued','resent','registered','verified','expired','revoked','limit_blocked','duplicate_invitee') NOT NULL,
  metadata JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_provider_invite_events_invite FOREIGN KEY (invite_id) REFERENCES provider_invites(id) ON DELETE CASCADE,
  INDEX idx_provider_invite_events_inviter (inviter_provider_id),
  INDEX idx_provider_invite_events_type (event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE provider_profiles
  ADD COLUMN invite_quota INT NOT NULL DEFAULT 3 AFTER review_count,
  ADD COLUMN invite_used INT NOT NULL DEFAULT 0 AFTER invite_quota,
  ADD COLUMN pioneer_unlocked_at DATETIME NULL AFTER invite_used;

UPDATE provider_profiles
   SET invite_quota = 3,
       invite_used = 0
 WHERE invite_quota IS NULL OR invite_used IS NULL;


