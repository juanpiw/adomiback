-- ============================================
-- TABLA: notifications
-- ============================================
-- Almacena notificaciones in-app para usuarios
-- Permite mostrar notificaciones en la campana de notificaciones

CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type ENUM('appointment', 'payment', 'message', 'system') DEFAULT 'system',
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
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
-- NOTAS DE IMPLEMENTACIÓN
-- ============================================
-- 1. type: 'appointment' (citas), 'payment' (pagos), 'message' (mensajes), 'system' (sistema)
-- 2. data: JSON con información adicional (appointment_id, payment_id, etc.)
-- 3. is_read: FALSE por defecto, se marca como TRUE cuando el usuario la lee
-- 4. INDEX idx_user_read: optimiza la consulta de notificaciones no leídas por usuario

-- ============================================
-- ENDPOINTS BACKEND CORRESPONDIENTES
-- ============================================
-- GET /notifications
--   Query: ?user_id=X&limit=20&offset=0&unread_only=true
--   Obtiene las notificaciones del usuario autenticado
--
-- PATCH /notifications/:id/read
--   Marca una notificación como leída
--
-- PATCH /notifications/mark-all-read
--   Marca todas las notificaciones del usuario como leídas
--
-- GET /notifications/unread-count
--   Obtiene el conteo de notificaciones no leídas

