ALTER TABLE "memory_vaults"
  ALTER COLUMN "storage_backend" SET DEFAULT 'r2';

UPDATE "memory_vaults"
  SET "storage_backend" = 'r2'
  WHERE "storage_backend" = 's3';
