-- Drop redundant sse_confidence column since confidence is already stored in sse_details.confidence
ALTER TABLE jobs DROP COLUMN IF EXISTS sse_confidence;
