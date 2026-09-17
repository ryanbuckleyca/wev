"""Near-duplicate job detection helpers (cross-board / retitle cases).

Used by the interactive review script. Conservative on purpose: same employer,
close post dates, and similar titles after light normalization. Description
similarity is a boost only — cross-posted ads often rewrite the body.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime
from difflib import SequenceMatcher
from typing import Iterable

# Tiny function words that don't help title identity.
_TITLE_STOP = frozenset(
    {
        "a",
        "an",
        "and",
        "at",
        "for",
        "in",
        "of",
        "on",
        "or",
        "the",
        "to",
        "with",
    }
)

_NON_ALNUM = re.compile(r"[^a-z0-9\s]+")
_WS = re.compile(r"\s+")

# Title noise that shouldn't block a match when the rest of the role aligns
# (e.g. "Environmental CoordinatorNew", "… (Volunteer)").
_TITLE_FLUFF = frozenset(
    {
        "new",
        "volunteer",
        "volunteering",
        "temporary",
        "contract",
        "urgent",
        "asap",
        "ft",
        "pt",
        "fulltime",
        "parttime",
        "full",
        "part",
        "time",
    }
)


def normalize_job_title_tokens(title: str | None) -> set[str]:
    """Token set for title comparison (order-independent, light stemming)."""
    raw = _NON_ALNUM.sub(" ", (title or "").lower())
    tokens: set[str] = set()
    for word in _WS.split(raw.strip()):
        if not word or word in _TITLE_STOP:
            continue
        # Glued scrape suffix: "CoordinatorNew" → "coordinator"
        if len(word) > 5 and word.endswith("new"):
            word = word[:-3]
        # Crude plural fold: directors → director, members → member.
        if len(word) > 3 and word.endswith("s") and not word.endswith("ss"):
            word = word[:-1]
        if word and word not in _TITLE_STOP:
            tokens.add(word)
    return tokens


def title_jaccard(a: str | None, b: str | None) -> float:
    left = normalize_job_title_tokens(a)
    right = normalize_job_title_tokens(b)
    if not left or not right:
        return 0.0
    return len(left & right) / len(left | right)


def title_sorted_ratio(a: str | None, b: str | None) -> float:
    """Sequence ratio on sorted unique tokens (order-independent string form)."""
    left = " ".join(sorted(normalize_job_title_tokens(a)))
    right = " ".join(sorted(normalize_job_title_tokens(b)))
    if not left or not right:
        return 0.0
    return SequenceMatcher(None, left, right).ratio()


def titles_same_role(a: str | None, b: str | None) -> bool:
    """True when titles look like the same role, not sibling roles under a campaign.

    Distinctive leftovers (fundraising vs sponsorship, drama vs dance) mean
    different jobs even when they share a long program prefix.
    """
    left = normalize_job_title_tokens(a)
    right = normalize_job_title_tokens(b)
    if not left or not right:
        return False
    only_left = left - right - _TITLE_FLUFF
    only_right = right - left - _TITLE_FLUFF
    if only_left or only_right:
        return False
    return title_jaccard(a, b) >= 0.7 or title_sorted_ratio(a, b) >= 0.85


def description_ratio(a: str | None, b: str | None, *, limit: int = 2500) -> float:
    left = _WS.sub(" ", (a or "").lower()).strip()[:limit]
    right = _WS.sub(" ", (b or "").lower()).strip()[:limit]
    if len(left) < 80 or len(right) < 80:
        return 0.0
    return SequenceMatcher(None, left, right).ratio()


def parse_job_date(value: str | None) -> date | None:
    """Best-effort parse of jobs.date_posted (usually YYYY-MM-DD)."""
    if not value or not str(value).strip():
        return None
    text = str(value).strip()
    head = text[:10]
    for fmt in ("%Y-%m-%d", "%Y/%m/%d"):
        try:
            return datetime.strptime(head, fmt).date()
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).date()
    except ValueError:
        return None


def dates_within(
    a: str | None,
    b: str | None,
    *,
    max_days: int = 21,
) -> bool:
    da = parse_job_date(a)
    db = parse_job_date(b)
    if da is None or db is None:
        # Missing dates: still allow match (cross-boards often omit one).
        return True
    return abs((da - db).days) <= max_days


def job_city_key(job: dict) -> str | None:
    """Best-effort city identity from municipality or location prefix."""
    muni = (job.get("municipality") or "").strip().lower()
    if muni:
        return muni
    loc = (job.get("location") or "").strip()
    if not loc:
        return None
    return loc.split(",")[0].strip().lower() or None


def cities_conflict(left: dict, right: dict) -> bool:
    """True when both sides have a city and they disagree."""
    a = job_city_key(left)
    b = job_city_key(right)
    return bool(a and b and a != b)


# Multi-office copies of the same req share nearly identical bodies.
_CITY_CONFLICT_DESC_MIN = 0.55


def is_near_duplicate_pair(
    left: dict,
    right: dict,
    *,
    max_days: int = 21,
) -> bool:
    """Return True when two job rows look like the same posting."""
    url_a = (left.get("listing_url") or "").strip().rstrip("/")
    url_b = (right.get("listing_url") or "").strip().rstrip("/")
    if not url_a or not url_b or url_a == url_b:
        return False  # same-URL handled elsewhere; need distinct listings

    if not dates_within(left.get("date_posted"), right.get("date_posted"), max_days=max_days):
        return False

    jaccard = title_jaccard(left.get("job_title"), right.get("job_title"))
    sorted_ratio = title_sorted_ratio(left.get("job_title"), right.get("job_title"))
    desc = description_ratio(left.get("description"), right.get("description"))
    same_role = titles_same_role(left.get("job_title"), right.get("job_title"))
    city_mismatch = cities_conflict(left, right)

    # Same role after ignoring fluff (Baby Ghosts board / Glencore CoordinatorNew).
    if same_role:
        # Different cities + dissimilar bodies → different reqs that share a title
        # (AECOM Geotechnical Engineer in Markham vs Quinte West). Identical /
        # near-identical bodies with different cities stay matches (multi-office).
        if city_mismatch and desc < _CITY_CONFLICT_DESC_MIN:
            return False
        return True

    # Retitle with overlapping body — still require no conflicting role tokens.
    only_left = normalize_job_title_tokens(left.get("job_title")) - normalize_job_title_tokens(
        right.get("job_title")
    ) - _TITLE_FLUFF
    only_right = normalize_job_title_tokens(right.get("job_title")) - normalize_job_title_tokens(
        left.get("job_title")
    ) - _TITLE_FLUFF
    if only_left or only_right:
        return False
    if city_mismatch and desc < _CITY_CONFLICT_DESC_MIN:
        return False
    if jaccard >= 0.5 and desc >= 0.55:
        return True
    if sorted_ratio >= 0.7 and desc >= 0.6:
        return True
    return False


_HTML_TAG = re.compile(r"<[^>]+>")
_BOARD_LISTING_ID = re.compile(r"(?:/job/[^/\s]*-|jobId=)(\d{4,})", re.IGNORECASE)

# Auto-skip at insert: near-identical body (Eco Canada multi-ID clones).
_CONFIDENT_DESC_MIN = 0.90
_THIN_DESC_CHARS = 80


def description_normalized(text: str | None) -> str:
    """Whitespace/HTML-normalized description for exact clone checks."""
    raw = _HTML_TAG.sub(" ", text or "")
    return _WS.sub(" ", raw.lower()).strip()


def description_is_thin(job_or_text: dict | str | None) -> bool:
    """True when description is missing or too short to compare meaningfully."""
    if isinstance(job_or_text, dict):
        text = job_or_text.get("description")
    else:
        text = job_or_text
    return len(description_normalized(text)) < _THIN_DESC_CHARS


def board_listing_id(url: str | None) -> str | None:
    """CharityVillage-style numeric listing id from canonical or search URLs."""
    if not url:
        return None
    match = _BOARD_LISTING_ID.search(url)
    return match.group(1) if match else None


_HOUR_SIG = re.compile(
    r"\b(\d{1,2})\s*h(?:eures?)?\b|\b(\d{1,2})\s*hours?\b",
    re.IGNORECASE,
)


def _hour_signatures(text: str | None) -> frozenset[str]:
    return frozenset(
        m.group(0).lower().replace(" ", "") for m in _HOUR_SIG.finditer(text or "")
    )


def material_role_conflict(left: dict, right: dict) -> bool:
    """True when bodies/fields disagree on hours or employment type."""
    ha = _hour_signatures(left.get("description"))
    hb = _hour_signatures(right.get("description"))
    if ha and hb and ha != hb:
        return True
    ea = (left.get("employment_type") or "").strip().lower()
    eb = (right.get("employment_type") or "").strip().lower()
    return bool(ea and eb and ea != eb)


def is_confident_duplicate_pair(
    left: dict,
    right: dict,
    *,
    max_days: int = 21,
) -> bool:
    """High-confidence clone safe to auto-skip on insert (stricter than review).

    Requires the same role title *and* a near-identical description. Title-only
    matches stay human-reviewed so two real openings with the same title at one
    employer are not blocked. Prefix-only matches are intentionally excluded —
    shared employer boilerplate is common across distinct reqs.

    Also treats same board listing id (different URL shapes) as clones when
    title/dates align. High body similarity still refuses pairs that disagree
    on hours or employment_type. Empty-vs-full description alone is not enough
    without a shared board listing id — that path stays human-reviewed.
    """
    url_a = (left.get("listing_url") or "").strip().rstrip("/")
    url_b = (right.get("listing_url") or "").strip().rstrip("/")
    if not url_a or not url_b or url_a == url_b:
        return False

    if not dates_within(left.get("date_posted"), right.get("date_posted"), max_days=max_days):
        return False

    if not titles_same_role(left.get("job_title"), right.get("job_title")):
        return False

    id_a, id_b = board_listing_id(url_a), board_listing_id(url_b)
    if id_a and id_b and id_a == id_b:
        return True

    if material_role_conflict(left, right):
        return False

    desc_a = left.get("description")
    desc_b = right.get("description")
    norm_a = description_normalized(desc_a)
    norm_b = description_normalized(desc_b)
    if norm_a and norm_a == norm_b and len(norm_a) >= _THIN_DESC_CHARS:
        return True
    return description_ratio(desc_a, desc_b) >= _CONFIDENT_DESC_MIN


def job_quality_score(job: dict) -> tuple:
    """Higher = better keeper. Prefers a real description over an empty shell."""
    values = job.get("values")
    has_values = isinstance(values, list) and len(values) > 0
    has_summary = bool((job.get("summary") or "").strip())
    desc = job.get("description") or ""
    has_description = bool(desc.strip())
    return (
        not description_is_thin(job),
        has_values,
        has_summary,
        has_description,
        len(desc),
        job.get("scraped_at") or "",
    )


class _UnionFind:
    def __init__(self, n: int) -> None:
        self.parent = list(range(n))

    def find(self, i: int) -> int:
        while self.parent[i] != i:
            self.parent[i] = self.parent[self.parent[i]]
            i = self.parent[i]
        return i

    def union(self, i: int, j: int) -> None:
        ri, rj = self.find(i), self.find(j)
        if ri != rj:
            self.parent[rj] = ri


@dataclass(frozen=True)
class NearDupeCluster:
    org_key: str
    org_label: str
    jobs: list[dict]


def _org_key(job: dict) -> str | None:
    oid = job.get("organization_id")
    if oid is not None:
        return f"id:{oid}"
    name = (job.get("organization") or "").strip().lower()
    if name:
        return f"name:{name}"
    return None


def cluster_near_duplicate_jobs(
    jobs: Iterable[dict],
    *,
    max_days: int = 21,
) -> list[NearDupeCluster]:
    """Group jobs into near-dupe clusters (size >= 2) within the same employer."""
    by_org: dict[str, list[dict]] = {}
    labels: dict[str, str] = {}
    for job in jobs:
        key = _org_key(job)
        if not key:
            continue
        by_org.setdefault(key, []).append(job)
        if key not in labels:
            labels[key] = (job.get("organization") or key).strip()

    clusters: list[NearDupeCluster] = []
    for key, rows in by_org.items():
        if len(rows) < 2:
            continue
        uf = _UnionFind(len(rows))
        for i in range(len(rows)):
            for j in range(i + 1, len(rows)):
                if is_near_duplicate_pair(rows[i], rows[j], max_days=max_days):
                    uf.union(i, j)

        buckets: dict[int, list[dict]] = {}
        for i, row in enumerate(rows):
            buckets.setdefault(uf.find(i), []).append(row)

        for group in buckets.values():
            if len(group) < 2:
                continue
            # Drop groups that are only same-URL noise (shouldn't happen, but safe).
            urls = {(j.get("listing_url") or "").strip().rstrip("/") for j in group}
            if len(urls) < 2:
                continue
            group = sorted(group, key=job_quality_score, reverse=True)
            clusters.append(
                NearDupeCluster(org_key=key, org_label=labels[key], jobs=group)
            )

    clusters.sort(key=lambda c: (-len(c.jobs), c.org_label.lower()))
    return clusters
