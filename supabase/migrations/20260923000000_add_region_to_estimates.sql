-- Record where an estimate was made, and how the visitor arrived.
--
-- From calculator_version 6 the calculator accepts any US address. Outside
-- New York City it keeps nothing finer than the state and the first three
-- digits of the ZIP (address, lat and lon are written as NULL there), so these
-- columns are what makes a national estimate countable without holding
-- anyone's address.
--
--   mode              nyc_3d | nyc_manual | us_described
--   state_code        two-letter state, e.g. 'IL'
--   zip3              first three digits of the ZIP
--   electricity_rate  the $/kWh the savings were valued at
--   rate_source       coned_marginal | eia_state_avg | user
--   obstruction       US mode only: {"across": "...", "distance": "..."}
--   entry_source      direct | url_params | a utm_source or referring host.
--                     url_params is a prefilled link, which is how an AI
--                     assistant hands someone an estimate.
--
-- Until this has run, PostgREST rejects the whole v6 row for naming unknown
-- columns; the client then retries with the pre-v6 columns only, so rows are
-- not lost, but none of the fields above are kept. Apply before or soon after
-- deploying.
--
-- Standalone and idempotent: safe to run more than once. Nothing is dropped.

ALTER TABLE estimates ADD COLUMN IF NOT EXISTS mode TEXT;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS state_code CHAR(2);
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS zip3 CHAR(3);
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS electricity_rate DECIMAL;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS rate_source TEXT;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS obstruction JSONB;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS entry_source TEXT;
