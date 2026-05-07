import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.test' });

const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  console.log('Testing search_esco_skills via RPC...');
  const { data, error } = await supabase.rpc('search_esco_skills', {
    p_query: 'a',
    p_limit: 5,
    p_locale: 'en'
  });

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Results:', JSON.stringify(data, null, 2));
  }
}

test();
