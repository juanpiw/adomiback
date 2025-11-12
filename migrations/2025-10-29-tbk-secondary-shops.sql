-- Transbank secondary commerce onboarding prerequisites
-- Safe/idempotent migration for MySQL (no PROCEDUREs, no DELIMITER blocks)

-- 1) Ensure USERS columns exist
-- tbk_secondary_code
SELECT COUNT(*) INTO @col_exists FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'tbk_secondary_code';
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE `users` ADD COLUMN `tbk_secondary_code` VARCHAR(32) NULL AFTER `stripe_account_id`',
  'SELECT 1'
);
PREPARE s1 FROM @sql; EXECUTE s1; DEALLOCATE PREPARE s1;

-- tbk_status
SELECT COUNT(*) INTO @col_exists FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'tbk_status';
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE `users` ADD COLUMN `tbk_status` ENUM("none","pending","active","restricted") NULL DEFAULT "none" AFTER `tbk_secondary_code`',
  'SELECT 1'
);
PREPARE s2 FROM @sql; EXECUTE s2; DEALLOCATE PREPARE s2;

-- index for quick lookups by code
SELECT COUNT(*) INTO @idx_exists FROM INFORMATION_SCHEMA.STATISTICS 
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'idx_users_tbk_secondary_code';
SET @sql := IF(@idx_exists = 0,
  'ALTER TABLE `users` ADD INDEX `idx_users_tbk_secondary_code` (`tbk_secondary_code`)',
  'SELECT 1'
);
PREPARE s3 FROM @sql; EXECUTE s3; DEALLOCATE PREPARE s3;

-- 2) Create TBK secondary shops audit table
CREATE TABLE IF NOT EXISTS `tbk_secondary_shops` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `provider_id` INT NOT NULL,
  `codigo_comercio_secundario` VARCHAR(32) NOT NULL,
  `status` ENUM('pending','active','restricted') NOT NULL DEFAULT 'pending',
  `raw` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tbk_sec_code` (`codigo_comercio_secundario`),
  KEY `idx_tbk_sec_provider` (`provider_id`),
  CONSTRAINT `fk_tbk_sec_provider` FOREIGN KEY (`provider_id`) REFERENCES `users`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;








