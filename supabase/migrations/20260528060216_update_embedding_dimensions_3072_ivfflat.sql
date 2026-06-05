-- Drop existing index and function
DROP INDEX IF EXISTS idx_material_embeddings_embedding;
DROP FUNCTION IF EXISTS search_materials;

-- Change the column to 3072 dimensions
ALTER TABLE material_embeddings ALTER COLUMN embedding TYPE vector(3072);

-- For small datasets (<1000 rows), exact search is fast enough without an index
-- We'll add IVFFlat later if needed after enough data is inserted

-- Recreate the search function with correct dimensions
CREATE OR REPLACE FUNCTION search_materials(
  query_embedding vector(3072),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  drive_file_id text,
  file_name text,
  file_path text,
  chunk_text text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    me.id,
    me.drive_file_id,
    me.file_name,
    me.file_path,
    me.chunk_text,
    1 - (me.embedding <=> query_embedding) AS similarity
  FROM material_embeddings me
  WHERE 1 - (me.embedding <=> query_embedding) > match_threshold
  ORDER BY me.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
