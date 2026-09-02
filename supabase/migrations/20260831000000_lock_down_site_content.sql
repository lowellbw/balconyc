-- Bring the live database in line with the code, and close public write access.
--
-- Written to be STANDALONE and IDEMPOTENT. Verified against the live project on
-- 2026-08-31, where the earlier migrations had evidently not all been applied:
--
--   estimates     -> did not exist at all (PGRST205 from the REST API), so the
--                    20260325 create-table migration never ran. Estimate logging
--                    has therefore never been possible, independently of the
--                    lazy-query-builder bug fixed in the client.
--   site_content  -> exists, 46 rows, readable AND writable by anon. A null-key
--                    probe returned a NOT NULL violation (23502) rather than a
--                    permission error, which means the write itself was allowed.
--   waitlist      -> exists, 0 rows, writable by anon on the same evidence.
--
-- Because the anon key ships in js/config.js and is served to every visitor,
-- "writable by anon" means writable by anyone who views source. Nothing reads
-- site_content and nothing writes to waitlist any more (the pages that did were
-- removed), so both are closed here.
--
-- Safe to run more than once. Nothing is dropped and no rows are deleted.

-- ---------------------------------------------------------------------------
-- estimates: create if missing, then make it insert-only for anon
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estimates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  address TEXT,
  lat DECIMAL,
  lon DECIMAL,
  azimuth INT,
  tilt INT,
  system_watts INT,
  floor_level INT,
  total_floors INT,
  shading TEXT,
  annual_kwh DECIMAL,
  annual_savings DECIMAL,
  shade_factor DECIMAL,
  used_pvwatts BOOLEAN DEFAULT FALSE,
  data_sources JSONB,
  calculator_version TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Present separately so an older table picks them up too.
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS data_sources JSONB;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS calculator_version TEXT;

ALTER TABLE estimates ENABLE ROW LEVEL SECURITY;

-- Anonymous INSERT is intentional: the client logs each completed estimate
-- fire-and-forget. Reads stay closed, so the log is not a public dataset.
DROP POLICY IF EXISTS "anon_insert_estimates" ON estimates;
CREATE POLICY "anon_insert_estimates" ON estimates
  FOR INSERT TO anon WITH CHECK (true);

REVOKE ALL ON estimates FROM anon;
GRANT INSERT ON estimates TO anon;

-- ---------------------------------------------------------------------------
-- site_content: stop accepting writes from the public
-- ---------------------------------------------------------------------------
-- The /admin CMS that wrote here has been deleted: nothing ever read this table
-- (index.html has no data-key attributes and has never queried it), and its keys
-- belong to the calculator-4/-6 landing page, which was also removed.
--
-- The table and all 46 rows are left in place in case that copy is worth
-- recovering. Only the write grants go. If a CMS is rebuilt later, re-add these
-- policies scoped to the `authenticated` role and sign in through Supabase Auth.
DROP POLICY IF EXISTS "allow_public_insert" ON site_content;
DROP POLICY IF EXISTS "allow_public_update" ON site_content;
DROP POLICY IF EXISTS "allow_public_delete" ON site_content;

REVOKE INSERT, UPDATE, DELETE ON site_content FROM anon;

-- Public read is left as-is: harmless, and keeps any future consumer working.

-- ---------------------------------------------------------------------------
-- waitlist: close writes on an orphaned table
-- ---------------------------------------------------------------------------
-- Only calculator-4 and calculator-6 ever inserted here, and both were removed.
-- The table is currently empty. Left in place, but no longer an open write
-- endpoint that anyone can fill. Re-grant if a signup form is rebuilt.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'waitlist') THEN
    EXECUTE 'ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON waitlist FROM anon';
  END IF;
END $$;
