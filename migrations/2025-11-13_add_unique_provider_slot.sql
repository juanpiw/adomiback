-- 2025-11-13: Garantizar unicidad de citas por proveedor/fecha/hora
-- Este script es idempotente y puede ejecutarse múltiples veces de forma segura.

-- 1. Eliminar duplicados conservando la cita con menor ID
DELETE a1 FROM appointments a1
JOIN appointments a2
  ON a1.provider_id = a2.provider_id
 AND a1.`date` = a2.`date`
 AND a1.`start_time` = a2.`start_time`
 AND a1.id > a2.id;

-- 2. Crear índice único si no existe
SET @has_index := (
  SELECT COUNT(*) FROM information_schema.statistics
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'appointments'
     AND INDEX_NAME = 'uniq_provider_slot'
);

SET @create_index_sql := IF(
  @has_index > 0,
  'SELECT 1',
  'ALTER TABLE appointments ADD UNIQUE INDEX uniq_provider_slot (provider_id, `date`, `start_time`)'
);

PREPARE stmt FROM @create_index_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

