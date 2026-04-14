import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// Integration tests run locally and in CI — both use a local Supabase instance.
// Use vi.hoisted so this flag is available inside vi.mock (which is hoisted to top of file).
const { shouldRun } = vi.hoisted(() => ({
  shouldRun: !process.env.SKIP_INTEGRATION_TESTS,
}));

if (!shouldRun) {
  console.log('⚠️  Integration tests skipped (SKIP_INTEGRATION_TESTS=1).');
}

// Mock the supabaseServer singleton used by match-calculator.ts
vi.mock('@/lib/supabase-server', async () => {
  if (!shouldRun) {
    return { supabaseServer: {} as SupabaseClient }; // Dummy when skipping
  }
  const { getRealDatabaseClient } = await import('../test-utils/real-db');
  return {
    supabaseServer: getRealDatabaseClient(),
  };
});

// Setup a local pointer to the real client for test setup/cleanup
let supabase: SupabaseClient;
if (shouldRun) {
  const { getRealDatabaseClient: getClient } = await import('../test-utils/real-db');
  supabase = getClient();
}

// Now import the functions to test
import { calculateUserMatches } from './match-calculator';

/**
 * INTEGRATION TEST: Verifies the Postgres-based matching algorithm.
 * Requires a running local Supabase instance (supabase start).
 * Runs locally and in CI. Set SKIP_INTEGRATION_TESTS=1 to skip.
 */
