from __future__ import annotations

import logging

from utils.organization_cache import OrganizationCache, _canonical_location, make_cache_key
from utils.organization_identifier import OrganizationIdentifier
from utils.slug import generate_unique_slug

logger = logging.getLogger(__name__)


def _location_is_compatible(
    candidate_location: str | None,
    municipality: str | None,
    province: str | None,
    location: str | None,
) -> bool:
    job_canonical = _canonical_location(municipality, province, location).strip().lower()
    cand = (candidate_location or "").strip().lower()

    if not job_canonical or not cand:
        return False

    return cand in job_canonical or job_canonical in cand


def build_resolver() -> OrganizationResolver:
    cache = OrganizationCache()

    identifier = None
    try:
        identifier = OrganizationIdentifier()
    except Exception as exc:
        logger.warning(
            "OrganizationIdentifier unavailable (%s) — resolver will use minimal fallback",
            exc,
        )

    import utils.db as db_module
    return OrganizationResolver(
        supabase_client=db_module.supabase,
        cache=cache,
        identifier=identifier,
    )


class OrganizationResolver:
    def __init__(
        self,
        supabase_client,
        cache: OrganizationCache,
        identifier: OrganizationIdentifier | None,
    ) -> None:
        self._supabase = supabase_client
        self._cache = cache
        self._identifier = identifier

    def resolve(
        self,
        raw_name: str,
        municipality: str | None,
        province: str | None,
        job_title: str = "",
        description: str = "",
        job_id: str | None = None,
    ) -> int | None:
        if not raw_name or not raw_name.strip():
            return None

        try:
            return self._resolve_inner(
                raw_name.strip(), municipality, province, job_title, description, job_id
            )
        except Exception as exc:
            logger.error(
                "OrganizationResolver: unexpected error for job_id=%s raw_name=%r: %s",
                job_id,
                raw_name,
                exc,
                exc_info=True,
            )
            return None

    def _resolve_inner(
        self,
        raw_name: str,
        municipality: str | None,
        province: str | None,
        job_title: str,
        description: str,
        job_id: str | None,
    ) -> int | None:
        cache_key = make_cache_key(raw_name, municipality, province, None)

        cached_id = self._cache.get(cache_key)
        if cached_id is not None:
            return cached_id

        db_id = self._db_lookup(raw_name, municipality, province, cache_key)
        if db_id is not None:
            return db_id

        if self._identifier is not None:
            llm_id = self._llm_resolve(
                raw_name, municipality, province, job_title, description,
                cache_key, job_id,
            )
            if llm_id is not None:
                return llm_id

        return self._minimal_insert(raw_name, municipality, province, cache_key, job_id)

    def _db_lookup(
        self,
        raw_name: str,
        municipality: str | None,
        province: str | None,
        cache_key: str,
    ) -> int | None:
        try:
            resp = (
                self._supabase.table("organizations")
                .select("id, name, location")
                .ilike("name", raw_name)
                .execute()
            )
            candidates = resp.data or []
        except Exception as exc:
            logger.warning("OrganizationResolver: DB lookup failed for %r: %s", raw_name, exc)
            return None

        if not candidates:
            return None

        compatible = [
            c for c in candidates
            if _location_is_compatible(c.get("location"), municipality, province, None)
        ]

        if len(compatible) == 1:
            org_id = compatible[0]["id"]
            self._cache.set(cache_key, org_id)
            return org_id

        return None

    def _llm_resolve(
        self,
        raw_name: str,
        municipality: str | None,
        province: str | None,
        job_title: str,
        description: str,
        cache_key: str,
        job_id: str | None,
    ) -> int | None:
        result = self._identifier.identify(raw_name, municipality, province, job_title, description)
        if result is None:
            return None

        canonical_name = result["canonical_name"]
        canonical_loc = _canonical_location(municipality, province, None)

        suggested_slug = result.get("slug") or ""
        slug_base = suggested_slug if suggested_slug else canonical_name
        slug = generate_unique_slug(slug_base, self._slug_exists)

        row = {
            "name": canonical_name,
            "slug": slug,
            "location": canonical_loc or None,
            "website": result.get("website"),
            "description": result.get("description"),
            "type": result.get("type"),
        }

        return self._insert_or_reuse(row, cache_key, job_id)

    def _minimal_insert(
        self,
        raw_name: str,
        municipality: str | None,
        province: str | None,
        cache_key: str,
        job_id: str | None,
    ) -> int | None:
        canonical_loc = _canonical_location(municipality, province, None)
        slug = generate_unique_slug(raw_name, self._slug_exists)

        row = {
            "name": raw_name,
            "slug": slug,
            "location": canonical_loc or None,
        }

        logger.warning(
            "OrganizationResolver: using minimal fallback for raw_name=%r job_id=%s",
            raw_name,
            job_id,
        )
        return self._insert_or_reuse(row, cache_key, job_id)

    def _slug_exists(self, slug: str) -> bool:
        r = self._supabase.table("organizations").select("id").eq("slug", slug).execute()
        return bool(r.data)

    def _insert_or_reuse(
        self,
        row: dict,
        cache_key: str,
        job_id: str | None,
    ) -> int | None:
        try:
            resp = self._supabase.table("organizations").insert(row).execute()
            data = (resp.data or [{}])[0] if resp.data else {}
            org_id = data.get("id")
            if org_id:
                self._cache.set(cache_key, org_id)
            return org_id
        except Exception as exc:
            err_str = str(exc).lower()
            is_identity_conflict = (
                "unique" in err_str
                or "duplicate" in err_str
                or "constraint" in err_str
            )
            if not is_identity_conflict:
                logger.error(
                    "OrganizationResolver: non-constraint insert error for raw_name=%r job_id=%s: %s",
                    row.get("name"),
                    job_id,
                    exc,
                )
                return None

            existing_id = self._reselect_by_identity(row.get("name", ""))
            if existing_id:
                self._cache.set(cache_key, existing_id)
                return existing_id

            logger.error(
                "OrganizationResolver: insert conflict but re-select found nothing for %r job_id=%s",
                row.get("name"),
                job_id,
            )
            return None

    def _reselect_by_identity(self, name: str) -> int | None:
        try:
            resp = (
                self._supabase.table("organizations")
                .select("id")
                .ilike("name", name.strip())
                .execute()
            )
            candidates = resp.data or []
            return candidates[0]["id"] if candidates else None
        except Exception as exc:
            logger.warning(
                "OrganizationResolver: re-select failed for %r: %s", name, exc
            )
            return None
