-- Autolearn support schema migration
-- Adds tables and columns for the autolearn feedback loop, interview insights, and LinkedIn lead tracking

-- 1. Add relevance_score column to posts table (separate from pain_score)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS relevance_score INTEGER;

-- 2. Create query_history table for tracking search queries and their performance
CREATE TABLE IF NOT EXISTS query_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id uuid NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
  query_text text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'replaced', 'retired')),
  avg_relevance_score float,
  posts_evaluated integer DEFAULT 0,
  replaced_by uuid REFERENCES query_history(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  retired_at timestamptz
);

-- Index on segment_id for efficient lookups
CREATE INDEX IF NOT EXISTS query_history_segment_id_idx ON query_history(segment_id);

-- 3. Create interview_insights table for tracking insights from interviews
CREATE TABLE IF NOT EXISTS interview_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id uuid NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('pain', 'wtp', 'feature')),
  summary text NOT NULL,
  exchange_index integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 4. Create prospect_linkedin table for LinkedIn lead enrichment
CREATE TABLE IF NOT EXISTS prospect_linkedin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  segment_id uuid NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
  linkedin_name text,
  linkedin_title text,
  linkedin_company text,
  linkedin_url text,
  raw_response jsonb,
  created_at timestamptz DEFAULT now()
);

-- Unique constraint on post_id - only one LinkedIn profile per post
CREATE UNIQUE INDEX IF NOT EXISTS prospect_linkedin_post_id_idx ON prospect_linkedin(post_id);
