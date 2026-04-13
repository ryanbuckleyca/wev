-- Verify tables and indexes exist
-- Run this in Supabase SQL Editor to verify setup

-- Check job_matches table
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'job_matches' 
ORDER BY ordinal_position;

-- Check bookmarks table
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'bookmarks' 
ORDER BY ordinal_position;

-- Check indexes on job_matches
SELECT 
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename = 'job_matches';

-- Check indexes on bookmarks
SELECT 
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename = 'bookmarks';

-- Check RLS policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE tablename IN ('job_matches', 'bookmarks');
