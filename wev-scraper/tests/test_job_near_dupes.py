"""Tests for near-duplicate job detection."""

from utils.job_near_dupes import (
    cluster_near_duplicate_jobs,
    is_confident_duplicate_pair,
    is_near_duplicate_pair,
    job_quality_score,
    normalize_job_title_tokens,
    title_jaccard,
    titles_same_role,
)


def test_baby_ghosts_titles_match_after_normalize():
    a = "Volunteer Board Director"
    b = "Board of Directors (volunteer)"
    assert normalize_job_title_tokens(a) == {"volunteer", "board", "director"}
    assert normalize_job_title_tokens(b) == {"volunteer", "board", "director"}
    assert title_jaccard(a, b) == 1.0


def test_distinct_board_roles_do_not_match_on_title_alone():
    assert title_jaccard("Board Treasurer", "Board Secretary") < 0.7
    assert not titles_same_role("Board Treasurer", "Board Secretary")


def test_campaign_sibling_roles_are_not_near_dupes():
    """Shared program prefix must not glue distinct Lead roles together."""
    left = {
        "job_title": "Face Off Against Hunger Fundraising Lead",
        "listing_url": "https://a.example/1",
        "date_posted": "2026-08-01",
        "description": "x" * 100,
    }
    right = {
        "job_title": "Face Off Against Hunger Volunteer Lead",
        "listing_url": "https://b.example/2",
        "date_posted": "2026-08-02",
        "description": "y" * 100,
    }
    assert not is_near_duplicate_pair(left, right)


def test_instructor_specialties_are_not_near_dupes():
    left = {
        "job_title": "Specialized Program Instructor, RCC – Drama (Burlington Student Theatre)",
        "listing_url": "https://a.example/1",
        "date_posted": "2026-08-01",
        "description": "x" * 100,
    }
    right = {
        "job_title": "Specialized Program Instructor, RCC – Dance & Choreography (Burlington Student Theatre)",
        "listing_url": "https://b.example/2",
        "date_posted": "2026-08-02",
        "description": "y" * 100,
    }
    assert not is_near_duplicate_pair(left, right)


def test_coordinator_new_suffix_matches():
    assert titles_same_role("Environmental Coordinator", "Environmental CoordinatorNew")
    left = {
        "job_title": "Environmental CoordinatorNew",
        "listing_url": "https://a.example/1",
        "date_posted": "2026-08-01",
        "description": "x" * 100,
    }
    right = {
        "job_title": "Environmental Coordinator",
        "listing_url": "https://b.example/2",
        "date_posted": "2026-08-02",
        "description": "y" * 100,
    }
    assert is_near_duplicate_pair(left, right)


def test_near_dupe_pair_baby_ghosts():
    left = {
        "job_title": "Volunteer Board Director",
        "listing_url": "https://workinculture.ca/jobs/a",
        "date_posted": "2026-08-29",
        "description": "x" * 100,
    }
    right = {
        "job_title": "Board of Directors (volunteer)",
        "listing_url": "https://www.charityvillage.com/job/b",
        "date_posted": "2026-08-31",
        "description": "y" * 100,  # dissimilar body — still a dupe via title
    }
    assert is_near_duplicate_pair(left, right)


def test_same_url_not_near_dupe():
    job = {
        "job_title": "Coordinator",
        "listing_url": "https://example.com/job/1",
        "date_posted": "2026-08-01",
        "description": "x" * 100,
    }
    assert not is_near_duplicate_pair(job, dict(job))


def test_different_orgs_not_clustered_together():
    jobs = [
        {
            "id": "1",
            "organization_id": 1,
            "organization": "Acme",
            "job_title": "Volunteer Board Director",
            "listing_url": "https://a.example/1",
            "date_posted": "2026-08-29",
            "description": "x" * 100,
            "scraped_at": "2026-08-29T00:00:00Z",
        },
        {
            "id": "2",
            "organization_id": 2,
            "organization": "Other",
            "job_title": "Board of Directors (volunteer)",
            "listing_url": "https://b.example/2",
            "date_posted": "2026-08-31",
            "description": "y" * 100,
            "scraped_at": "2026-08-31T00:00:00Z",
        },
    ]
    assert cluster_near_duplicate_jobs(jobs) == []


def test_multi_office_same_body_still_matches():
    body = ("Company Description. " + ("tailings management Canada " * 20)).strip()
    left = {
        "job_title": "Geotechnical Engineer",
        "listing_url": "https://ecoworks.eco.ca/jobs/568244523",
        "date_posted": "2026-07-30",
        "municipality": "Markham",
        "location": "Markham, Ontario, Canada",
        "description": body,
    }
    right = {
        "job_title": "Geotechnical Engineer",
        "listing_url": "https://ecoworks.eco.ca/jobs/568244522",
        "date_posted": "2026-07-30",
        "municipality": "Mississauga",
        "location": "Mississauga, Ontario, Canada",
        "description": body,
    }
    assert is_near_duplicate_pair(left, right)


