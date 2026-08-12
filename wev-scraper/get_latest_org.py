#!/usr/bin/env python3
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env.production")

from utils.db import supabase

response = supabase.table("organizations").select("id, name, created_at").order("id", desc=True).limit(1).execute()
if response.data:
    org = response.data[0]
    print(f"Latest org ID: {org['id']}")
    print(f"Name: {org['name']}")
    print(f"Created: {org['created_at']}")
