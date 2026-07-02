"""Thin data-access layer for the organizations table.

Wraps Supabase client queries so OrganizationResolver can focus on
orchestration. Each method maps to one SQL operation — no orchestration,
no cache management, no logging beyond warning on unexpected DB errors.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


class OrganizationRepository:
    def __init__(self, supabase_client) -> None:
        self._supabase = supabase_client

    def find_by_name(self, name: str) -> list[dict]:
        try:
            resp = (
                self._supabase.table("organizations")
                .select("id, name, location")
                .ilike("name", name)
                .execute()
            )
            return resp.data or []
        except Exception as exc:
            logger.warning("OrganizationRepository: find_by_name failed for %r: %s", name, exc)
            return []

    def find_by_exact_name(self, name: str) -> int | None:
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
                "OrganizationRepository: find_by_exact_name failed for %r: %s", name, exc
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
        try:
            resp = self._supabase.table("organizations").insert(row).execute()
            data = (resp.data or [{}])[0] if resp.data else {}
            return data if data.get("id") else None
        except Exception:
            raise
