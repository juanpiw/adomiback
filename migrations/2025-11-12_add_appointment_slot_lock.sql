-- Garantiza unicidad de slots activos por proveedor
ALTER TABLE appointments
  ADD COLUMN slot_active TINYINT(1) AS (
    CASE
      WHEN status IN ('scheduled','pending','confirmed','in_progress') THEN 1
      ELSE 0
    END
  ) STORED AFTER status;

CREATE UNIQUE INDEX uq_appointments_provider_slot_active
  ON appointments (provider_id, `date`, start_time, slot_active);


