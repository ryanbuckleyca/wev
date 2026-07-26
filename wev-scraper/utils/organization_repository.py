"""Thin data-access layer for the organizations table.

Wraps Supabase client queries so OrganizationResolver can focus on
orchestration. Each method maps to one SQL operation — no orchestration,
no cache management, no logging beyond warning on unexpected DB errors.
"""

from __future__ import annotations

import logging
import re

from utils.organization_cache import (
    domains_match,
    evidence_domain_query_hosts,
    extract_domain,
)

logger = logging.getLogger(__name__)

_LIKE_SPECIAL = re.compile(r"[%_\\]")


def _escape_like(s: str) -> str:
    """Escape % and _ for ILIKE so they're treated literally.

    PostgREST passes ILIKE values through to PostgreSQL, where % and _
    are LIKE wildcards. Backslash is Postgres's default escape character.
    """
    return _LIKE_SPECIAL.sub(lambda m: "\\" + m.group(0), s)


class OrganizationRepository:
    def __init__(self, supabase_client) -> None:
        self._supabase = supabase_client

    def find_by_name(self, name: str) -> list[dict]:
        try:
            resp = (
                self._supabase.table("organizations")
                .select("id, name, location, website")
                .ilike("name", _escape_like(name.strip()))
                .execute()
            )
            return resp.data or []
        except Exception as exc:
            logger.warning("OrganizationRepository: find_by_name failed for %r: %s", name, exc)
            return []

    def find_by_domain(self, domain: str) -> list[dict]:
        """Find orgs whose website hostname matches ``domain`` (or a parent host).

        Callers should pass a normalized hostname (e.g. ``mindrift.ai``).
        ``careers.example.com`` also searches ``example.com`` so apex rows match.
        """
        cleaned = (domain or "").strip().lower()
        if not cleaned:
            return []
        try:
            by_id: dict[int, dict] = {}
            for host in evidence_domain_query_hosts(cleaned):
                resp = (
                    self._supabase.table("organizations")
                    .select("id, name, location, website")
                    .ilike("website", f"%{_escape_like(host)}%")
                    .execute()
                )
                for row in resp.data or []:
                    row_domain = extract_domain(row.get("website"))
                    if row_domain and domains_match(row_domain, cleaned):
                        by_id[row["id"]] = row
            return list(by_id.values())
        except Exception as exc:
            logger.warning(
                "OrganizationRepository: find_by_domain failed for %r: %s", domain, exc
            )
            return []

    def find_by_name_and_location(self, name: str, location: str | None = None) -> int | None:
        """Re-fetch an org ID by name + location after an insert conflict.

        Filters by location to match the unique index on (name, location) where
        both NULL and '' map to ''.
        """
        try:
            query = (
                self._supabase.table("organizations")
                .select("id")
                .ilike("name", _escape_like(name.strip()))
            )
            if location is not None and location.strip():
                query = query.ilike("location", _escape_like(location.strip()))
            else:
                # Both NULL and '' need to match because the unique identity index
                # treats them identically: coalesce(nullif(lower(btrim(location)), ''), '')
                query = query.or_("location.is.null,location.eq.")
            resp = query.execute()
            candidates = resp.data or []
            return candidates[0]["id"] if candidates else None
        except Exception as exc:
            logger.warning(
                "OrganizationRepository: find_by_name_and_location failed for %r: %s", name, exc
            )
            return None

    def slug_exists(self, slug: str) -> bool:
        try:
            resp = (
                self._supabase.table("organizations")
                .select("id")
                .eq("slug", slug)
                .execute()
            )
            return bool(resp.data)
        except Exception as exc:
            logger.warning(
                "OrganizationRepository: slug_exists failed for %r: %s", slug, exc
            )
            return False

    def find_existing_slugs(self, slugs: list[str]) -> set[str]:
        if not slugs:
            return set()
        try:
            resp = (
                self._supabase.table("organizations")
                .select("slug")
                .in_("slug", slugs)
                .execute()
            )
            return {row["slug"] for row in (resp.data or [])}
        except Exception as exc:
            logger.warning(
                "OrganizationRepository: find_existing_slugs failed: %s", exc
            )
            return set()

    def insert(self, row: dict) -> dict | None:
        resp = self._supabase.table("organizations").insert(row).execute()
        data = (resp.data or [{}])[0] if resp.data else {}
        if data.get("id"):
            return data
        logger.warning(
            "OrganizationRepository: insert returned no id for %r — response data=%r",
            row.get("name"),
            resp.data,
        )
        return None

    def update_org(
        self,
        org_id: int,
        **updates,
    ) -> None:
        """Write arbitrary fields back to an organization row.

        Used by backfill Phase 2 to write values + SSE fields.
        """
        if not updates:
            return
        try:
            resp = self._supabase.table("organizations").update(dict(updates)).eq("id", org_id).execute()
            if not resp.data:
                logger.warning(
                    "OrganizationRepository: update_org matched no rows for org_id=%s — updates=%s",
                    org_id, updates,
                )
        except Exception as exc:
            logger.error("OrganizationRepository: update_org failed for org_id=%s: %s", org_id, exc)
            raise

    def fetch_unrated_orgs(
        self,
        *,
        after_id: int = 0,
        limit: int = 50,
    ) -> list[dict]:
        """Fetch organizations with null sse_rating for Phase 2 backfill.

        Uses keyset pagination on id for consistency with Phase 1.

        Requirements: 5.5
        """
        try:
            resp = (
                self._supabase.table("organizations")
                .select("id, name, description, type, website, values")
                .is_("sse_rating", "null")
                .order("id")
                .gt("id", after_id)
                .limit(limit)
                .execute()
            )
            return resp.data or []
        except Exception as exc:
            logger.error(
                "OrganizationRepository: fetch_unrated_orgs failed: %s", exc,
            )
            raise
