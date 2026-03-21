CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  icp_description text NOT NULL,
  subreddits text[] NOT NULL,
  soul_document text,
  persona_name text,
  segment_size jsonb,
  status text DEFAULT 'indexing'
    CHECK (status IN ('indexing', 'reading', 'synthesizing', 'ready', 'failed')),
  status_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id uuid REFERENCES segments(id) ON DELETE CASCADE,
  reddit_id text UNIQUE NOT NULL,
  subreddit text,
  title text,
  body text,
  score integer,
  upvote_ratio float,
  num_comments integer,
  pain_score float,
  fetched_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS post_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES posts(id) ON DELETE CASCADE,
  segment_id uuid REFERENCES segments(id) ON DELETE CASCADE,
  chunk_text text NOT NULL,
  embedding vector(768),
  metadata jsonb
);

CREATE INDEX IF NOT EXISTS post_embeddings_embedding_idx
  ON post_embeddings USING hnsw (embedding vector_cosine_ops);

CREATE OR REPLACE FUNCTION match_embeddings(
  query_embedding vector(768),
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
