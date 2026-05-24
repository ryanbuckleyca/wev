begin;
select plan(7);

-- Test 1: cv_import can be null
select lives_ok(
    $$ insert into public.profiles (id, full_name) values ('00000000-0000-0000-0000-000000000001', 'Test Null CV') $$,
    'cv_import can be null'
);

-- Test 2: valid cv_import succeeds
select lives_ok(
    $$ insert into public.profiles (id, full_name, cv_import) values (
        '00000000-0000-0000-0000-000000000002',
        'Test Valid CV',
        '{"filename": "resume.pdf", "imported_at": "2023-10-01T12:00:00Z", "source": "cv_upload", "locale": "en"}'::jsonb
    ) $$,
    'valid cv_import JSON succeeds'
);

-- Test 3: missing filename fails
select throws_ok(
    $$ insert into public.profiles (id, full_name, cv_import) values (
        '00000000-0000-0000-0000-000000000003', 'Missing Filename',
        '{"imported_at": "2023-10-01T12:00:00Z", "source": "cv_upload", "locale": "en"}'::jsonb
    ) $$,
    '23514',
    NULL,
    'fails when filename is missing'
);

-- Test 4: missing imported_at fails
select throws_ok(
    $$ insert into public.profiles (id, full_name, cv_import) values (
        '00000000-0000-0000-0000-000000000004', 'Missing Date',
        '{"filename": "resume.pdf", "source": "cv_upload", "locale": "en"}'::jsonb
    ) $$,
    '23514',
    NULL,
    'fails when imported_at is missing'
);

-- Test 5: missing source fails
select throws_ok(
    $$ insert into public.profiles (id, full_name, cv_import) values (
        '00000000-0000-0000-0000-000000000005', 'Missing Source',
        '{"filename": "resume.pdf", "imported_at": "2023-10-01T12:00:00Z", "locale": "en"}'::jsonb
    ) $$,
    '23514',
    NULL,
    'fails when source is missing'
);

-- Test 6: missing locale fails
select throws_ok(
    $$ insert into public.profiles (id, full_name, cv_import) values (
        '00000000-0000-0000-0000-000000000006', 'Missing Locale',
        '{"filename": "resume.pdf", "imported_at": "2023-10-01T12:00:00Z", "source": "cv_upload"}'::jsonb
    ) $$,
    '23514',
    NULL,
    'fails when locale is missing'
);

-- Test 7: invalid imported_at format fails (cannot cast to timestamptz)
select throws_ok(
    $$ insert into public.profiles (id, full_name, cv_import) values (
        '00000000-0000-0000-0000-000000000007', 'Invalid Date',
        '{"filename": "resume.pdf", "imported_at": "not-a-date", "source": "cv_upload", "locale": "en"}'::jsonb
    ) $$,
    '22007',
    NULL,
    'fails when imported_at is not a valid timestamptz'
);

select * from finish();
rollback;
