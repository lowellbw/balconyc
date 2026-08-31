-- Lock down site_content, and retire the admin CMS it served.
--
-- The original policies granted INSERT, UPDATE and DELETE to everyone with
-- `USING (true)`. Because the anon key ships in every page, any visitor could
-- rewrite or wipe this table. The /admin page's password check was client-side
-- only and never protected the database.
--
-- That page has now been deleted outright rather than given real auth, because
-- nothing consumed what it wrote: index.html has never queried site_content and
-- carries no data-key attributes. Its keys (hero_title, stat1_number,
-- modal_success_title) belong to the calculator-4/-6 era landing page, which
-- was also removed. It was a CMS for a page that no longer exists.
--
-- The table and any rows in it are left in place (non-destructive) in case the
-- copy is worth migrating later. Only the write grants go. If a CMS is ever
-- rebuilt, it should authenticate through Supabase Auth and these policies
-- should be re-added scoped to the `authenticated` role.

DROP POLICY IF EXISTS "allow_public_insert" ON site_content;
DROP POLICY IF EXISTS "allow_public_update" ON site_content;
DROP POLICY IF EXISTS "allow_public_delete" ON site_content;

-- Public read stays: harmless, and keeps any future consumer working.
-- (allow_public_read is left untouched.)

-- estimates: anonymous INSERT is intentional (fire-and-forget logging from the
-- client), but the log should not be readable or editable by the public.
REVOKE ALL ON estimates FROM anon;
GRANT INSERT ON estimates TO anon;

-- Columns the client writes but the table never had. `calculator_version` was
-- passed by the old code too, so every insert would have been rejected even if
-- the query had been subscribed to — a second, independent reason this table
-- has stayed empty.
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS calculator_version TEXT;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS data_sources JSONB;
