from utils.db import supabase

def seed():
    # Check if CharityVillage exists
    resp = supabase.table("sources").select("*").eq("slug", "charityvillage").execute()
    if not resp.data:
        print("Inserting CharityVillage source...")
        insert_resp = supabase.table("sources").insert({
            "name": "CharityVillage",
            "slug": "charityvillage",
            "url": "https://www.charityvillage.com"
        }).execute()
        print("Inserted:", insert_resp.data)
    else:
        print("CharityVillage already exists:", resp.data)

if __name__ == "__main__":
    seed()
