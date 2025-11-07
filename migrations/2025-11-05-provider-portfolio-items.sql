-- Provider Portfolio Items
-- Creates table for storing provider portfolio media (images/videos)

CREATE TABLE IF NOT EXISTS `provider_portfolio_items` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `provider_id` BIGINT UNSIGNED NOT NULL,
  `type` ENUM('image','video') NOT NULL,
  `url` VARCHAR(1024) NOT NULL,
  `thumb_url` VARCHAR(1024) NULL,
  `width` INT NULL,
  `height` INT NULL,
  `duration_seconds` INT NULL,
  `caption` VARCHAR(280) NULL,
  `order_index` INT NOT NULL DEFAULT 0,
  `is_public` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  INDEX `idx_provider_order` (`provider_id`, `order_index`),
  CONSTRAINT `fk_portfolio_provider_user`
    FOREIGN KEY (`provider_id`) REFERENCES `users`(`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;




