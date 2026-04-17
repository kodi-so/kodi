-- Intentionally left as a no-op.
--
-- PostgreSQL does not allow newly added enum values to be used safely within
-- the same migration transaction batch that introduces them. The application
-- already normalizes legacy statuses (`live`, `summarizing`,
-- `awaiting_approval`, `executing`, `completed`) at read/write time, so we do
-- not need a blocking startup-time data rewrite here.
SELECT 1;
