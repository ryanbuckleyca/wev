import time
import uuid

from utils.db import supabase


def main():
    # 1. Create a mock user
    user_id = str(uuid.uuid4())
    print(f"Creating mock user: {user_id}")
    supabase.table("profiles").insert({"id": user_id, "full_name": "Test Exec Dir"}).execute()

    try:
        # 2. Add some profile_skills that match the Executive Director job we just tagged
        # From earlier, "Executive Director" mapped to:
        # - strategic planning: http://data.europa.eu/esco/skill/e8d538e1-5ef2-4e67-b52b-d360ecb30e07
        # - financial management: http://data.europa.eu/esco/skill/2a730bf7-1049-43c2-bf72-8f6a9643d99e
        # - lead a team: http://data.europa.eu/esco/skill/2eb3f5a7-96a2-4a0b-80df-cd6543b3552f

        skills_to_add = [
            "http://data.europa.eu/esco/skill/e8d538e1-5ef2-4e67-b52b-d360ecb30e07",  # strategic planning
            "http://data.europa.eu/esco/skill/2a730bf7-1049-43c2-bf72-8f6a9643d99e",  # financial management
            "http://data.europa.eu/esco/skill/2eb3f5a7-96a2-4a0b-80df-cd6543b3552f",  # lead a team
        ]

        profile_skills_data = [
            {"user_id": user_id, "skill_id": s, "score": 1.0, "source": "manual"}
            for s in skills_to_add
        ]
        print(f"Adding {len(skills_to_add)} skills to profile...")
        supabase.table("profile_skills").insert(profile_skills_data).execute()

        # 3. Wait a moment for async pg_cron or triggers to process the match recalc
        print("Waiting for match queue to process (5 seconds)...")
        time.sleep(5)

        # 4. Fetch the highest matched jobs for this user
        res = supabase.table("job_matches").select("job_id, score, skill_score, jobs(job_title)").eq("user_id", user_id).order("score", desc=True).limit(5).execute()

        print("\nTop Job Matches for Mock User:")
        for match in res.data:
            title = match['jobs']['job_title'] if match['jobs'] else "Unknown Job"
            print(f"- {title}: Overall Score: {match['score']:.3f}, Skill Score: {match['skill_score']:.3f}")
    finally:
        # Cleanup
        supabase.table("profiles").delete().eq("id", user_id).execute()
        print("Cleaned up mock user.")


if __name__ == "__main__":
    main()
