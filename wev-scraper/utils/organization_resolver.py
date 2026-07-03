from __future__ import annotations

import logging
from dataclasses import dataclass

from utils.organization_cache import OrganizationCache, canonical_location, make_cache_key
from utils.organization_identifier import OrganizationIdentifier
from utils.organization_repository import OrganizationRepository
from utils.slug import generate_slug, generate_unique_slug

logger = logging.getLogger(__name__)

_MAX_SLUG_ATTEMPTS = 10


@dataclass
class JobContext:
    raw_name: str
    municipality: str | None = None
    province: str | None = None
    location: str | None = None
    job_title: str = ""
    description: str = ""
    job_id: str | None = None


def _location_is_compatible(
    candidate_location: str | None,
    municipality: str | None,
    province: str | None,
    location: str | None = None,
) -> bool:
    job_canonical = canonical_location(municipality, province, location).strip().lower()
    cand = (candidate_location or "").strip().lower()

    if not job_canonical or not cand:
        return False

    cand_words = set(cand.split())
    job_words = set(job_canonical.split())
    return bool(cand_words & job_words)


def create_resolver(supabase_client=None) -> OrganizationResolver:
    cache = OrganizationCache()

    identifier = None
    try:
        identifier = OrganizationIdentifier()
    except Exception as exc:
        logger.error(
            "OrganizationIdentifier unavailable (%s) — resolver will use minimal fallback",
            exc,
        )

    if supabase_client is None:
        import utils.db as db_module
        supabase_client = db_module.supabase

    repo = OrganizationRepository(supabase_client)
    return OrganizationResolver(repo=repo, cache=cache, identifier=identifier)


class OrganizationResolver:
    def __init__(
        self,
        repo: OrganizationRepository,
        cache: OrganizationCache,
        identifier: OrganizationIdentifier | None,
    ) -> None:
        self._repo = repo
        self._cache = cache
        self._identifier = identifier

    @staticmethod
    def _is_identity_conflict(exc: Exception) -> bool:
        # Only match Postgres unique/PK violations, not CHECK constraints
        return "duplicate key" in str(exc).lower()

    def resolve(
        self,
        raw_name: str,
        municipality: str | None = None,
        province: str | None = None,
        location: str | None = None,
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
        cache_key = make_cache_key(ctx.raw_name, ctx.municipality, ctx.province, ctx.location)

        cached_id = self._cache.get(cache_key)
        if cached_id is not None:
            return cached_id

        db_id = self._resolve_via_db(ctx, cache_key)
        if db_id is not None:
            return db_id

        canonical_loc = canonical_location(ctx.municipality, ctx.province, ctx.location)

        if self._identifier is not None:
            llm_id = self._llm_resolve(ctx, cache_key, canonical_loc)
            if llm_id is not None:
                return llm_id

        return self._resolve_minimal(ctx, cache_key, canonical_loc)

    def _resolve_via_db(self, ctx: JobContext, cache_key: str) -> int | None:
        candidates = self._repo.find_by_name(ctx.raw_name)
        if not candidates:
            return None

        compatible = [
            c for c in candidates
            if _location_is_compatible(c.get("location"), ctx.municipality, ctx.province, ctx.location)
        ]

        if len(compatible) != 1:
            return None

        org_id = compatible[0]["id"]
        self._cache.set(cache_key, org_id)
        return org_id

    def _llm_resolve(self, ctx: JobContext, cache_key: str, canonical_loc: str) -> int | None:
        result = self._identifier.identify(
            ctx.raw_name, ctx.municipality, ctx.province, ctx.job_title, ctx.description,
        )
        if result is None:
            return None

        canonical_name = result["canonical_name"]
        suggested_slug = result.get("slug") or ""
        slug_base = suggested_slug if suggested_slug else generate_slug(canonical_name)
        slug = self._find_available_slug(slug_base, ctx.job_id)

        row = {
            "name": canonical_name,
            "slug": slug,
            "location": canonical_loc or None,
            "website": result.get("website"),
            "description": result.get("description"),
            "type": result.get("type"),
        }

        return self._insert_or_resolve_conflict(row, cache_key, ctx.job_id)

    def _resolve_minimal(self, ctx: JobContext, cache_key: str, canonical_loc: str) -> int | None:
        slug = self._find_available_slug(generate_slug(ctx.raw_name), ctx.job_id)

        row = {
            "name": ctx.raw_name,
            "slug": slug,
            "location": canonical_loc or None,
        }

        logger.warning(
            "OrganizationResolver: using minimal fallback for raw_name=%r job_id=%s",
            ctx.raw_name,
            ctx.job_id,
        )
        return self._insert_or_resolve_conflict(row, cache_key, ctx.job_id)

    def _find_available_slug(self, base: str, seed: str | None = None) -> str:
        return generate_unique_slug(
            name="",
            max_attempts=_MAX_SLUG_ATTEMPTS,
            base=base,
            seed=seed,
            exists_fn=self._repo.slug_exists,
            batch_exists_fn=self._repo.find_existing_slugs,
        )

    def _insert_or_resolve_conflict(
        self, row: dict, cache_key: str, job_id: str | None = None,
    ) -> int | None:
        try:
            data = self._repo.insert(row)
            if data:
                org_id = data["id"]
                self._cache.set(cache_key, org_id)
                return org_id
            return None
        except Exception as exc:
            if not self._is_identity_conflict(exc):
                logger.error(
                    "OrganizationResolver: non-constraint insert error for raw_name=%r job_id=%s: %s",
                    row.get("name"),
                    job_id,
                    exc,
                )
                return None

            existing_id = self._repo.find_by_name_and_location(row.get("name", ""), row.get("location"))
            if existing_id:
                self._cache.set(cache_key, existing_id)
                return existing_id

            logger.error(
                "OrganizationResolver: insert conflict but re-select found nothing for %r job_id=%s",
                row.get("name"),
                job_id,
            )
            return None
