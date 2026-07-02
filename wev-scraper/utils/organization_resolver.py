"""Organization resolution pipeline.

For each scraped job, OrganizationResolver looks up or creates the matching
organization record and returns its ID. Resolution order:

  1. Cache lookup (normalized key).
  2. DB candidate lookup — case-insensitive name match, location disambiguation.
  3. LLM identification via OrganizationIdentifier (if available).
  4. INSERT new org row; on normalized identity conflict, re-select and reuse.
  5. Minimal record fallback using raw name + canonicalized job location.
  6. On unexpected exception, log ERROR and return None.

Never raises. Never blocks job insertion.

Requirements: 2.1–2.12
"""

from __future__ import annotations

import logging

from utils.organization_cache import OrganizationCache, make_cache_key
from utils.organization_identifier import OrganizationIdentifier
from utils.slug import generate_unique_slug

logger = logging.getLogger(__name__)


def _canonical_location(
    municipality: str | None,
    province: str | None,
    location: str | None,
) -> str:
    """Derive the canonical location string from available job location evidence.

    Priority: municipality + province > municipality > province > raw location > ''.
    This is the authoritative canonical location used for cache keys, stored
    organization.location, matching, and uniqueness checks.
    """
    if municipality and province:
        return f"{municipality} {province}"
    if municipality:
        return municipality
    if province:
        return province
    if location:
        return location
    return ""


def _location_is_compatible(
    candidate_location: str | None,
    municipality: str | None,
    province: str | None,
    location: str | None,
) -> bool:
    """Return True when a candidate org's stored location is compatible with the job's evidence.

    Compatibility rules:
    - If either side has no location evidence, we cannot confirm compatibility → False.
    - If the candidate's location (lowercased) contains the municipality or province → True.
    - Otherwise → False (conflict / distinct location).
    """
    job_canonical = _canonical_location(municipality, province, location).strip().lower()
    cand = (candidate_location or "").strip().lower()

    if not job_canonical or not cand:
        return False

    # Simple substring check: both sides must share some location string
    return cand in job_canonical or job_canonical in cand


