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


class TestDescribeDuplicateReviews:
    def test_lists_review_pairs_and_skips_auto_merge(self, monkeypatch):
        from scripts.merge_duplicate_organizations import (
            ClusterDecision,
            describe_duplicate_reviews,
        )

        jobs = {
            220: [
                {
                    "job_title": "Front of House Manager",
                    "municipality": "Toronto",
                    "province": "ON",
                    "listing_url": "https://workinculture.ca/jobs/massey-1",
                }
            ],
            1113: [
                {
                    "job_title": "Box Office Lead",
                    "municipality": "Toronto",
                    "province": "ON",
                    "listing_url": "https://workinculture.ca/jobs/massey-2",
                }
            ],
        }
        monkeypatch.setattr(
            "utils.catch_up.source_jobs_for_org",
            lambda org_id, **_k: jobs.get(org_id, []),
        )

        decisions = [
            ClusterDecision(
                bucket="auto-merge",
                normalized_name="ymca",
                reason="same website",
                survivor_id=1,
                merge_ids=[2],
                domains=["ymcaquebec.org"],
                rows=[{"id": 1, "name": "Les YMCA du Québec"}, {"id": 2, "name": "Les YMCA du Québec"}],
            ),
            ClusterDecision(
                bucket="review",
                normalized_name="massey hall",
                reason="near-match names (& / and)",
                survivor_id=220,
                merge_ids=[1113],
                domains=["mhrth.com"],
                rows=[
                    {"id": 220, "name": "Massey Hall & Roy Thomson Hall"},
                    {"id": 1113, "name": "Massey Hall and Roy Thomson Hall"},
                ],
            ),
        ]
        text = "\n".join(describe_duplicate_reviews(decisions))
        assert "Les YMCA" not in text
        assert "Massey Hall & Roy Thomson Hall / Massey Hall and Roy Thomson Hall" in text
        assert "y merges" in text
        assert "https://workinculture.ca/jobs/massey-1" in text
        assert "https://workinculture.ca/jobs/massey-2" in text


def test_parked_org_review_lines_hides_ignored(monkeypatch):
    from utils.catch_up import review_parked_organizations

    class _Resp:
        data = [
            {"id": 1, "name": "Private Residence", "assessment_skip_reason": "private_residence"},
            {"id": 2, "name": "Hidden", "assessment_skip_reason": "ignored"},
        ]

    class _Query:
        def select(self, *_a, **_k):
            return self

        @property
        def not_(self):
            return self

        def is_(self, *_a, **_k):
            return self

        def order(self, *_a, **_k):
            return self

        def execute(self):
            return _Resp()

    monkeypatch.setattr(
        "utils.catch_up.supabase.table",
        lambda _name: _Query(),
    )
    text = "\n".join(review_parked_organizations(interactive=False))
    assert "Private Residence — This name is a home" in text
    assert "Hidden" not in text
    assert "not a terminal" in text


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

    def test_and_and_ampersand_cluster_as_near_match(self):
        from scripts.merge_duplicate_organizations import (
            _cluster_organizations,
            classify_cluster,
            loose_name_key,
        )

        assert loose_name_key("Massey Hall & Roy Thomson Hall") == loose_name_key(
            "Massey Hall and Roy Thomson Hall"
        )
        orgs = [
            {
                "id": 220,
                "name": "The Corporation of Massey Hall & Roy Thomson Hall",
                "municipality": "Toronto",
                "province": "ON",
                "location": "Toronto",
                "website": "https://www.mhrth.com",
            },
            {
                "id": 1113,
                "name": "The Corporation of Massey Hall and Roy Thomson Hall",
                "municipality": "Toronto",
                "province": "ON",
                "location": "Toronto",
                "website": "https://roythomsonhall.mhrth.com",
            },
        ]
        clusters = _cluster_organizations(orgs)
        assert len(clusters) == 1
        label, rows, near = clusters[0]
        assert near is True
        assert {row["id"] for row in rows} == {220, 1113}
        decision = classify_cluster(label, [
            _row(id=row["id"], name=row["name"], website=row["website"], domain="mhrth.com", job_count=1)
            for row in rows
        ], near_match=True)
        assert decision.bucket == "review"

    def test_curly_and_straight_apostrophe_cluster_as_near_match(self):
        from scripts.merge_duplicate_organizations import _cluster_organizations, loose_name_key

        straight = "Office municipal d'habitation de Montréal"
        curly = "Office municipal d\u2019habitation de Montréal"
        assert loose_name_key(straight) == loose_name_key(curly)
        assert loose_name_key(straight) != ""
        orgs = [
            {
                "id": 21,
                "name": curly,
                "municipality": "Montreal",
                "province": "QC",
                "location": "Montreal, QC",
                "website": "https://www.omhm.qc.ca/",
            },
            {
                "id": 1844,
                "name": straight,
                "municipality": "Montreal",
                "province": "QC",
                "location": "Montreal, QC",
                "website": "https://www.omhm.qc.ca/",
            },
        ]
        clusters = _cluster_organizations(orgs)
        assert len(clusters) == 1
        assert clusters[0][2] is True

    def test_and_ampersand_with_different_websites_stay_separate(self):
        from scripts.merge_duplicate_organizations import _cluster_organizations

        orgs = [
            {
                "id": 1,
                "name": "Food and Water",
                "municipality": "Toronto",
                "province": "ON",
                "location": "Toronto",
                "website": "https://foodandwater.org",
            },
            {
                "id": 2,
                "name": "Food & Water",
                "municipality": "Toronto",
                "province": "ON",
                "location": "Toronto",
                "website": "https://other-food.example",
            },
        ]
        assert _cluster_organizations(orgs) == []

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

    def test_ats_career_portal_url_does_not_block_merge(self):
        """A record whose website is an Oracle/ATS careers portal must not count as a
        conflicting domain — it is the hiring platform, not the employer's own site.

        Before the fix these landed in the report-only ``skip`` bucket ("websites
        disagree") and were never prompted; now the only real domain is bgis.com, so
        the pair becomes a promptable ``review`` (acronym name keeps it out of
        auto-merge).
        """
        from utils.organization_cache import evidence_domain

        # The careers-portal URL carries no employer evidence.
        assert evidence_domain("https://fa-evcg-saasfaprod1.fa.ocs.oraclecloud.com") is None
        rows = [
            _row(id=1, name="BGIS", domain=evidence_domain("https://bgis.com"), job_count=5),
            _row(
                id=2,
                name="BGIS",
                domain=evidence_domain("https://fa-evcg-saasfaprod1.fa.ocs.oraclecloud.com"),
                job_count=1,
            ),
        ]
        decision = classify_cluster("bgis", rows)
        assert decision.bucket == "review"
        assert "conflicting domains" not in decision.reason
        assert decision.survivor_id == 1

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


