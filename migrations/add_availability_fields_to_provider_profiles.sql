-- Migración: Agregar campos de disponibilidad a provider_profiles
-- Fecha: 2025-10-13
-- Descripción: Agregar campos para controlar disponibilidad de reservas y ubicación en tiempo real

ALTER TABLE provider_profiles
ADD COLUMN available_for_bookings BOOLEAN DEFAULT TRUE AFTER last_profile_update,
ADD COLUMN share_real_time_location BOOLEAN DEFAULT FALSE AFTER available_for_bookings;

-- Verificar cambios
DESCRIBE provider_profiles;

