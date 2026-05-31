begin;
select plan(6);

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

-- Test 3: non-object jsonb fails
select throws_ok(
    $$ insert into public.profiles (id, full_name, cv_import) values (
        '00000000-0000-0000-0000-000000000003', 'Invalid CV type',
        '"just a string"'::jsonb
    ) $$,
    '23514',
    NULL,
    'fails when cv_import is not an object'
);

-- Test 4: missing required field fails
select throws_ok(
    $$ insert into public.profiles (id, full_name, cv_import) values (
        '00000000-0000-0000-0000-000000000004', 'Missing locale',
        '{"filename": "resume.pdf", "imported_at": "2023-10-01T12:00:00Z", "source": "cv_upload"}'::jsonb
    ) $$,
    '23514',
    NULL,
    'fails when cv_import is missing a required key'
);

-- Test 5: invalid enum value fails
select throws_ok(
    $$ insert into public.profiles (id, full_name, cv_import) values (
        '00000000-0000-0000-0000-000000000005', 'Invalid source',
        '{"filename": "resume.pdf", "imported_at": "2023-10-01T12:00:00Z", "source": "linkedin_import", "locale": "en"}'::jsonb
    ) $$,
    '23514',
    NULL,
    'fails when cv_import has an unknown source'
);

-- Test 6: invalid field content fails
select throws_ok(
    $$ insert into public.profiles (id, full_name, cv_import) values (
        '00000000-0000-0000-0000-000000000006', 'Invalid timestamp',
        '{"filename": "   ", "imported_at": "not-a-date", "source": "cv_upload", "locale": "en"}'::jsonb
    ) $$,
    '23514',
    NULL,
    'fails when cv_import fields have invalid contents'
);

select * from finish();
rollback;
