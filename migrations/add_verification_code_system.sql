-- ========================================
-- MIGRACIÓN: Sistema de Códigos de Verificación
-- Fecha: 2025-10-20
-- Propósito: Implementar sistema de códigos de 4 dígitos para verificar servicios completados
-- ========================================

-- ========== APPOINTMENTS TABLE ==========

-- Agregar campos de verificación a la tabla appointments
ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS verification_code CHAR(4) NULL 
  COMMENT 'Código de 4 dígitos para verificar servicio completado',
ADD COLUMN IF NOT EXISTS code_generated_at TIMESTAMP NULL 
  COMMENT 'Cuándo se generó el código (al pagar)',
ADD COLUMN IF NOT EXISTS verification_attempts INT DEFAULT 0 
  COMMENT 'Número de intentos fallidos de verificación',
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP NULL 
  COMMENT 'Cuándo se verificó el código correctamente',
ADD COLUMN IF NOT EXISTS verified_by_provider_id INT NULL 
  COMMENT 'ID del proveedor que verificó (para auditoría)';

-- Agregar índices para mejorar performance
ALTER TABLE appointments
ADD INDEX IF NOT EXISTS idx_verification_code (verification_code),
ADD INDEX IF NOT EXISTS idx_verified_at (verified_at);

-- ========== PAYMENTS TABLE ==========

-- Agregar campos de liberación de fondos
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS can_release BOOLEAN DEFAULT FALSE 
  COMMENT 'Si se puede liberar el pago al proveedor (después de verificación)',
ADD COLUMN IF NOT EXISTS released_at TIMESTAMP NULL 
  COMMENT 'Cuándo se liberaron los fondos al proveedor',
ADD COLUMN IF NOT EXISTS release_status ENUM('pending','processing','completed','failed') DEFAULT 'pending' 
  COMMENT 'Estado de la liberación de fondos',
ADD COLUMN IF NOT EXISTS release_transaction_id VARCHAR(255) NULL 
  COMMENT 'ID de la transacción de liberación (Stripe payout o transfer)',
ADD COLUMN IF NOT EXISTS release_notes TEXT NULL 
  COMMENT 'Notas sobre la liberación (errores, etc.)';

-- Agregar índices
ALTER TABLE payments
ADD INDEX IF NOT EXISTS idx_can_release (can_release),
ADD INDEX IF NOT EXISTS idx_release_status (release_status),
ADD INDEX IF NOT EXISTS idx_released_at (released_at);

-- ========== TABLA DE AUDITORÍA (OPCIONAL) ==========

-- Crear tabla para registrar todos los intentos de verificación
CREATE TABLE IF NOT EXISTS verification_attempts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  appointment_id INT NOT NULL,
  provider_id INT NOT NULL,
  code_attempted VARCHAR(4) NOT NULL,
  success BOOLEAN DEFAULT FALSE,
  ip_address VARCHAR(45) NULL,
  user_agent TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_appointment (appointment_id),
  INDEX idx_provider (provider_id),
  INDEX idx_success (success),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- VERIFICACIÓN
-- ========================================

-- Verificar que las columnas se agregaron correctamente
SELECT 
  TABLE_NAME,
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE,
  COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('appointments', 'payments')
  AND COLUMN_NAME IN (
    'verification_code', 
    'code_generated_at', 
    'verification_attempts',
    'verified_at',
    'can_release',
    'released_at',
    'release_status'
  )
ORDER BY TABLE_NAME, ORDINAL_POSITION;

-- ========================================
-- COMANDOS ÚTILES PARA TESTING
-- ========================================

-- Ver citas con código de verificación
SELECT 
  id,
  client_id,
  provider_id,
  verification_code,
  code_generated_at,
  verification_attempts,
  verified_at,
  status
FROM appointments
WHERE verification_code IS NOT NULL
ORDER BY code_generated_at DESC
LIMIT 10;

-- Ver pagos pendientes de liberación
SELECT 
  p.id,
  p.appointment_id,
  p.amount,
  p.can_release,
  p.release_status,
  a.verification_code,
  a.verified_at
FROM payments p
INNER JOIN appointments a ON a.id = p.appointment_id
WHERE p.status = 'completed'
  AND a.status = 'completed'
  AND p.can_release = TRUE
  AND p.release_status = 'pending'
ORDER BY p.paid_at DESC;

