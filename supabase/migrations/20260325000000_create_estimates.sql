-- Solar calculator estimate logging
-- Each completed calculation inserts a row for analytics.
-- No PII beyond address. Anonymous insert only (write-only from client).

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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE estimates ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (client-side fire-and-forget logging)
CREATE POLICY "anon_insert_estimates" ON estimates
  FOR INSERT WITH CHECK (true);
