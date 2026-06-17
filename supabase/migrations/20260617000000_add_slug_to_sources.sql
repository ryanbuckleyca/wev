ALTER TABLE public.sources
ADD COLUMN IF NOT EXISTS slug text;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'sources_slug_key'
          AND conrelid = 'public.sources'::regclass
    ) THEN
        ALTER TABLE public.sources
        ADD CONSTRAINT sources_slug_key UNIQUE (slug);
    END IF;
END $$;

-- Back-fill production rows with stable source identifiers.
UPDATE public.sources SET slug = 'ecocan' WHERE id = 'eb5a9e52-b626-4539-8539-981240f2dbee';
UPDATE public.sources SET slug = 'goodwork' WHERE id = 'd644049f-7186-4b7e-8860-adf69a4bd927';
UPDATE public.sources SET slug = 'coco' WHERE id = '4bbc9bac-76ae-4b2e-bd4e-ac67f739ac2a';
UPDATE public.sources SET slug = 'csi' WHERE id = 'a7154a94-7c95-442f-811a-12f9a62e5332';
UPDATE public.sources SET slug = 'cent' WHERE id = 'c068cbc6-90a5-45cb-95a1-a7281dd76198';
UPDATE public.sources SET slug = 'mac' WHERE id = '01a58f5e-f47c-4310-a2d1-6627a57e2071';
UPDATE public.sources SET slug = 'macb' WHERE id = '394fd635-bf74-463a-9e74-b17405a8b688';

-- Back-fill local/staging rows where UUIDs differ but URLs are stable.
UPDATE public.sources SET slug = 'ecocan' WHERE url = 'https://eco.ca/jobs';
UPDATE public.sources SET slug = 'goodwork' WHERE url = 'https://goodwork.ca';
UPDATE public.sources SET slug = 'coco' WHERE url = 'https://coco-net.org/job-postings/';
UPDATE public.sources SET slug = 'csi' WHERE url = 'https://socialinnovation.org';
UPDATE public.sources SET slug = 'cent' WHERE url = 'https://centraide.ca';
UPDATE public.sources SET slug = 'mac' WHERE url = 'https://macommunaute.ca/emplois';
UPDATE public.sources SET slug = 'macb' WHERE url = 'https://macommunaute.ca/benevolat';

-- Rename legacy slug values from earlier branches.
UPDATE public.sources SET slug = 'ecocan' WHERE slug = 'ecocanada';
UPDATE public.sources SET slug = 'cent' WHERE slug = 'centraide';
UPDATE public.sources SET slug = 'mac' WHERE slug = 'ma_communaute';
UPDATE public.sources SET slug = 'macb' WHERE slug = 'ma_communaute_b';
