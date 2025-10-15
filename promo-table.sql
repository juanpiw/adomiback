-- Tabla para almacenar registros de promoción/prueba gratis
CREATE TABLE IF NOT EXISTS promo_signups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  correo VARCHAR(255) NOT NULL,
  profesion VARCHAR(100) NOT NULL,
  notas TEXT,
  status ENUM('pending', 'contacted', 'converted', 'cancelled') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Índices para optimizar consultas
  INDEX idx_email (correo),
  INDEX idx_status (status),
  INDEX idx_profesion (profesion),
  INDEX idx_created_at (created_at),
  
  -- Constraint para email único
  UNIQUE KEY unique_email (correo)
);

-- Insertar algunos datos de ejemplo (opcional)
INSERT INTO promo_signups (nombre, correo, profesion, notas, status) VALUES
('Juan Pérez', 'juan@ejemplo.com', 'estilista', 'Tengo 5 años de experiencia en peluquería', 'pending'),
('María García', 'maria@ejemplo.com', 'chef', 'Especializada en cocina italiana', 'contacted'),
('Carlos López', 'carlos@ejemplo.com', 'masajista', 'Trabajo con terapias relajantes', 'pending')
ON DUPLICATE KEY UPDATE 
  nombre = VALUES(nombre),
  profesion = VALUES(profesion),
  notas = VALUES(notas),
  updated_at = CURRENT_TIMESTAMP;







