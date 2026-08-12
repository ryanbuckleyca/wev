from __future__ import annotations

import logging
import re
from dataclasses import dataclass

from utils.base_grounded_classifier import SSEClassificationError
from utils.organization_assessment import OrganizationAssessor
from utils.organization_cache import (
    OrganizationCache,
    canonical_location,
    domains_match,
    evidence_domain,
    extract_org_identity,
    make_cache_key,
)
from utils.organization_repository import OrganizationRepository, _escape_like
from utils.slug import generate_slug, generate_unique_slug, nfkd_to_ascii

logger = logging.getLogger(__name__)

_MAX_SLUG_ATTEMPTS = 10

# Conservative: domain/website agreement is required to auto-merge when
# multiple same-name candidates exist. Single compatible candidates still reuse.
MERGE_THRESHOLD = 100

_SCORE_DOMAIN = 100
_SCORE_NAME = 50
_SCORE_PROVINCE = 10
_SCORE_MUNICIPALITY = 5
_SCORE_DOMAIN_CONFLICT = -100


@dataclass
class JobContext:
    raw_name: str
    municipality: str | None = None
    province: str | None = None
    location: str | None = None
    website: str | None = None
    job_title: str = ""
    description: str = ""
    job_id: str | None = None


def create_resolver(supabase_client=None) -> OrganizationResolver:
    cache = OrganizationCache()

    assessor = None
    try:
        assessor = OrganizationAssessor()
    except SSEClassificationError as exc:
        logger.error(
            "OrganizationAssessor unavailable (%s) — resolver will use minimal fallback",
            exc,
        )

    if supabase_client is None:
        import utils.db as db_module
        supabase_client = db_module.supabase

    repo = OrganizationRepository(supabase_client)
    return OrganizationResolver(
        repo=repo, cache=cache, assessor=assessor,
    )


