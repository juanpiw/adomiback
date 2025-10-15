-- Script simple para agregar la columna stripe_customer_id
-- Ejecutar este script en la base de datos

ALTER TABLE users ADD COLUMN stripe_customer_id VARCHAR(255) NULL AFTER role;

-- Agregar índice para optimizar consultas
CREATE INDEX idx_stripe_customer_id ON users(stripe_customer_id);

-- Verificar que se agregó correctamente
DESCRIBE users;







