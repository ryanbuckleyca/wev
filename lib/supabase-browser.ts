import { createClient } from '@supabase/supabase-js'

export function createBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLIC_KEY
  
  if (!url || !key) {
    console.error('Missing Supabase env vars:', { url: !!url, key: !!key })
    throw new Error('Missing Supabase environment variables')
  }
  
  console.log('Creating Supabase client with URL:', url)
  return createClient(url, key)
}
