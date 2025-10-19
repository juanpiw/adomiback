-- ============================================
-- SCRIPTS DE MIGRACIÓN COMPLETOS PARA ADOMI
-- Ejecutar en la base de datos de producción
-- ============================================

-- ============================================
-- 1. TABLA: device_tokens (Tokens FCM)
-- ============================================
CREATE TABLE IF NOT EXISTS device_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token VARCHAR(500) NOT NULL,
  platform VARCHAR(50) DEFAULT 'web',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user (user_id),
  INDEX idx_token (token(255)),
  UNIQUE KEY unique_user_token (user_id, token(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 2. TABLA: notifications (Notificaciones in-app)
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type ENUM('appointment', 'payment', 'message', 'system') DEFAULT 'system',
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSON DEFAULT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user (user_id),
  INDEX idx_read (is_read),
  INDEX idx_created (created_at),
  INDEX idx_user_read (user_id, is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 3. TABLA: appointment_checkout_sessions
-- ============================================
CREATE TABLE IF NOT EXISTS appointment_checkout_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  appointment_id INT NOT NULL,
  client_id INT NOT NULL,
  provider_id INT NOT NULL,
  stripe_checkout_session_id VARCHAR(255) UNIQUE NOT NULL,
  stripe_payment_intent_id VARCHAR(255) NULL,
  status ENUM('created','completed','expired','cancelled') DEFAULT 'created',
  url VARCHAR(500) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  expires_at TIMESTAMP NULL,
  
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_appointment (appointment_id),
  INDEX idx_client (client_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 4. AGREGAR COLUMNAS A payments
-- ============================================
-- Verificar si la columna ya existe antes de agregar
SET @col_exists = 0;
SELECT COUNT(*) INTO @col_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'payments'
  AND COLUMN_NAME = 'stripe_checkout_session_id';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE payments ADD COLUMN stripe_checkout_session_id VARCHAR(255) AFTER stripe_payment_intent_id, ADD INDEX idx_stripe_checkout (stripe_checkout_session_id);',
  'SELECT "Column stripe_checkout_session_id already exists" AS message;'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================
-- 5. VERIFICAR TABLAS CREADAS
-- ============================================
SELECT 
  'device_tokens' as tabla,
  COUNT(*) as registros
FROM device_tokens
UNION ALL
SELECT 
  'notifications' as tabla,
  COUNT(*) as registros
FROM notifications
UNION ALL
SELECT 
  'appointment_checkout_sessions' as tabla,
  COUNT(*) as registros
FROM appointment_checkout_sessions;

-- ============================================
-- 6. VERIFICAR COLUMNAS AGREGADAS
-- ============================================
DESCRIBE payments;

-- ============================================
-- FIN DE MIGRACIONES
-- ============================================

