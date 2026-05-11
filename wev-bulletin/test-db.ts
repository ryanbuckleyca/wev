import * as dotenv from 'dotenv';
dotenv.config({ path: '../.env' });
import { supabaseServer } from './lib/supabase-server';

async function checkDb() {
  const { count, error } = await supabaseServer.from('esco_skills').select('*', { count: 'exact', head: true });
  console.log('Total skills:', count);
  console.log('Error:', error);

  const { data } = await supabaseServer.from('esco_skills').select('embedding').limit(5);
  console.log('Embeddings:', data);
}
checkDb();
