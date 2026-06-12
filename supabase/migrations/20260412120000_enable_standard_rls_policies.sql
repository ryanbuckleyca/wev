-- Enable standard RLS policies for all core tables

-- 1. Public/Authenticated Read Access (SELECT only)
-- These tables contain shared data that everyone should be able to see.

CREATE POLICY "Allow public read access for jobs"
  ON public.jobs FOR SELECT USING (true);

CREATE POLICY "Allow public read access for sources"
  ON public.sources FOR SELECT USING (true);

CREATE POLICY "Allow public read access for organizations"
  ON public.organizations FOR SELECT USING (true);

CREATE POLICY "Allow public read access for esco_skills"
  ON public.esco_skills FOR SELECT USING (true);

CREATE POLICY "Allow public read access for scrape_runs"
  ON public.scrape_runs FOR SELECT USING (true);

-- 2. Owner-Only Access (user_id lookup)
-- These tables contain private data that only the owner should access.

-- Profiles: Users can view and manage their own profile
-- (Note: INSERT policy "Users can insert their own profile" already exists)
CREATE POLICY "Users can select own profile"
  ON public.profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can delete own profile"
  ON public.profiles FOR DELETE USING (auth.uid() = id);

-- Job Matches: Users can only see their own scores
CREATE POLICY "Users can view own job matches"
  ON public.job_matches FOR SELECT USING (auth.uid() = user_id);

-- Bookmarks: Users have full control over their own bookmarks
CREATE POLICY "Users can manage own bookmarks"
  ON public.bookmarks FOR ALL USING (auth.uid() = user_id);

-- Ensure all tables have RLS enabled (just in case)
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.esco_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scrape_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;
