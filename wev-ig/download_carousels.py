"""Download full-resolution Instagram images for posts saved in Raindrop.io.

Reads every bookmark in a Raindrop collection (Unsorted by default), keeps the
Instagram post links, and downloads the first slide of each post (or every
slide with --all-slides) through gallery-dl using the Instagram session from
Brave. Results are recorded in downloads/manifest.csv; reruns skip posts that
already downloaded.

Usage (from wev-ig-carousel/, with .venv-siloe active):
  python download_carousels.py                 # first slide of each new post
  python download_carousels.py --all-slides    # every slide
  python download_carousels.py --dry-run       # list posts, download nothing
  python download_carousels.py --limit 3 --collection -1 --force
"""

from __future__ import annotations

import argparse
import csv
import os
import re
import shutil
import sqlite3
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path

import requests
from dotenv import load_dotenv
from PIL import Image

HERE = Path(__file__).resolve().parent
RAINDROP_API = "https://api.raindrop.io/rest/v1/raindrops"
RAINDROP_PER_PAGE = 50
INSTAGRAM_POST_RE = re.compile(r"instagram\.com/(?:[\w.]+/)?(p|reel|tv)/([\w-]+)", re.I)
MANIFEST_FIELDS = [
    "raindrop_id", "saved_at", "title", "url", "shortcode",
    "status", "files", "width", "height", "error",
]
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".heic"}


@dataclass
class Post:
    raindrop_id: int
    saved_at: str
    title: str
    url: str
    kind: str
    shortcode: str


# --- Raindrop ---------------------------------------------------------------

def fetch_bookmarks(token: str, collection_id: int) -> list[dict]:
    """Every bookmark in the collection, newest first, across all pages."""
    items: list[dict] = []
    page = 0
    while True:
        response = requests.get(
            f"{RAINDROP_API}/{collection_id}",
            headers={"Authorization": f"Bearer {token}"},
            params={"perpage": RAINDROP_PER_PAGE, "page": page, "sort": "-created"},
            timeout=30,
        )
        response.raise_for_status()
        batch = response.json().get("items") or []
        items.extend(batch)
        if len(batch) < RAINDROP_PER_PAGE:
            return items
        page += 1


def instagram_posts(bookmarks: list[dict]) -> list[Post]:
    posts: list[Post] = []
    seen: set[str] = set()
    for item in bookmarks:
        match = INSTAGRAM_POST_RE.search(item.get("link") or "")
        if not match or match.group(2) in seen:
            continue
        kind, shortcode = match.group(1).lower(), match.group(2)
        seen.add(shortcode)
        posts.append(Post(
            raindrop_id=item.get("_id"),
            saved_at=(item.get("created") or "")[:10],
            title=(item.get("title") or "").strip(),
            url=f"https://www.instagram.com/{kind}/{shortcode}/",
            kind=kind,
            shortcode=shortcode,
        ))
    return posts


# --- Brave cookies ----------------------------------------------------------

def _snapshot_brave_cookie_db(dest_dir: Path) -> Path | None:
    """Consistent read-only copy of Brave's cookie database, or None.

    gallery-dl opens the live database with SQLite's immutable flag, which
    ignores Brave's locks and can read a half-written page ("database disk
    image is malformed"). SQLite's backup API takes a read lock instead and
    never writes to the source.
    """
    from gallery_dl import cookies as gdl_cookies

    try:
        config = gdl_cookies._chromium_browser_settings("brave")
        source = gdl_cookies._chromium_cookies_database(None, config)
    except Exception as exc:
        print(f"  Could not locate Brave's cookie database ({exc}); using gallery-dl's reader.")
        return None

    profile_dir = dest_dir / "Default"
    profile_dir.mkdir()
    snapshot = profile_dir / "Cookies"
    src = sqlite3.connect(f"file:{source}?mode=ro", uri=True, timeout=10)
    dst = sqlite3.connect(snapshot)
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()
    return profile_dir


def load_instagram_cookies(attempts: int = 3) -> dict[str, str]:
    """Instagram session cookies from Brave, kept in memory only."""
    from gallery_dl import cookies as gdl_cookies

    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        with tempfile.TemporaryDirectory(prefix="wev-ig-cookies-") as tmp:
            os.chmod(tmp, 0o700)
            try:
                profile = _snapshot_brave_cookie_db(Path(tmp))
                spec = ("brave", str(profile) if profile else None, None, None, ".instagram.com")
                jar = gdl_cookies.load_cookies(spec)
                found = {c.name: c.value for c in jar if c.domain.endswith("instagram.com")}
                if "sessionid" in found:
                    return found
                last_error = RuntimeError("no Instagram sessionid cookie in Brave")
            except Exception as exc:
                last_error = exc
        if attempt < attempts:
            print(f"  Reading Brave cookies failed ({last_error}); retrying...")
            time.sleep(2 * attempt)
    raise SystemExit(
        f"Could not read an Instagram session from Brave: {last_error}\n"
        "Make sure you are logged into instagram.com in Brave, then rerun."
    )


