import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { extractSkillsAndValuesFromCv } from '@/lib/cv';
import { parseCvOnServer } from '@/lib/cv/parser.server';
import { createClient } from '@supabase/supabase-js';

config({ path: resolve(process.cwd(), '.env') });

async function testCvUploader() {
  console.log('Testing CV Uploader end-to-end...');

  const groqKey = process.env.GROQ_API_KEY;
  const jinaKey = process.env.JINA_API_KEY;

  if (!groqKey || !jinaKey) {
    throw new Error('Missing GROQ_API_KEY or JINA_API_KEY');
  }

  // Get a test user ID from the database using service role to bypass RLS for fetching
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY!; // use service role for testing
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, full_name, skill_phrases')
    .limit(1);
  if (error || !profiles.length) {
    throw new Error('Failed to fetch a test user');
  }
  const user = profiles[0];
  const userId = user.id;

  console.log(`Extracting CV for user: ${user.full_name || userId}`);
  console.log(`Current skill_phrases in DB:`, user.skill_phrases);

  // 1. Parse CV (DOCX)
  console.log('Parsing DOCX...');
  const fileBuffer = readFileSync('scratch/sample_cv.docx');
  const file = new File([fileBuffer], 'sample_cv.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const { text, metadata } = await parseCvOnServer(file, 'en');
  console.log('Parsed text length:', text.length);

  // 2. Extract Skills and Values
  console.log('Extracting skills and values via Groq and Jina...');
  const result = await extractSkillsAndValuesFromCv({
    cvText: text,
    userId,
    groqKey,
    jinaKey,
    locale: 'en',
    groqModel: 'mixtral-8x7b-32768',
  });

  console.log('--- Extraction Result ---');
  console.log(
    'ESCO Skills mapped:',
    result.skills.map((s) => s.preferredLabel.en),
  );
  console.log('Values:', result.values);

  // 3. Update Profile
  console.log('--- Updating Profile ---');

  const { data: updatedProfile, error: updateError } = await supabase
    .from('profiles')
    .update({
      // skill_phrases will be updated separately
      // skill_phrases: result.skill_phrases,
      cv_import: metadata,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select('id, skill_phrases, cv_import')
    .single();

  if (updateError) {
    throw new Error(`Profile update failed: ${updateError.message}`);
  }

  console.log('Profile successfully updated!');
  console.log('New skill_phrases in DB:', updatedProfile.skill_phrases);
}

testCvUploader().catch(console.error);