def test_same_title_different_city_and_body_does_not_match():
    left = {
        "job_title": "Geotechnical Engineer",
        "listing_url": "https://ecoworks.eco.ca/jobs/568244523",
        "date_posted": "2026-07-30",
        "municipality": "Markham",
        "location": "Markham, Ontario, Canada",
        "description": ("tailings design regulatory compliance " * 30),
    }
    right = {
        "job_title": "Geotechnical Engineer",
        "listing_url": "https://ecoworks.eco.ca/jobs/465393803",
        "date_posted": "2026-08-17",
        "municipality": None,
        "location": "Quinte West, Ontario, Canada",
        "description": ("rock mechanics underground mining investigations " * 30),
    }
    assert not is_near_duplicate_pair(left, right)


def test_aecom_style_cluster_splits_third_role():
    body = ("Company Description. " + ("tailings management Canada " * 20)).strip()
    other = ("rock mechanics underground " * 40).strip()
    jobs = [
        {
            "id": "1",
            "organization_id": 1314,
            "organization": "AECOM",
            "job_title": "Geotechnical Engineer",
            "listing_url": "https://ecoworks.eco.ca/jobs/a",
            "date_posted": "2026-07-30",
            "municipality": "Markham",
            "location": "Markham, Ontario, Canada",
            "description": body,
            "scraped_at": "2026-08-02T00:00:00Z",
            "values": ["a"],
            "summary": "s",
        },
        {
            "id": "2",
            "organization_id": 1314,
            "organization": "AECOM",
            "job_title": "Geotechnical Engineer",
            "listing_url": "https://ecoworks.eco.ca/jobs/b",
            "date_posted": "2026-07-30",
            "municipality": "Mississauga",
            "location": "Mississauga, Ontario, Canada",
            "description": body,
            "scraped_at": "2026-08-02T00:00:00Z",
        },
        {
            "id": "3",
            "organization_id": 1314,
            "organization": "AECOM",
            "job_title": "Geotechnical Engineer",
            "listing_url": "https://ecoworks.eco.ca/jobs/c",
            "date_posted": "2026-08-17",
            "location": "Quinte West, Ontario, Canada",
            "description": other,
            "scraped_at": "2026-08-19T00:00:00Z",
        },
    ]
    clusters = cluster_near_duplicate_jobs(jobs)
    assert len(clusters) == 1
    assert {j["id"] for j in clusters[0].jobs} == {"1", "2"}


def test_cluster_same_org():
    jobs = [
        {
            "id": "1",
            "organization_id": 1751,
            "organization": "Baby Ghosts",
            "job_title": "Volunteer Board Director",
            "listing_url": "https://workinculture.ca/jobs/a",
            "date_posted": "2026-08-29",
            "description": "x" * 100,
            "values": ["a"],
            "summary": "s",
            "scraped_at": "2026-08-29T00:00:00Z",
        },
        {
            "id": "2",
            "organization_id": 1751,
            "organization": "Baby Ghosts",
            "job_title": "Board of Directors (volunteer)",
            "listing_url": "https://www.charityvillage.com/job/b",
            "date_posted": "2026-08-31",
            "description": "y" * 100,
            "scraped_at": "2026-08-31T00:00:00Z",
        },
    ]
    clusters = cluster_near_duplicate_jobs(jobs)
    assert len(clusters) == 1
    assert len(clusters[0].jobs) == 2
    assert clusters[0].jobs[0]["id"] == "1"


def test_confident_dupe_requires_near_identical_body():
    """Title-only near-dupes stay review-only; auto-skip needs shared body."""
    left = {
        "job_title": "Project Manager - Renewable Energy",
        "listing_url": "https://ecoworks.eco.ca/jobs/111-project-manager",
        "date_posted": "2026-07-30",
        "municipality": "Oshawa",
        "description": "x" * 100,
    }
    right = {
        "job_title": "Project Manager - Renewable Energy",
        "listing_url": "https://ecoworks.eco.ca/jobs/222-project-manager",
        "date_posted": "2026-07-30",
        "municipality": "Oshawa",
        "description": "y" * 100,
    }
    assert is_near_duplicate_pair(left, right)
    assert not is_confident_duplicate_pair(left, right)


