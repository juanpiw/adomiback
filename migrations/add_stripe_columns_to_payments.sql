-- ============================================
-- Agregar columnas de Stripe a la tabla payments
-- ============================================
-- Estas columnas son necesarias para rastrear pagos de citas
-- vinculados con Stripe Checkout Sessions

ALTER TABLE payments
ADD COLUMN IF NOT EXISTS stripe_checkout_session_id VARCHAR(255) AFTER stripe_payment_intent_id,
ADD INDEX idx_stripe_checkout (stripe_checkout_session_id);

-- Verificar estructura actualizada
-- SHOW COLUMNS FROM payments;

