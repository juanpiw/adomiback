-- Tabla para metas de ingresos de proveedores
CREATE TABLE IF NOT EXISTS provider_income_goals (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  period ENUM('mensual','trimestral') NOT NULL DEFAULT 'mensual',
  set_date DATE NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_provider_income_goals_provider FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_provider_period (provider_id, period, set_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