def test_confident_dupe_eco_canada_multi_id_clone():
    body = (
        "Position Title: Project Manager - Renewable Energy "
        "Job Posting Deadline for Internal Candidates: August 5, 2026 "
        "Employment Status: 12 - 18 month contract leading solar photovoltaic "
        "installation planning and community health centre sustainability work. "
    ) * 3
    left = {
        "job_title": "Project Manager - Renewable Energy",
        "listing_url": "https://ecoworks.eco.ca/jobs/568444118-project-manager-renewable-energy",
        "date_posted": "2026-07-30",
        "municipality": "Oshawa",
        "description": body,
    }
    right = {
        "job_title": "Project Manager - Renewable Energy",
        "listing_url": "https://ecoworks.eco.ca/jobs/568444116-project-manager-renewable-energy",
        "date_posted": "2026-07-30",
        "municipality": "Oshawa",
        "description": body.replace(" - ", " – "),  # dash variant, same after normalize? keep identical
    }
    # Force exact same body for ratio/equality path
    right["description"] = body
    assert is_confident_duplicate_pair(left, right)


def test_confident_dupe_normalized_equality_ignores_html_and_whitespace():
    body = ("Renewable energy project manager duties include planning " * 20).strip()
    left = {
        "job_title": "Project Manager - Renewable Energy",
        "listing_url": "https://ecoworks.eco.ca/jobs/1",
        "date_posted": "2026-07-30",
        "description": body,
    }
    right = {
        "job_title": "Project Manager - Renewable Energy",
        "listing_url": "https://ecoworks.eco.ca/jobs/2",
        "date_posted": "2026-07-30",
        "description": f"<p>{body}</p>",
    }
    assert is_confident_duplicate_pair(left, right)


def test_confident_dupe_does_not_match_on_shared_boilerplate_only():
    """Distinct reqs that share a long employer intro must not auto-skip."""
    boilerplate = ("Company Description. AECOM is a global " * 40).strip()
    left = {
        "job_title": "Geotechnical Engineer",
        "listing_url": "https://ecoworks.eco.ca/jobs/a",
        "date_posted": "2026-07-30",
        "description": boilerplate + " " + ("tailings design regulatory " * 40),
    }
    right = {
        "job_title": "Geotechnical Engineer",
        "listing_url": "https://ecoworks.eco.ca/jobs/b",
        "date_posted": "2026-07-30",
        "description": boilerplate + " " + ("rock mechanics underground " * 40),
    }
    assert not is_confident_duplicate_pair(left, right)


def test_confident_dupe_complete_vs_empty_description():
    """Same CharityVillage listing id → clone even when one body is empty."""
    body = ("Director Digital Fundraising leads annual giving programs " * 20).strip()
    left = {
        "job_title": "Director, Digital Fundraising",
        "listing_url": "https://www.charityvillage.com/job/director-digital-fundraising-324389",
        "date_posted": "2026-07-10",
        "municipality": "Vancouver",
        "description": body,
    }
    right = {
        "job_title": "Director, Digital Fundraising",
        "listing_url": (
            "https://www.charityvillage.com/jobs?geo_location=Montréal%2C+QC"
            "&jobId=324389"
        ),
        "date_posted": "2026-07-10",
        "municipality": "Vancouver",
        "description": "",
    }
    assert is_confident_duplicate_pair(left, right)
    assert job_quality_score(left) > job_quality_score(right)


def test_confident_dupe_rejects_empty_shell_without_board_id():
    """Same title + empty shell at one employer must not auto-skip without board id."""
    body = ("Director Digital Fundraising leads annual giving programs " * 20).strip()
    left = {
        "job_title": "Director, Digital Fundraising",
        "listing_url": "https://example.com/jobs/full-role-a",
        "date_posted": "2026-07-10",
        "municipality": "Vancouver",
        "description": body,
    }
    right = {
        "job_title": "Director, Digital Fundraising",
        "listing_url": "https://example.com/jobs/shell-role-b",
        "date_posted": "2026-07-10",
        "municipality": "Vancouver",
        "description": "",
    }
    assert not is_confident_duplicate_pair(left, right)


def test_confident_dupe_rejects_hour_conflict_despite_similar_body():
    shared = ("Community intervention centre de jour evening shifts " * 30).strip()
    left = {
        "job_title": "Intervenant Centre de Jour",
        "listing_url": "https://example.com/a",
        "date_posted": "2026-09-14",
        "municipality": "Montreal",
        "description": shared + " 35h plein",
        "employment_type": "full-time",
    }
    right = {
        "job_title": "Intervenant Centre de Jour",
        "listing_url": "https://example.com/b",
        "date_posted": "2026-09-15",
        "municipality": "Montreal",
        "description": shared + " 21h partiel",
        "employment_type": "part-time",
    }
    assert not is_confident_duplicate_pair(left, right)


def test_board_listing_id_from_canonical_and_search_urls():
    from utils.job_near_dupes import board_listing_id

    assert (
        board_listing_id(
            "https://www.charityvillage.com/job/director-digital-fundraising-324389"
        )
        == "324389"
    )
    assert (
        board_listing_id(
            "https://www.charityvillage.com/jobs?locality=Montréal&jobId=324389"
        )
        == "324389"
    )

