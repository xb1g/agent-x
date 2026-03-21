-- Fix embedding dimensions to 1536 (within HNSW 2000 limit)
-- gemini-embedding-2-preview supports configurable dimensions via outputDimensionality

-- Drop existing index
DROP INDEX IF EXISTS post_embeddings_embedding_idx;

-- Drop existing function
DROP FUNCTION IF EXISTS match_embeddings(vector(3072), uuid, int);

-- Alter embedding column to 1536 dimensions
ALTER TABLE post_embeddings 
  ALTER COLUMN embedding TYPE vector(1536);

-- Recreate index with new dimensions
CREATE INDEX post_embeddings_embedding_idx
  ON post_embeddings USING hnsw (embedding vector_cosine_ops);

-- Recreate function with new dimensions
CREATE OR REPLACE FUNCTION match_embeddings(
  query_embedding vector(1536),
  match_segment_id uuid,
  match_count int DEFAULT 5
)
RETURNS TABLE (chunk_text text, similarity float)
LANGUAGE sql
STABLE
AS $$
  SELECT chunk_text, 1 - (embedding <=> query_embedding) AS similarity
  FROM post_embeddings
  WHERE segment_id = match_segment_id
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;