def _auto_merge_decision():
    from scripts.merge_duplicate_organizations import ClusterDecision

    return ClusterDecision(
        bucket="auto-merge",
        normalized_name="dupe",
        reason="same domain",
        survivor_id=1,
        merge_ids=[2],
        domains=[None, None],
        rows=[
            {"id": 1, "name": "Survivor", "alternative_names": []},
            {"id": 2, "name": "Dupe Co", "alternative_names": []},
        ],
    )


def _org_table_mock(calls, *, update_raises=False):
    from unittest.mock import MagicMock

    orgs = MagicMock()
    orgs.select.return_value.eq.return_value.limit.return_value.execute.return_value = (
        MagicMock(data=[{"id": 1, "name": "Survivor", "alternative_names": []}])
    )

    def _update(payload):
        calls.append(("update_alts", payload))
        if update_raises:
            raise RuntimeError("alias write failed")
        m = MagicMock()
        m.eq.return_value.execute.return_value = MagicMock(data=[{"id": 1}])
        return m

    def _delete():
        calls.append(("delete",))
        m = MagicMock()
        m.eq.return_value.execute.return_value = MagicMock(data=[{"id": 2}])
        return m

    orgs.update.side_effect = _update
    orgs.delete.side_effect = _delete
    return orgs


def test_apply_auto_merges_persists_alts_before_delete(monkeypatch):
    from unittest.mock import MagicMock

    from scripts import merge_duplicate_organizations as mod

    calls: list[tuple] = []
    jobs = MagicMock()
    jobs.update.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": "j1"}]
    )
    orgs = _org_table_mock(calls)

    fake_sb = MagicMock()
    fake_sb.table.side_effect = lambda name: jobs if name == "jobs" else orgs
    monkeypatch.setattr(mod, "supabase", fake_sb)

    mod.apply_auto_merges([_auto_merge_decision()])

    kinds = [c[0] for c in calls]
    assert "update_alts" in kinds and "delete" in kinds
    # Alias promotion must happen before the destructive delete.
    assert kinds.index("update_alts") < kinds.index("delete")
    payload = next(c[1] for c in calls if c[0] == "update_alts")
    assert "Dupe Co" in payload["alternative_names"]


def test_apply_auto_merges_skips_delete_when_alias_write_fails(monkeypatch):
    from unittest.mock import MagicMock

    from scripts import merge_duplicate_organizations as mod

    calls: list[tuple] = []
    jobs = MagicMock()
    jobs.update.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": "j1"}]
    )
    orgs = _org_table_mock(calls, update_raises=True)

    fake_sb = MagicMock()
    fake_sb.table.side_effect = lambda name: jobs if name == "jobs" else orgs
    monkeypatch.setattr(mod, "supabase", fake_sb)

    mod.apply_auto_merges([_auto_merge_decision()])

    kinds = [c[0] for c in calls]
    # Alias write was attempted and failed → no delete may run (names preserved).
    assert "update_alts" in kinds
    assert "delete" not in kinds


def test_review_interactively_stops_on_quit(monkeypatch, capsys):
    from scripts.merge_duplicate_organizations import review_interactively

    monkeypatch.setattr(
        "utils.catch_up.source_jobs_for_org",
        lambda org_id, **_k: [
            {
                "job_title": f"Role at {org_id}",
                "municipality": "Toronto",
                "province": "ON",
                "listing_url": f"https://example.com/jobs/{org_id}",
            }
        ],
    )
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
    assert "https://example.com/jobs/3" in out
    assert "https://example.com/jobs/4" in out


def test_website_note_labels_by_platform_type():
    from scripts.merge_duplicate_organizations import _website_note

    assert "applicant-tracking" in _website_note("https://ecyq.fa.em2.oraclecloud.com/hcmUI/")
    assert "social media" in _website_note("https://facebook.com/acme-org")
    assert _website_note("https://www.dnv.com") == ""
    assert _website_note(None) == ""


def test_print_org_postings_includes_listing_url(monkeypatch, capsys):
    from scripts.merge_duplicate_organizations import _print_org_postings

    monkeypatch.setattr(
        "utils.catch_up.source_jobs_for_org",
        lambda _id, **_k: [
            {
                "job_title": "Senior Wind Energy Analyst",
                "municipality": "Calgary",
                "province": "AB",
                "listing_url": "https://ecoworks.eco.ca/jobs/781336028-senior-wind-energy-analyst",
            }
        ],
    )
    _print_org_postings(2573, 1)
    out = capsys.readouterr().out
    assert "Senior Wind Energy Analyst — Calgary, AB" in out
    assert "https://ecoworks.eco.ca/jobs/781336028-senior-wind-energy-analyst" in out
