CREATE TABLE IF NOT EXISTS site_content (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE site_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_public_read" ON site_content FOR SELECT USING (true);
CREATE POLICY "allow_public_insert" ON site_content FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_public_update" ON site_content FOR UPDATE USING (true);
