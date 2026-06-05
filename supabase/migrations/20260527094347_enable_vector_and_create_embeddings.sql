-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Materials embeddings table for RAG
CREATE TABLE material_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_file_id text NOT NULL,
  file_name text NOT NULL,
  file_path text,
  mime_type text,
  chunk_index int NOT NULL DEFAULT 0,
  chunk_text text NOT NULL,
  embedding vector(768),  -- Gemini text-embedding-004 uses 768 dimensions
  last_modified timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast similarity search
CREATE INDEX idx_material_embeddings_embedding ON material_embeddings 
  USING hnsw (embedding vector_cosine_ops);

-- Index for looking up chunks by file
CREATE INDEX idx_material_embeddings_file_id ON material_embeddings(drive_file_id);

-- Unique constraint to prevent duplicate chunks
CREATE UNIQUE INDEX idx_material_embeddings_file_chunk ON material_embeddings(drive_file_id, chunk_index);

-- Chat message usage tracking (for daily limits)
CREATE TABLE chat_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message_date date NOT NULL DEFAULT CURRENT_DATE,
  message_count int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, message_date)
);

-- RLS policies for material_embeddings
ALTER TABLE material_embeddings ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read embeddings (for search)
CREATE POLICY "Authenticated users can read embeddings"
  ON material_embeddings FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can insert/update/delete embeddings (indexing pipeline)
CREATE POLICY "Admins can manage embeddings"
  ON material_embeddings FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'super_admin')
    )
  );

-- RLS for chat_usage
ALTER TABLE chat_usage ENABLE ROW LEVEL SECURITY;

-- Users can read their own usage
CREATE POLICY "Users can read own chat usage"
  ON chat_usage FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Edge function (service role) can insert/update usage
CREATE POLICY "Service can manage chat usage"
  ON chat_usage FOR ALL
  TO service_role
  USING (true);

-- Function to search materials by embedding similarity
CREATE OR REPLACE FUNCTION search_materials(
  query_embedding vector(768),
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
