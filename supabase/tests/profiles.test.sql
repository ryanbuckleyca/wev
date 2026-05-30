begin;
select plan(3);

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

select * from finish();
rollback;
