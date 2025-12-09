-- ============================================================================
-- verify_quotes_schema.sql
--
-- Objetivo:
--   Validar rápidamente que las tablas y columnas mínimas del módulo de
--   cotizaciones existan en la base de datos actual sin modificar datos.
--
-- Uso recomendado:
--   mysql -u <usuario> -p<clave> adomi < verify_quotes_schema.sql
--
--   Si ya ejecutaste `USE <schema>;` antes de correr el script, se utilizará
--   ese esquema. En caso contrario, cambia el valor por defecto de @TARGET_SCHEMA.
-- ============================================================================

SET @TARGET_SCHEMA := IFNULL(DATABASE(), 'adomi');

SELECT 'schema_in_use' AS check_name, @TARGET_SCHEMA AS value;

-- --------------------------------------------------------------------------
-- 1) Presencia de tablas núcleo
-- --------------------------------------------------------------------------
SELECT
  t.table_name,
  CASE WHEN s.table_name IS NULL THEN 'MISSING' ELSE 'OK' END AS status
FROM (
  SELECT 'quotes' AS table_name UNION ALL
  SELECT 'quote_items' UNION ALL
  SELECT 'quote_attachments' UNION ALL
  SELECT 'quote_events' UNION ALL
  SELECT 'quote_messages'
) AS t
LEFT JOIN information_schema.tables s
  ON s.table_schema = @TARGET_SCHEMA
  AND s.table_name = t.table_name
ORDER BY t.table_name;

-- --------------------------------------------------------------------------
-- 2) Columnas críticas por tabla
--    (añade aquí nuevas columnas si el modelo evoluciona)
-- --------------------------------------------------------------------------
SELECT
  e.table_name,
  e.column_name,
  CASE WHEN c.column_name IS NULL THEN 'MISSING' ELSE 'OK' END AS status,
  c.column_type,
  c.is_nullable
FROM (
  -- quotes
  SELECT 'quotes' AS table_name, 'status' AS column_name UNION ALL
  SELECT 'quotes', 'service_summary' UNION ALL
  SELECT 'quotes', 'proposal_amount' UNION ALL
  SELECT 'quotes', 'proposal_valid_until' UNION ALL
  SELECT 'quotes', 'provider_id' UNION ALL
  SELECT 'quotes', 'client_id' UNION ALL
  -- quote_items
  SELECT 'quote_items', 'quote_id' UNION ALL
  SELECT 'quote_items', 'title' UNION ALL
  SELECT 'quote_items', 'quantity' UNION ALL
  SELECT 'quote_items', 'unit_price' UNION ALL
  -- quote_attachments
  SELECT 'quote_attachments', 'quote_id' UNION ALL
  SELECT 'quote_attachments', 'uploaded_by' UNION ALL
  SELECT 'quote_attachments', 'category' UNION ALL
  SELECT 'quote_attachments', 'file_path' UNION ALL
  -- quote_events
  SELECT 'quote_events', 'quote_id' UNION ALL
  SELECT 'quote_events', 'event_type' UNION ALL
  SELECT 'quote_events', 'actor_type' UNION ALL
  -- quote_messages
  SELECT 'quote_messages', 'quote_id' UNION ALL
  SELECT 'quote_messages', 'sender_id' UNION ALL
  SELECT 'quote_messages', 'message'
) AS e
LEFT JOIN information_schema.columns c
  ON c.table_schema = @TARGET_SCHEMA
  AND c.table_name = e.table_name
  AND c.column_name = e.column_name
ORDER BY e.table_name, e.column_name;

-- --------------------------------------------------------------------------
-- 3) Índices esperados (mejoran filtros por estado y joins)
-- --------------------------------------------------------------------------
SELECT
  e.table_name,
  e.index_name,
  CASE WHEN s.index_name IS NULL THEN 'MISSING' ELSE 'OK' END AS status
FROM (
  SELECT 'quotes' AS table_name, 'idx_quotes_provider_status' AS index_name UNION ALL
  SELECT 'quotes', 'idx_quotes_client_status' UNION ALL
  SELECT 'quotes', 'idx_quotes_status_updated' UNION ALL
  SELECT 'quotes', 'idx_quotes_expires' UNION ALL
  SELECT 'quotes', 'idx_quotes_provider_updated' UNION ALL
  SELECT 'quotes', 'idx_quotes_client_updated' UNION ALL
  SELECT 'quote_items', 'idx_quote_items_quote' UNION ALL
  SELECT 'quote_items', 'idx_quote_items_position' UNION ALL
  SELECT 'quote_attachments', 'idx_quote_attachments_quote' UNION ALL
  SELECT 'quote_attachments', 'idx_quote_attachments_category' UNION ALL
  SELECT 'quote_events', 'idx_quote_events_quote' UNION ALL
  SELECT 'quote_events', 'idx_quote_events_type' UNION ALL
  SELECT 'quote_messages', 'idx_quote_messages_quote_created' UNION ALL
  SELECT 'quote_messages', 'idx_quote_messages_sender'
) AS e
LEFT JOIN information_schema.statistics s
  ON s.table_schema = @TARGET_SCHEMA
  AND s.table_name = e.table_name
  AND s.index_name = e.index_name
GROUP BY e.table_name, e.index_name
ORDER BY e.table_name, e.index_name;

-- --------------------------------------------------------------------------
-- 4) Conteo rápido de filas para verificar datos de ejemplo
-- --------------------------------------------------------------------------
SELECT table_name, table_rows
FROM information_schema.tables
WHERE table_schema = @TARGET_SCHEMA
  AND table_name IN ('quotes','quote_items','quote_attachments','quote_events','quote_messages')
ORDER BY table_name;

-- Fin del script





