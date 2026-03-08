#!/usr/bin/env python3
"""Apply migrations directly via Supabase REST API using service role key."""

import os
import sys
from pathlib import Path
import json
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

# Load environment
from dotenv import load_dotenv
load_dotenv()

SUPABASE_URL = os.getenv('SUPABASE_URL') or os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SERVICE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_SECRET_KEY')

if not SUPABASE_URL or not SERVICE_KEY:
    print("Error: Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
    sys.exit(1)

MIGRATIONS_DIR = Path(__file__).parent.parent / 'supabase' / 'migrations'

MIGRATIONS = [
    '202603071700_esco_skills_bilingual_reset.sql',
    '202603061612_profiles_skills_max_10.sql',
    '202603071800_jobs_skills_and_extended_matching.sql',
]

def execute_sql(sql: str) -> bool:
    """Execute SQL via Supabase SQL endpoint."""
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/rpc/exec"
    
    # Try using the query endpoint
    headers = {
        'apikey': SERVICE_KEY,
        'Authorization': f'Bearer {SERVICE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
    }
    
    # Split into statements
    statements = [s.strip() for s in sql.split(';') if s.strip() and not s.strip().startswith('--')]
    
    for stmt in statements:
        if not stmt:
            continue
            
        # Use pg_query to execute
        body = json.dumps({'query': stmt + ';'}).encode('utf-8')
        req = Request(url, data=body, headers=headers, method='POST')
        
        try:
            with urlopen(req, timeout=30) as resp:
                if resp.status >= 400:
                    print(f"   ❌ HTTP {resp.status}")
                    return False
        except HTTPError as e:
            # Some statements might not work via REST API, that's expected
            error_body = e.read().decode('utf-8', errors='replace')
            if 'does not exist' not in error_body and 'already exists' not in error_body:
                print(f"   ⚠️  HTTP {e.code}: {error_body[:200]}")
            continue
        except URLError as e:
            print(f"   ❌ Network error: {e}")
            return False
    
    return True

def apply_migration(filename: str) -> bool:
    """Apply a single migration file."""
    filepath = MIGRATIONS_DIR / filename
    
    if not filepath.exists():
        print(f"⚠️  Skipping {filename} (not found)")
        return False
    
    print(f"\n📝 Applying: {filename}")
    
    sql = filepath.read_text('utf-8')
    
    # Note: Supabase REST API has limitations - it can't execute DDL via RPC
    print("   ⚠️  REST API cannot execute DDL statements")
    print("   ℹ️  You must apply this migration via Supabase Dashboard SQL Editor")
    print(f"   📋 File: {filepath}")
    
    return False

def main():
    print("🚀 Migration Application via REST API")
    print(f"   Database: {SUPABASE_URL}")
    print("\n⚠️  IMPORTANT: Supabase REST API cannot execute DDL (CREATE TABLE, ALTER, etc.)")
    print("   You must apply migrations via the Supabase Dashboard SQL Editor:")
    print(f"   https://supabase.com/dashboard/project/{SUPABASE_URL.split('//')[1].split('.')[0]}/sql")
    print("\n📋 Migrations to apply (in order):\n")
    
    for i, migration in enumerate(MIGRATIONS, 1):
        filepath = MIGRATIONS_DIR / migration
        if filepath.exists():
            print(f"{i}. {migration}")
            print(f"   Path: {filepath}")
        else:
            print(f"{i}. {migration} ❌ NOT FOUND")
    
    print("\n" + "="*60)
    print("Copy each migration file's contents and paste into SQL Editor")
    print("="*60)

if __name__ == '__main__':
    main()