describe.skipIf(!shouldRun)('match calculator (integration)', () => {
  const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';
  const TEST_JOB_ID = '00000000-0000-0000-0000-000000000002';

  const TEST_SOURCE_ID = '00000000-0000-0000-0000-000000000003';

  beforeAll(async () => {
    const { isLocalDatabaseAvailable } = await import('../test-utils/real-db');
    if (!await isLocalDatabaseAvailable()) {
      console.log('⚠️  Skipping integration tests — local Supabase is not running. Run: supabase start');
      return;
    }
    console.log('--- TEST SETUP START ---');
    // 1. Cleanup existing test data
    await supabase.from('job_matches').delete().eq('user_id', TEST_USER_ID);
    await supabase.from('jobs').delete().eq('id', TEST_JOB_ID);
    await supabase.from('sources').delete().eq('id', TEST_SOURCE_ID);
    await supabase.from('profiles').delete().eq('id', TEST_USER_ID);
    await supabase.from('esco_skills').delete().in('concept_uri', ['test-skill-exact', 'test-skill-semantic-1', 'test-skill-semantic-2']);

    // 2. Setup mock source
    await supabase.from('sources').insert({
      id: TEST_SOURCE_ID,
      name: 'Test Source',
      url: 'https://test-source.com'
    });

    // 3. Setup mock ESCO skills for semantic matching
    // Jina embeddings require 1024 dimensions.
    const vector1 = `[${new Array(1024).fill(0).map((_, i) => (i === 0 ? 1 : 0)).join(',')}]`;
    const vector2 = `[${new Array(1024).fill(0).map((_, i) => (i === 0 ? 0.9 : i === 1 ? 0.1 : 0)).join(',')}]`;

    const { error: skillErr } = await supabase.from('esco_skills').insert([
      { concept_uri: 'test-skill-exact', preferred_label_en: 'Exact Skill' },
      {
        concept_uri: 'test-skill-semantic-1',
        preferred_label_en: 'Management',
        embedding: vector1
      },
      {
        concept_uri: 'test-skill-semantic-2',
        preferred_label_en: 'Leadership',
        embedding: vector2
      }
    ]);
    if (skillErr) console.error('Skill Setup Error:', skillErr);

    // 4. Setup test job
    const { error: jobErr } = await supabase.from('jobs').insert({
      id: TEST_JOB_ID,
      source_id: TEST_SOURCE_ID,
      job_title: 'Test Integration Job',
      organization: 'Test Org',
      listing_url: 'https://example.com/test-job',
      skills: ['test-skill-exact', 'test-skill-semantic-2'],
      values: ['community', 'care'],
      work_type: 'remote',
      lat: 45.4215,
      lng: -75.6972,
      municipality: 'Ottawa',
      province: 'ON'
    });
    if (jobErr) console.error('Job Setup Error:', jobErr);
    console.log('--- TEST SETUP END ---');
  });

  afterAll(async () => {
    // Final cleanup
    await supabase.from('job_matches').delete().eq('user_id', TEST_USER_ID);
    await supabase.from('jobs').delete().eq('id', TEST_JOB_ID);
    await supabase.from('sources').delete().eq('id', TEST_SOURCE_ID);
    await supabase.from('profiles').delete().eq('id', TEST_USER_ID);
    await supabase.from('esco_skills').delete().in('concept_uri', ['test-skill-exact', 'test-skill-semantic-1', 'test-skill-semantic-2']);
  });

  it('calculates a high score for an exact match', async () => {
    // 1. Setup matching profile
    const { error: profErr } = await supabase.from('profiles').insert({
      id: TEST_USER_ID,
      skills: ['test-skill-exact'],
      values: ['community', 'care'],
      work_types: ['remote'],
      lat: 45.4247,
      lng: -75.6950,
      municipality: 'Ottawa',
      province: 'ON'
    });
    if (profErr) console.error('Profile Insert Error:', profErr);

    // Verify profile exists
    const { data: pCheck } = await supabase.from('profiles').select('id').eq('id', TEST_USER_ID).single();
    console.log('Verified Profile:', pCheck?.id);

    // Verify job exists
    const { data: jCheck } = await supabase.from('jobs').select('id').eq('id', TEST_JOB_ID).single();
    console.log('Verified Job:', jCheck?.id);

    // 2. Trigger calculation
    console.log('Calling calculateUserMatches...');
    await calculateUserMatches(TEST_USER_ID);
    console.log('calculateUserMatches finished.');

    // 3. Assert results in DB
    const { data: match, error } = await supabase
      .from('job_matches')
      .select('*')
      .eq('user_id', TEST_USER_ID)
      .eq('job_id', TEST_JOB_ID)
      .single();

    if (error) console.error('Match Fetch Error:', error);
    expect(match).toBeDefined();

    // With 100% value overlap (55%) and 1/2 skill overlap (35%), score should be high
    expect(match.score).toBeGreaterThan(0.7);
    expect(match.shared_values).toContain('community');
    expect(match.shared_skills).toContain('test-skill-exact');
    expect(match.location_score).toBe(1.0); // Ottawa to Ottawa
  });

  it('recalculates correctly when profile changes (semantic match)', async () => {
    // 1. Update profile to use semantic skill instead of exact
    await supabase.from('profiles').update({
      skills: ['test-skill-semantic-1'],
      values: ['growth'] // No value overlap anymore
    }).eq('id', TEST_USER_ID);

    // 2. Trigger calculation
    await calculateUserMatches(TEST_USER_ID);

    const { data: match } = await supabase
      .from('job_matches')
      .select('*')
      .eq('user_id', TEST_USER_ID)
      .eq('job_id', TEST_JOB_ID)
      .single();

    // Skill score should benefit from semantic similarity (~0.9)
    // Value score should be 0 (no overlap)
    expect(match.skill_score).toBeGreaterThan(0.3); // Proportional to semantic similarity
    expect(match.shared_skills).toContain('test-skill-semantic-1'); // User's matched skill
    expect(match.value_score).toBe(0);
    expect(match.score).toBeLessThan(0.5); // Total score drops because values (55%) are missing
  });

  it('handles location weighting correctly for remote vs local', async () => {
    // 1. Move user to Vancouver (Far from Ottawa job)
    await supabase.from('profiles').update({
      lat: 49.2827,
      lng: -123.1207,
      municipality: 'Vancouver',
      province: 'BC',
      work_types: ['onsite'] // Force local dependency
    }).eq('id', TEST_USER_ID);

    await calculateUserMatches(TEST_USER_ID);

    const { data: match } = await supabase
      .from('job_matches')
      .select('*')
      .eq('user_id', TEST_USER_ID)
      .eq('job_id', TEST_JOB_ID)
      .single();

    // Per location_score_for_pair logic: remote job + non-remote user returns NULL
    // (Meaning the location dimension is skipped in the weighted average)
    expect(match.location_score).toBeNull();
  });
});