# --- Downloading ------------------------------------------------------------

def configure_gallery_dl(cookies: dict[str, str], all_slides: bool, verbose: bool) -> None:
    from gallery_dl import config, output

    config.clear()
    output.initialize_logging(10 if verbose else 30)
    config.set(("extractor",), "cookies", cookies)
    config.set(("extractor",), "cookies-update", False)
    config.set(("extractor", "instagram"), "videos", False)
    if not all_slides:
        config.set((), "file-range", "1")
    config.set(
        ("extractor", "instagram"),
        "filename",
        "{username}_{post_shortcode}_{num:>02}.{extension}",
    )


def download_post(post: Post, out_dir: Path) -> list[Path]:
    from gallery_dl import config, job

    target = out_dir / post.shortcode
    target.mkdir(parents=True, exist_ok=True)
    config.set(("extractor",), "directory", [])
    config.set(("extractor",), "base-directory", str(target))
    status = job.DownloadJob(post.url).run()
    files = sorted(p for p in target.iterdir() if p.suffix.lower() in IMAGE_SUFFIXES)
    if status and not files:
        raise RuntimeError(f"gallery-dl exited with status {status}")
    return files


# --- Manifest ---------------------------------------------------------------

def read_manifest(path: Path) -> dict[str, dict]:
    if not path.exists():
        return {}
    with path.open(newline="", encoding="utf-8") as fh:
        return {row["shortcode"]: row for row in csv.DictReader(fh)}


def write_manifest(path: Path, rows: dict[str, dict]) -> None:
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=MANIFEST_FIELDS)
        writer.writeheader()
        for row in sorted(rows.values(), key=lambda r: r["saved_at"], reverse=True):
            writer.writerow({k: row.get(k, "") for k in MANIFEST_FIELDS})
    tmp.replace(path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--collection", type=int, default=-1, help="Raindrop collection id (default: -1, Unsorted)")
    parser.add_argument("--out", type=Path, default=HERE / "downloads", help="Output directory")
    parser.add_argument("--all-slides", action="store_true", help="Download every slide, not just the first")
    parser.add_argument("--limit", type=int, help="Process at most N posts")
    parser.add_argument("--force", action="store_true", help="Re-download posts already in the manifest")
    parser.add_argument("--dry-run", action="store_true", help="List posts without downloading")
    parser.add_argument("--verbose", action="store_true", help="Show gallery-dl debug output")
    args = parser.parse_args()

    load_dotenv(HERE.parent / ".env")
    token = os.environ.get("RAINDROP_TOKEN")
    if not token:
        print("RAINDROP_TOKEN is not set in ../.env", file=sys.stderr)
        return 1

    bookmarks = fetch_bookmarks(token, args.collection)
    posts = instagram_posts(bookmarks)
    print(f"{len(bookmarks)} bookmarks, {len(posts)} Instagram posts")

    args.out.mkdir(parents=True, exist_ok=True)
    manifest_path = args.out / "manifest.csv"
    manifest = read_manifest(manifest_path)

    todo = [p for p in posts if args.force or manifest.get(p.shortcode, {}).get("status") != "ok"]
    print(f"{len(todo)} not yet downloaded ({len(posts) - len(todo)} already done)")
    if args.limit:
        todo = todo[: args.limit]

    if args.dry_run:
        for post in todo:
            print(f"  {post.saved_at}  {post.kind:4}  {post.url}  {post.title[:60]}")
        return 0
    if not todo:
        return 0

    configure_gallery_dl(load_instagram_cookies(), args.all_slides, args.verbose)

    failures = 0
    for index, post in enumerate(todo, start=1):
        row = {
            "raindrop_id": post.raindrop_id, "saved_at": post.saved_at, "title": post.title,
            "url": post.url, "shortcode": post.shortcode,
        }
        print(f"[{index}/{len(todo)}] {post.url}  {post.title[:60]}")
        if args.force:
            shutil.rmtree(args.out / post.shortcode, ignore_errors=True)
        try:
            files = download_post(post, args.out)
            if not files:
                raise RuntimeError("no images (video-only post?)")
            with Image.open(files[0]) as image:
                width, height = image.size
            row.update(
                status="ok",
                files=";".join(str(f.relative_to(args.out)) for f in files),
                width=width, height=height, error="",
            )
            print(f"    {len(files)} image(s), first slide {width}x{height}")
        except Exception as exc:
            failures += 1
            row.update(status="error", files="", width="", height="", error=str(exc)[:300])
            print(f"    failed: {exc}")
        manifest[post.shortcode] = row
        write_manifest(manifest_path, manifest)

    print(f"\nDone: {len(todo) - failures} downloaded, {failures} failed. Manifest: {manifest_path}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
