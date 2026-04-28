ALTER TABLE "memory_paths"
  ADD COLUMN "content_search_vector" tsvector;

CREATE INDEX "memory_paths_content_search_idx"
  ON "memory_paths" USING gin ("content_search_vector");
