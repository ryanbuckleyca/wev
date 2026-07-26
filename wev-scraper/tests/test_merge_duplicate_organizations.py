"""Unit tests for merge_duplicate_organizations classification helpers."""

from scripts.merge_duplicate_organizations import (
    OrgRow,
    _domains_compatible,
    choose_survivor,
    classify_cluster,
    normalize_name,
)


def _row(**kwargs) -> OrgRow:
    defaults = {
        "id": 1,
        "name": "Test Org",
        "location": None,
        "website": None,
        "slug": None,
        "description": None,
        "job_count": 0,
        "domain": None,
    }
    defaults.update(kwargs)
    return OrgRow(**defaults)


class TestNormalizeName:
    def test_strips_accents_and_case(self):
        assert normalize_name("Centraide Montréal") == normalize_name("centraide montreal")


class TestDomainsCompatible:
    def test_conflicting_domains(self):
        ok, detail = _domains_compatible(["a.ca", "b.ca"])
        assert ok is False
        assert "conflicting" in detail

    def test_one_domain_and_missing(self):
        ok, detail = _domains_compatible(["a.ca", None])
        assert ok is True
        assert "a.ca" in detail

    def test_all_missing(self):
        ok, _ = _domains_compatible([None, None])
        assert ok is True


class TestChooseSurvivor:
    def test_prefers_website_then_jobs_then_lowest_id(self):
        rows = [
            _row(id=3, job_count=10, domain=None),
            _row(id=2, job_count=5, domain="a.ca"),
            _row(id=1, job_count=50, domain=None),
        ]
        assert choose_survivor(rows).id == 2


class TestClassifyCluster:
    def test_conflicting_domains_skip(self):
        rows = [
            _row(id=1, domain="a.ca", job_count=1),
            _row(id=2, domain="b.ca", job_count=2),
        ]
        decision = classify_cluster("abc autobody", rows)
        assert decision.bucket == "skip"
        assert decision.survivor_id == 2

    def test_short_name_review(self):
        rows = [
            _row(id=1, name="CFPA", domain="cfpa.ca", job_count=1),
            _row(id=2, name="CFPA", domain="cfpa.ca", job_count=0),
        ]
        decision = classify_cluster("cfpa", rows)
        assert decision.bucket == "review"

    def test_compatible_auto_merge(self):
        rows = [
            _row(id=107, name="Mindrift", domain="mindrift.ai", job_count=5),
            _row(id=461, name="Mindrift", domain="www.mindrift.ai", job_count=1),
        ]
        decision = classify_cluster("mindrift", rows)
        assert decision.bucket == "auto-merge"
        assert decision.survivor_id == 107
        assert decision.merge_ids == [461]

    def test_partial_domain_evidence_goes_to_review(self):
        rows = [
            _row(id=107, name="Mindrift", domain="mindrift.ai", job_count=5),
            _row(id=461, name="Mindrift", domain=None, job_count=1),
        ]
        decision = classify_cluster("mindrift", rows)
        assert decision.bucket == "review"
        assert "partial-evidence" in decision.reason

    def test_subdomain_equivalent_auto_merge(self):
        rows = [
            _row(id=1, domain="careers.hatch.com", job_count=1),
            _row(id=2, domain="hatch.com", job_count=5),
        ]
        decision = classify_cluster("hatch", rows)
        assert decision.bucket == "auto-merge"
        assert decision.survivor_id == 2

    def test_shared_hosts_only_go_to_review(self):
        rows = [
            _row(
                id=1,
                name="Acme",
                website="https://facebook.com/acme-qc",
                domain=None,
                job_count=1,
            ),
            _row(
                id=2,
                name="Acme",
                website="https://facebook.com/acme-on",
                domain=None,
                job_count=2,
            ),
        ]
        decision = classify_cluster("acme", rows)
        assert decision.bucket == "review"
        assert "shared/social/ATS" in decision.reason

    def test_name_only_without_domain_goes_to_review(self):
        rows = [
            _row(id=1, description="Food bank in Montreal", job_count=1),
            _row(id=2, description="Engineering consultancy", job_count=1),
        ]
        decision = classify_cluster("acme services", rows)
        assert decision.bucket == "review"
        assert "lack employer domain evidence" in decision.reason