class OrganizationResolver:
    """Resolves or creates organization records for scraped jobs.

    Inject dependencies explicitly for testability — no module-level singletons.

    Requirements: 2.1
    """

    def __init__(
        self,
        supabase_client,
        cache: OrganizationCache,
        identifier: OrganizationIdentifier | None,
    ) -> None:
        self._supabase = supabase_client
        self._cache = cache
        self._identifier = identifier  # May be None if provider init failed

    # ── Public API ────────────────────────────────────────────────────────────

    def resolve(
        self,
        raw_name: str,
        municipality: str | None,
        province: str | None,
        job_title: str = "",
        description: str = "",
        job_id: str | None = None,
    ) -> int | None:
        """Return the organization_id for this job or None on complete failure.

        Requirements: 2.2–2.12
        """
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

    # ── Resolution pipeline ───────────────────────────────────────────────────

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

        # Step 1: Cache lookup
        cached_id = self._cache.get(cache_key)
        if cached_id is not None:
            return cached_id

        # Step 2: DB candidate lookup
        db_id = self._db_lookup(raw_name, municipality, province, cache_key)
        if db_id is not None:
            return db_id

        # Step 3 + 4: LLM identification + INSERT
        if self._identifier is not None:
            llm_id = self._llm_resolve(
                raw_name, municipality, province, job_title, description,
                cache_key, job_id,
            )
            if llm_id is not None:
                return llm_id

        # Step 5: Minimal fallback
        return self._minimal_insert(raw_name, municipality, province, cache_key, job_id)

    def _db_lookup(
        self,
        raw_name: str,
        municipality: str | None,
        province: str | None,
        cache_key: str,
    ) -> int | None:
        """Query DB for a case-insensitive name match, returning ID only when unambiguous.

        Returns None when zero candidates are found, when location evidence is
        insufficient to disambiguate, or when more than one candidate remains
        plausible — all of these fall through to the LLM step.

        Requirements: 2.3
        """
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

        # Filter to candidates whose location is compatible with the job's evidence
        compatible = [
            c for c in candidates
            if _location_is_compatible(c.get("location"), municipality, province, None)
        ]

        if len(compatible) == 1:
            org_id = compatible[0]["id"]
            self._cache.set(cache_key, org_id)
            return org_id

        # Ambiguous (0 compatible with non-empty evidence, or >1) → fall to LLM
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
        """Call LLM identifier and INSERT the new org row.

        On normalized identity conflict (race / re-run), re-selects the existing
        org and returns its ID instead of treating the job as unresolved.

        Requirements: 2.4–2.8
        """
        result = self._identifier.identify(raw_name, municipality, province, job_title, description)
        if result is None:
            return None  # Fall through to minimal fallback

        canonical_name = result["canonical_name"]
        canonical_loc = _canonical_location(municipality, province, None)

        def slug_exists(s: str) -> bool:
            r = self._supabase.table("organizations").select("id").eq("slug", s).execute()
            return bool(r.data)

        # Use LLM-suggested slug as base if it looks reasonable, otherwise derive from name
        suggested_slug = result.get("slug") or ""
        slug_base = suggested_slug if suggested_slug else canonical_name
        slug = generate_unique_slug(slug_base, slug_exists)

        row = {
            "name": canonical_name,
            "slug": slug,
            "location": canonical_loc or None,
            "website": result.get("website"),
            "description": result.get("description"),
            "type": result.get("type"),
        }

        org_id = self._insert_or_reuse(row, cache_key, job_id)
        return org_id

    def _minimal_insert(
        self,
        raw_name: str,
        municipality: str | None,
        province: str | None,
        cache_key: str,
        job_id: str | None,
    ) -> int | None:
        """Insert a minimal org record using the raw name and canonicalized location.

        This is the last-resort fallback when LLM is unavailable or returns None.
        Uses generate_unique_slug to avoid constraint races.

        Requirements: 2.7
        """
        canonical_loc = _canonical_location(municipality, province, None)

        def slug_exists(s: str) -> bool:
            r = self._supabase.table("organizations").select("id").eq("slug", s).execute()
            return bool(r.data)

        slug = generate_unique_slug(raw_name, slug_exists)

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

    # ── DB helpers ────────────────────────────────────────────────────────────

    def _insert_or_reuse(
        self,
        row: dict,
        cache_key: str,
        job_id: str | None,
    ) -> int | None:
        """INSERT the org row; on normalized identity conflict, re-select and reuse.

        Requirements: 2.8
        """
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

            # Re-select the conflicting org using normalized identity rules
            existing_id = self._reselect_by_identity(row.get("name", ""), row.get("location"))
            if existing_id:
                self._cache.set(cache_key, existing_id)
                return existing_id

            logger.error(
                "OrganizationResolver: insert conflict but re-select found nothing for %r job_id=%s",
                row.get("name"),
                job_id,
            )
            return None

    def _reselect_by_identity(
        self, name: str, location: str | None
    ) -> int | None:
        """Re-query an org using the same normalized identity rules as the DB unique index.

        Requirements: 2.8
        """
        try:
            # Match on lower(btrim(name)) — use ilike with exact name
            resp = (
                self._supabase.table("organizations")
                .select("id")
                .ilike("name", name.strip())
                .execute()
            )
            candidates = resp.data or []
            if not candidates:
                return None

            # Filter by location match (or no-location match)
            canonical_loc = (location or "").strip().lower()
            for c in candidates:
                cand_loc = (c.get("location") or "").strip().lower()
                # Match when both are empty, or when they share content
                if (not canonical_loc and not cand_loc) or (
                    canonical_loc and cand_loc and (
                        canonical_loc in cand_loc or cand_loc in canonical_loc
                    )
                ):
                    return c["id"]

            # If no location match found, return the first candidate (name-only match)
            return candidates[0]["id"]
        except Exception as exc:
            logger.warning(
                "OrganizationResolver: re-select failed for %r: %s", name, exc
            )
            return None