class OrganizationResolver:
    """Resolves a job to an organization via name + optional domain evidence.

    Single compatible name match is reused across locations. Multiple candidates
    are scored; only scores at/above MERGE_THRESHOLD auto-merge. Ambiguous
    multi-match below threshold does not create another org row.
    """

    def __init__(
        self,
        repo: OrganizationRepository,
        cache: OrganizationCache,
        assessor: OrganizationAssessor | None = None,
    ) -> None:
        self._repo = repo
        self._cache = cache
        self._assessor = assessor

    @staticmethod
    def _classify_conflict(exc: Exception) -> str | None:
        """Return 'slug', 'identity', or None for non-constraint errors."""
        exc_str = str(exc).lower()
        if "duplicate key" not in exc_str:
            return None
        if "slug_key" in exc_str or "(slug)" in exc_str:
            return "slug"
        return "identity"

    @staticmethod
    def _session_cache_key(raw_name: str, website: str | None = None) -> str:
        """Name-only key, or name|identity when website evidence is present.

        Uses extract_org_identity() to get a unique identifier from the website,
        which correctly handles marketplace subdomains and social media paths.
        This prevents merging unrelated orgs that share a platform while allowing
        proper matching when the identity is the same.
        """
        base = make_cache_key(raw_name)
        identity = extract_org_identity(website)
        if identity:
            return f"{base}|{identity}"
        return base

    def resolve(
        self,
        raw_name: str,
        municipality: str | None = None,
        province: str | None = None,
        location: str | None = None,
        website: str | None = None,
        job_title: str = "",
        description: str = "",
        job_id: str | None = None,
    ) -> int | None:
        if not raw_name or not raw_name.strip():
            return None

        ctx = JobContext(
            raw_name=raw_name.strip(),
            municipality=municipality,
            province=province,
            location=location,
            website=website,
            job_title=job_title,
            description=description,
            job_id=job_id,
        )

        try:
            return self._resolve_inner(ctx)
        except Exception as exc:
            logger.error(
                "OrganizationResolver: unexpected error for job_id=%s raw_name=%r: %s",
                ctx.job_id,
                ctx.raw_name,
                exc,
                exc_info=True,
            )
            return None

    def _resolve_inner(self, ctx: JobContext) -> int | None:
        cache_key = self._session_cache_key(ctx.raw_name, ctx.website)

        if self._cache.is_blocked(cache_key):
            return None

        cached_id = self._cache.get(cache_key)
        if cached_id is not None:
            return cached_id

        db_id, block_create = self._resolve_via_db(ctx, cache_key)
        if db_id is not None:
            return db_id
        if block_create:
            logger.info(
                "OrganizationResolver: ambiguous name match for raw_name=%r job_id=%s — not creating",
                ctx.raw_name,
                ctx.job_id,
            )
            self._cache.mark_blocked(cache_key)
            return None

        canonical_loc = canonical_location(ctx.municipality, ctx.province, ctx.location)

        if self._assessor is not None:
            llm_id = self._llm_resolve(ctx, cache_key, canonical_loc)
            if llm_id is not None:
                return llm_id
            # Assessor retry may mark this key blocked — do not fall through
            # to minimal create and undo the ambiguous decision.
            if self._cache.is_blocked(cache_key):
                return None

        return self._resolve_minimal(ctx, cache_key, canonical_loc)

    def _collect_candidates(self, ctx: JobContext) -> list[dict]:
        """Collect candidate organizations by name and website identity."""
        by_id: dict[int, dict] = {}
        for row in self._repo.find_by_name(ctx.raw_name):
            by_id[row["id"]] = row

        # Also search by website identity to find orgs with matching URLs
        identity = extract_org_identity(ctx.website)
        if identity:
            # For employer-owned domains, use the existing domain search
            # For shared platforms, search by the full identity string
            if "/" in identity or "." in identity.split("/")[0] if "/" in identity else True:
                # Search for websites that contain this identity
                # This catches both exact matches and variations
                try:
                    resp = (
                        self._repo._supabase.table("organizations")
                        .select("id, name, location, website")
                        .ilike("website", f"%{_escape_like(identity)}%")
                        .execute()
                    )
                    for row in resp.data or []:
                        # Verify the identity actually matches
                        row_identity = extract_org_identity(row.get("website"))
                        if row_identity and row_identity == identity:
                            by_id.setdefault(row["id"], row)
                except Exception as exc:
                    logger.warning(
                        "OrganizationResolver: identity search failed for %r: %s",
                        identity,
                        exc,
                    )

        return list(by_id.values())

    def _names_match(self, organization: dict, ctx: JobContext) -> bool:
        org_name = (organization.get("name") or "").strip()
        return make_cache_key(org_name) == make_cache_key(ctx.raw_name)

    @staticmethod
    def _location_token_match(needle: str, haystack: str) -> bool:
        """Whole-token match so province 'on' does not hit 'montreal'."""
        if not needle or not haystack:
            return False
        tokens = set(re.findall(r"[a-z0-9]+", haystack))
        return needle in tokens

    def _score_organization_match(self, organization: dict, ctx: JobContext) -> int:
        score = 0
        names_match = self._names_match(organization, ctx)
        if names_match:
            score += _SCORE_NAME

        # Identity evidence only counts when names also agree — prevents
        # facebook.com / shared-host merges across unrelated orgs.
        job_identity = extract_org_identity(ctx.website)
        org_identity = extract_org_identity(organization.get("website"))
        if names_match and job_identity and org_identity:
            if job_identity == org_identity:
                # Exact identity match (handles marketplace/social media properly)
                score += _SCORE_DOMAIN
            else:
                # Different identities - conflict
                score += _SCORE_DOMAIN_CONFLICT

        org_loc = nfkd_to_ascii(organization.get("location") or "").lower()
        if ctx.province:
            province = nfkd_to_ascii(ctx.province).strip().lower()
            if self._location_token_match(province, org_loc):
                score += _SCORE_PROVINCE
        if ctx.municipality:
            municipality = nfkd_to_ascii(ctx.municipality).strip().lower()
            if self._location_token_match(municipality, org_loc):
                score += _SCORE_MUNICIPALITY

        return score

    def _domains_conflict(self, organization: dict, ctx: JobContext) -> bool:
        """Check if org identities conflict (different orgs despite same name)."""
        job_identity = extract_org_identity(ctx.website)
        org_identity = extract_org_identity(organization.get("website"))
        return bool(
            job_identity and org_identity and job_identity != org_identity
        )

    def _should_allow_create_despite_candidates(
        self, ctx: JobContext, candidates: list[dict]
    ) -> bool:
        """True when candidates exist but none can be this employer.

        - Identity-only hits on differently named orgs → create.
        - Same-name orgs that all conflict on identity → create.
        - Same-name with missing/compatible identity evidence → still ambiguous.
        """
        name_matches = [c for c in candidates if self._names_match(c, ctx)]
        if not name_matches:
            return True

        job_identity = extract_org_identity(ctx.website)
        if not job_identity:
            return False

        return all(self._domains_conflict(c, ctx) for c in name_matches)

    def _resolve_via_db(self, ctx: JobContext, cache_key: str) -> tuple[int | None, bool]:
        """Return (org_id, block_create).

        block_create=True means candidates exist and identity is ambiguous —
        caller must not insert another organization row. Distinct orgs that
        share a lookalike name but conflict on domain evidence may still create.
        """
        candidates = self._collect_candidates(ctx)
        if not candidates:
            return None, False

        if len(candidates) == 1:
            only = candidates[0]
            if not self._names_match(only, ctx):
                # Domain-only hit on a differently named org — allow create.
                return None, False
            if self._domains_conflict(only, ctx):
                # Distinct company sharing a lookalike name — allow create.
                return None, False
            org_id = only["id"]
            self._cache.set(cache_key, org_id)
            return org_id, False

        scored = [
            (c, self._score_organization_match(c, ctx)) for c in candidates
        ]
        best, score = max(scored, key=lambda item: item[1])
        if score >= MERGE_THRESHOLD:
            org_id = best["id"]
            self._cache.set(cache_key, org_id)
            return org_id, False

        if self._should_allow_create_despite_candidates(ctx, candidates):
            return None, False

        # Ambiguous multi-match below threshold — do not create another row.
        return None, True

    def _llm_resolve(self, ctx: JobContext, cache_key: str, canonical_loc: str) -> int | None:
        row = self._assessor.assess_and_build_row(
            raw_name=ctx.raw_name,
            municipality=ctx.municipality,
            province=ctx.province,
            job_title=ctx.job_title,
            description=ctx.description,
            canonical_loc=canonical_loc,
            known_website=ctx.website,
        )
        if row is None:
            return None

        # Assessor may discover a website — retry DB match before inserting.
        # Use org identity for any website (marketplace/social included).
        assessed_website = row.get("website") or ctx.website
        if assessed_website and assessed_website != ctx.website:
            retry_ctx = JobContext(
                raw_name=ctx.raw_name,
                municipality=ctx.municipality,
                province=ctx.province,
                location=ctx.location,
                website=assessed_website,
                job_title=ctx.job_title,
                description=ctx.description,
                job_id=ctx.job_id,
            )
            retry_key = self._session_cache_key(retry_ctx.raw_name, retry_ctx.website)
            db_id, block_create = self._resolve_via_db(retry_ctx, retry_key)
            if db_id is not None:
                return db_id
            if block_create:
                self._cache.mark_blocked(retry_key)
                self._cache.mark_blocked(cache_key)
                return None

        slug_base = row["slug"] or generate_slug(row["name"])
        row["slug"] = self._find_available_slug(slug_base, ctx.job_id)
        if assessed_website and not row.get("website"):
            row["website"] = assessed_website

        return self._insert_or_resolve_conflict(row, cache_key, ctx.job_id)

    def _resolve_minimal(self, ctx: JobContext, cache_key: str, canonical_loc: str) -> int | None:
        logger.warning(
            "OrganizationResolver: using minimal fallback for raw_name=%r job_id=%s",
            ctx.raw_name,
            ctx.job_id,
        )
        return self._build_and_insert_org(
            canonical_name=ctx.raw_name,
            canonical_loc=canonical_loc,
            slug_base=generate_slug(ctx.raw_name),
            cache_key=cache_key,
            job_id=ctx.job_id,
            # Accept any website (marketplace/social included) for org identity.
            website=ctx.website,
        )

    def _build_and_insert_org(
        self,
        canonical_name: str,
        canonical_loc: str,
        slug_base: str,
        cache_key: str,
        job_id: str | None,
        website: str | None = None,
        description: str | None = None,
        org_type: str | None = None,
        values: str | None = None,
    ) -> int | None:
        slug = self._find_available_slug(slug_base, job_id)

        row = {
            "name": canonical_name,
            "slug": slug,
            "location": canonical_loc or None,
            "website": website,
            "description": description,
            "type": org_type,
            "values": values,
        }

        return self._insert_or_resolve_conflict(row, cache_key, job_id)

    def _find_available_slug(self, base: str, seed: str | None = None) -> str:
        return generate_unique_slug(
            max_attempts=_MAX_SLUG_ATTEMPTS,
            base=base,
            seed=seed,
            exists_fn=self._repo.slug_exists,
            batch_exists_fn=self._repo.find_existing_slugs,
        )

    def _insert_or_resolve_conflict(
        self, row: dict, cache_key: str, job_id: str | None = None,
    ) -> int | None:
        for _attempt in range(3):
            try:
                data = self._repo.insert(row)
                if data:
                    org_id = data["id"]
                    self._cache.set(cache_key, org_id)
                    return org_id
                return None
            except Exception as exc:
                kind = self._classify_conflict(exc)
                if kind is None:
                    logger.error(
                        "OrganizationResolver: non-constraint insert error for raw_name=%r job_id=%s: %s",
                        row.get("name"),
                        job_id,
                        exc,
                    )
                    return None
                if kind == "slug":
                    # TOCTOU race: slug was available at check time but taken
                    # before insert completed.  Retry with a fresh slug.
                    row["slug"] = self._find_available_slug(row.get("slug", ""), seed=job_id)
                    continue

                # Exact name+location duplicate-guard index conflict —
                # re-select the existing row. Do NOT classify here.
                existing_id = self._repo.find_by_name_and_location(
                    row.get("name", ""), row.get("location"),
                )
                if existing_id:
                    self._cache.set(cache_key, existing_id)
                    return existing_id

                logger.error(
                    "OrganizationResolver: identity conflict but re-select found nothing for %r job_id=%s",
                    row.get("name"),
                    job_id,
                )
                return None

        logger.error(
            "OrganizationResolver: exceeded slug conflict retry limit for job_id=%s",
            job_id,
        )
        return None
