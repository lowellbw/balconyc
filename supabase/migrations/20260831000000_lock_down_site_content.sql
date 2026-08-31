-- Lock down site_content writes.
--
-- The original policies granted INSERT, UPDATE and DELETE to everyone with
-- `USING (true)`. Because the anon key ships in every page, that meant any
-- visitor could rewrite or wipe the site's editable copy. The admin page's
-- password check is client-side only and never protected the database.
--
-- Public reads stay open (the site renders from this table). Writes now
-- require an authenticated Supabase session, so access is granted by
-- creating a user in Auth rather than by knowing a string in the HTML.

DROP POLICY IF EXISTS "allow_public_insert" ON site_content;
DROP POLICY IF EXISTS "allow_public_update" ON site_content;
DROP POLICY IF EXISTS "allow_public_delete" ON site_content;

CREATE POLICY "authenticated_insert" ON site_content
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated_update" ON site_content
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_delete" ON site_content
  FOR DELETE TO authenticated USING (true);

-- estimates: anonymous inserts are intentional (fire-and-forget logging from
-- the client), but nobody should be able to read the log back, and rows must
-- not be editable after the fact. Reads are for the service role only, which
-- never leaves the server.
REVOKE ALL ON estimates FROM anon;
GRANT INSERT ON estimates TO anon;

-- Columns added so the client can record which data sources actually fed an
-- estimate. Without these the analytics table cannot answer the operational
-- question that matters most: how often does the full pipeline really run?
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS calculator_version TEXT;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS data_sources JSONB;
