
from utils.db import supabase

# Fetch the 3 jobs we just tagged
res = supabase.table("jobs").select("id, job_title, description, skills_raw, job_skills(score, esco_skills(preferred_label_en))").order("scraped_at", desc=True).limit(3).execute()

for job in res.data:
    print("=" * 80)
    print(f"JOB TITLE: {job['job_title']}")
    print("-" * 80)
    print("SKILLS RAW (LLM Extracted):")
    for phrase in job['skills_raw'] or []:
        print(f" - {phrase}")
    print("-" * 80)
    print("ESCO SKILLS MATCHED:")
    skills = job.get('job_skills') or []
    # Sort by score desc
    skills.sort(key=lambda x: x['score'], reverse=True)
    for s in skills:
        label = s['esco_skills']['preferred_label_en'] if s['esco_skills'] else 'Unknown'
        print(f" - {label} (score: {s['score']:.3f})")
    print("-" * 80)
    desc = job['description'] or ''
    # snippet
    print(f"DESCRIPTION SNIPPET: {desc[:500]}...")
    print("=" * 80 + "\n")
