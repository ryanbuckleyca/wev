-- Add job matching system
-- Tracks match scores between users and jobs based on shared values

CREATE TABLE IF NOT EXISTS job_matches (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  score FLOAT NOT NULL CHECK (score >= 0 AND score <= 1),
  shared_values TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, job_id)
);
-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_job_matches_user_score ON job_matches(user_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_job_matches_job_score ON job_matches(job_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_job_matches_updated_at ON job_matches(updated_at DESC);
-- RLS policies
ALTER TABLE job_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own job matches" ON job_matches
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own job matches" ON job_matches
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own job matches" ON job_matches
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own job matches" ON job_matches
  FOR DELETE USING (auth.uid() = user_id);
