-- Canonical USER identities no longer carry legacy account tiers.
-- Keep the column for backwards-compatible historical session rows, but do not
-- require or populate it for new canonical USER sessions.
ALTER TABLE public.downtime_central_sessions
  ALTER COLUMN tier DROP NOT NULL;
