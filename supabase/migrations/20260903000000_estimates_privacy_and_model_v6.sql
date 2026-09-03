-- Estimate logging, September 2026 model revision.
--
-- Privacy: the client no longer sends the formatted street address, and it
-- rounds coordinates to three decimals (about 100 m). The building is still
-- identifiable through BBL/BIN, which are public identifiers; the page now
-- discloses the logging. Existing address values are cleared.
--
-- Model: record which production and shade paths ran and the self-consumption
-- share, so analytics can tell a PVWatts + 3D estimate from a fallback one.

ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS bbl TEXT,
  ADD COLUMN IF NOT EXISTS bin TEXT,
  ADD COLUMN IF NOT EXISTS pvwatts_variant TEXT,
  ADD COLUMN IF NOT EXISTS shade_source TEXT,
  ADD COLUMN IF NOT EXISTS neighbor_count INT,
  ADD COLUMN IF NOT EXISTS tree_count INT,
  ADD COLUMN IF NOT EXISTS occupancy TEXT,
  ADD COLUMN IF NOT EXISTS mount_type TEXT,
  ADD COLUMN IF NOT EXISTS inverter_watts INT,
  ADD COLUMN IF NOT EXISTS self_consumption DECIMAL,
  ADD COLUMN IF NOT EXISTS exported_kwh DECIMAL;

UPDATE estimates SET address = NULL WHERE address IS NOT NULL;

COMMENT ON COLUMN estimates.address IS 'No longer written (September 2026); cleared for existing rows.';
COMMENT ON COLUMN estimates.lat IS 'Rounded to 3 decimals by the client since September 2026.';
COMMENT ON COLUMN estimates.lon IS 'Rounded to 3 decimals by the client since September 2026.';
