import time
import uuid

from utils.db import supabase

# Define the profiles and their ESCO skill URIs
profiles = {
    "Cyber Expert": {
        "skills": ["cyber security", "manage IT security risks", "risk management"]
    },
    "Bilingual IT Support": {
        "skills": ["provide ICT support", "web programming", "manage website content"]
    },
    "NGO Fundraiser": {
        "skills": ["perform fundraising activities", "manage grants", "build business relationships"]
    }
}

user_ids = {}

# Create profiles and fetch exact ESCO URIs
for name, data in profiles.items():
    uid = str(uuid.uuid4())
    user_ids[name] = uid
    supabase.table("profiles").insert({"id": uid, "full_name": name}).execute()
    
    # Fetch URIs for skills
    labels = data["skills"]
    res = supabase.table("esco_skills").select("concept_uri, preferred_label_en").in_("preferred_label_en", labels).execute()
    uris = [r["concept_uri"] for r in res.data]
    
    # Insert profile skills
    ps_data = [{"user_id": uid, "skill_id": uri, "score": 1.0, "source": "manual"} for uri in uris]
    if ps_data:
        supabase.table("profile_skills").insert(ps_data).execute()
    print(f"Created {name} with {len(uris)} skills.")

# Wait a moment for triggers
print("Waiting for match queue to process...")
time.sleep(3)
# Execute queue manually
supabase.rpc("process_job_match_recalc_queue").execute()

# Fetch and print results
for name, uid in user_ids.items():
    print("=" * 80)
    print(f"PROFILE: {name} | SKILLS: {', '.join(profiles[name]['skills'])}")
    print("-" * 80)
    res = supabase.table("job_matches").select("job_id, score, skill_score, jobs(job_title)").eq("user_id", uid).order("score", desc=True).limit(3).execute()
    for i, match in enumerate(res.data, 1):
        title = match["jobs"]["job_title"] if match["jobs"] else "Unknown Job"
        print(f" {i}. {title}")
        print(f"    Skill Score: {match['skill_score']:.3f} | Overall Match: {match['score']:.3f}")
    print()
    # Cleanup
    supabase.table("profiles").delete().eq("id", uid).execute()

