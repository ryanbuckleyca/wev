#!/usr/bin/env python3
"""Simple script to add values column to production database."""

import os
from dotenv import load_dotenv, find_dotenv
from supabase import create_client
import sys

# Load environment
load_dotenv(find_dotenv())

# Use production credentials
SUPABASE_URL = os.environ.get("SUPABASE_PROD_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_PROD_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    print("❌ Production Supabase credentials not found")
    exit(1)

print(f"🔗 Connecting to: {SUPABASE_URL}")

# Create client
supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

try:
    # Check if column exists
    print("🔍 Checking if values column exists...")
    result = supabase.table('jobs').select('id').limit(1).execute()
    
    if result.data:
        print("✅ Connected to production database")
        
        # Try to add the column
        print("📝 Adding values column...")
        
        try:
            test_result = supabase.table('jobs').select('values').limit(1).execute()
            print("✅ Values column already exists!")
        except Exception as e:
            if 'column jobs.values does not exist' in str(e):
                print("⚠️  Values column doesn't exist. Need to add it manually.")
                print("📋 Please run this SQL in the Supabase dashboard:")
                print("ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS \"values\" text[] NOT NULL DEFAULT '{}'::text[];")
            else:
                print(f"❌ Error checking column: {e}")
    else:
        print("❌ No jobs found in database")
        
except Exception as e:
    print(f"❌ Error: {e}")
