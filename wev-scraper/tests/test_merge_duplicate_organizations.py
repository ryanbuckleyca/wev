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

    def test_hyphens_become_word_breaks(self):
        assert normalize_name("Community-University Television") == (
            "community university television"
        )


class TestLocationSuffixClustering:
    def test_is_location_suffix_variant_true(self):
        from scripts.merge_duplicate_organizations import (
            _location_tokens,
            is_location_suffix_variant,
        )

        loc = _location_tokens("Montreal", "QC", "Montreal, QC")
        assert is_location_suffix_variant(
            "Community University Television",
            set(),
            "Community University Television Montreal",
            loc,
        )

    def test_is_location_suffix_variant_rejects_unrelated_suffix(self):
        from scripts.merge_duplicate_organizations import is_location_suffix_variant

        assert not is_location_suffix_variant(
            "Community University Television",
            set(),
            "Community University Television Consulting",
            {"montreal"},
        )

    def test_locations_compatible_same_city(self):
        from scripts.merge_duplicate_organizations import locations_compatible

        assert locations_compatible("Montreal", "Montréal") is True
        assert locations_compatible("Montreal", "Toronto") is False

    def test_cluster_organizations_links_location_suffix_near_match(self):
        from scripts.merge_duplicate_organizations import _cluster_organizations

        orgs = [
            {
                "id": 1,
                "name": "Community University Television",
                "municipality": "Montreal",
                "province": "QC",
                "location": "Montreal, QC",
            },
            {
                "id": 2,
                "name": "Community University Television Montreal",
                "municipality": "Montreal",
                "province": "QC",
                "location": "Montreal, QC",
            },
            {
                "id": 3,
                "name": "Unrelated Food Bank",
                "municipality": "Toronto",
                "province": "ON",
                "location": "Toronto, ON",
            },
            {
                "id": 4,
                "name": "Unrelated Food Bank",
                "municipality": "Toronto",
                "province": "ON",
                "location": "Toronto, ON",
            },
        ]
        clusters = _cluster_organizations(orgs)
        # Exact twin + one near-match cluster.
        assert len(clusters) == 2
        near = [c for c in clusters if c[2]]
        exact = [c for c in clusters if not c[2]]
        assert len(near) == 1
        assert len(exact) == 1
        near_ids = {r["id"] for r in near[0][1]}
        assert near_ids == {1, 2}
        exact_ids = {r["id"] for r in exact[0][1]}
        assert exact_ids == {3, 4}

    def test_cluster_organizations_does_not_link_different_cities(self):
        from scripts.merge_duplicate_organizations import _cluster_organizations

        orgs = [
            {
                "id": 1,
                "name": "FoodShare",
                "municipality": "Toronto",
                "province": "ON",
                "location": "Toronto, ON",
            },
            {
                "id": 2,
                "name": "FoodShare Montreal",
                "municipality": "Montreal",
                "province": "QC",
                "location": "Montreal, QC",
            },
        ]
        assert _cluster_organizations(orgs) == []


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

    def test_sibling_subdomains_same_apex_compatible(self):
        ok, detail = _domains_compatible(["careers.acme.com", "jobs.acme.com"])
        assert ok is True
        assert "acme.com" in detail

    def test_gc_ca_siblings_not_compatible(self):
        ok, detail = _domains_compatible(["env.gc.ca", "canada.gc.ca"])
        assert ok is False
        assert "conflicting" in detail


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

    def test_row_dicts_preserve_alternative_names(self):
        rows = [
            _row(
                id=1,
                name="Mindrift",
                domain="mindrift.ai",
                job_count=5,
                alternative_names=["Mind Drift", "Mindrift Inc"],
            ),
            _row(
                id=2,
                name="Mindrift",
                domain="mindrift.ai",
                job_count=1,
                alternative_names=["Mindrift AI"],
            ),
        ]
        decision = classify_cluster("mindrift", rows)
        by_id = {r["id"]: r for r in decision.rows}
        assert by_id[1]["alternative_names"] == ["Mind Drift", "Mindrift Inc"]
        assert by_id[2]["alternative_names"] == ["Mindrift AI"]
        from utils.organization_cache import merge_alternative_names

        alts = merge_alternative_names(
            by_id[1]["name"],
            by_id[1]["alternative_names"],
            [by_id[2]],
        )
        assert "Mindrift AI" in alts

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


def test_print_report_needs_review_filters_buckets(capsys):
    from scripts.merge_duplicate_organizations import print_report

    decisions = [
        classify_cluster(
            "acme coop",
            [
                _row(id=1, name="Acme Co-op", domain="acme.coop", job_count=2),
                _row(id=2, name="Acme Coop", domain="acme.coop", job_count=1),
            ],
        ),
        classify_cluster(
            "short",
            [
                _row(id=3, name="AB", domain="ab.ca", job_count=1),
                _row(id=4, name="AB", domain="ab.ca", job_count=1),
            ],
        ),
    ]
    print_report(decisions, buckets=("review", "skip"))
    out = capsys.readouterr().out
    assert "REVIEW" in out
    assert "AUTO-MERGE" not in out
    assert "Showing" in out


def test_review_interactively_stops_on_quit(monkeypatch, capsys):
    from scripts.merge_duplicate_organizations import review_interactively

    decisions = [
        classify_cluster(
            "ab",
            [
                _row(id=3, name="AB", domain="ab.ca", job_count=1),
                _row(id=4, name="AB", domain="ab.ca", job_count=1),
            ],
        ),
        classify_cluster(
            "xy",
            [
                _row(id=5, name="XY", domain="xy.ca", job_count=1),
                _row(id=6, name="XY", domain="xy.ca", job_count=1),
            ],
        ),
    ]
    assert all(d.bucket == "review" for d in decisions)
    answers = iter(["q"])
    monkeypatch.setattr("builtins.input", lambda _prompt="": next(answers))
    review_interactively(decisions)
    out = capsys.readouterr().out
    assert "Stopped at 1/2" in out
