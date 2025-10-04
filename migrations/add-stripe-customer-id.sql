-- Migración: Agregar columna stripe_customer_id a la tabla users
-- Fecha: 2025-01-XX
-- Descripción: Agregar soporte para almacenar el ID de customer de Stripe

-- Verificar si la columna ya existe antes de agregarla
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'users' 
     AND COLUMN_NAME = 'stripe_customer_id') > 0,
    'SELECT "Columna stripe_customer_id ya existe" as message;',
    'ALTER TABLE users ADD COLUMN stripe_customer_id VARCHAR(255) NULL AFTER role;'
));

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Agregar índice para optimizar consultas por stripe_customer_id
SET @sql2 = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'users' 
     AND INDEX_NAME = 'idx_stripe_customer_id') > 0,
    'SELECT "Índice idx_stripe_customer_id ya existe" as message;',
    'CREATE INDEX idx_stripe_customer_id ON users(stripe_customer_id);'
));

PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- Verificar que la migración se ejecutó correctamente
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
AND TABLE_NAME = 'users' 
AND COLUMN_NAME = 'stripe_customer_id';

-- Mostrar estructura actualizada de la tabla
DESCRIBE users;
