import os
from supabase import create_client, Client

url = os.environ.get("SUPABASE_PROD_URL")
key = os.environ.get("SUPABASE_PROD_SERVICE_ROLE_KEY")

if not url or not key:
    print("Missing credentials")
    exit(1)

supabase: Client = create_client(url, key)

# Fetch Adamant
adamant = supabase.table("organizations").select("slug, name, location, municipality, province").eq("slug", "adamant").execute()
print("Adamant:", adamant.data)

# Fetch Accelerating Community Energy Transformation
acet = supabase.table("organizations").select("slug, name, location, municipality, province").eq("slug", "accelerating-community-energy-transformation").execute()
print("ACET:", acet.data)
