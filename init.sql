-- Create database
CREATE DATABASE IF NOT EXISTS adomiapp;
USE adomiapp;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  google_id VARCHAR(255) NULL,
  name VARCHAR(255) NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NULL,
  role ENUM('client', 'provider') NOT NULL DEFAULT 'client',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Service categories table
CREATE TABLE IF NOT EXISTS service_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Services table
CREATE TABLE IF NOT EXISTS services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  duration_minutes INT NOT NULL DEFAULT 60,
  price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES service_categories(id) ON DELETE CASCADE
);

-- Provider services table
CREATE TABLE IF NOT EXISTS provider_services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL,
  service_id INT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
  UNIQUE KEY unique_provider_service (provider_id, service_id)
);

-- Insert some sample data
INSERT INTO service_categories (name, description) VALUES 
('Belleza', 'Servicios de belleza y cuidado personal'),
('Salud', 'Servicios de salud y bienestar'),
('Hogar', 'Servicios para el hogar'),
('Tecnología', 'Servicios tecnológicos');

INSERT INTO services (category_id, name, description, duration_minutes, price) VALUES 
(1, 'Corte de cabello', 'Corte de cabello profesional', 60, 25.00),
(1, 'Manicure', 'Manicure completa', 45, 15.00),
(1, 'Pedicure', 'Pedicure completa', 60, 20.00),
(2, 'Masaje relajante', 'Masaje de 60 minutos', 60, 50.00),
(2, 'Consulta nutricional', 'Consulta de nutrición', 45, 30.00),
(3, 'Limpieza de hogar', 'Limpieza completa del hogar', 120, 40.00),
(3, 'Jardinería', 'Mantenimiento de jardín', 90, 35.00),
(4, 'Reparación de computadoras', 'Reparación y mantenimiento de PC', 60, 45.00);

