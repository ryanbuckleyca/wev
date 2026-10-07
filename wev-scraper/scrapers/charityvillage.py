import re
from urllib.parse import urljoin, urlparse

from scrapers.base import BaseScraper
from utils.extractors import extract_salary_from_text
from utils.log import scraper_log

_PDF_MAX_BYTES = 10 * 1024 * 1024
_PDF_MAX_PAGES = 50
_PDF_MAX_CHARS = 200_000
_PDF_ALLOWED_SCHEMES = {"http", "https"}
_PDF_ALLOWED_PORTS = {"http": 80, "https": 443}
_PDF_CONNECT_TIMEOUT = 10
_PDF_READ_TIMEOUT = 20
_PDF_ALLOWED_HOST_SUFFIXES = (".charityvillage.com", "charityvillage.com")


def _ip_is_non_public(ip) -> bool:
    return (ip.is_private or ip.is_loopback or ip.is_link_local or
            ip.is_multicast or ip.is_reserved or
            (hasattr(ip, "is_unspecified") and ip.is_unspecified))


def _normalize_pdf_url(pdf_url: str, base_url: str | None = None) -> str | None:
    absolute_url = urljoin(base_url, pdf_url) if base_url else pdf_url
    try:
        parsed = urlparse(absolute_url)
    except Exception:
        return None

    scheme = (parsed.scheme or "").lower()
    if scheme not in _PDF_ALLOWED_SCHEMES:
        return None
    if not parsed.hostname or parsed.username or parsed.password:
        return None
    try:
        port = parsed.port
    except ValueError:
        return None
    if port is not None and port != _PDF_ALLOWED_PORTS[scheme]:
        return None

    return parsed._replace(fragment="").geturl()


def _is_safe_pdf_url(pdf_url: str) -> bool:
    """Reject PDF URLs that could egress to local or private network targets."""
    import ipaddress
    import socket

    try:
        parsed = urlparse(pdf_url)
    except Exception:
        return False

    scheme = (parsed.scheme or "").lower()
    host = parsed.hostname or ""
    if scheme not in _PDF_ALLOWED_SCHEMES or not host:
        return False

    lower = host.lower()
    if lower in ("localhost", "metadata", "metadata.google.internal"):
        return False
    if lower.endswith(".local") or lower.endswith(".internal"):
        return False

    if not lower.endswith(_PDF_ALLOWED_HOST_SUFFIXES):
        return False

    try:
        host = host.encode("idna").decode("ascii")
    except Exception:
        return False

    try:
        literal_ip = ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        if _ip_is_non_public(literal_ip):
            return False

    try:
        prev_timeout = socket.getdefaulttimeout()
        socket.setdefaulttimeout(_PDF_CONNECT_TIMEOUT)
        try:
            addrinfo = socket.getaddrinfo(
                host,
                parsed.port or _PDF_ALLOWED_PORTS[scheme],
                type=socket.SOCK_STREAM,
            )
        finally:
            socket.setdefaulttimeout(prev_timeout)
    except (socket.gaierror, socket.timeout):
        return False
    if not addrinfo:
        return False

    resolved_any = False
    for *_, sockaddr in addrinfo:
        try:
            resolved_ip = ipaddress.ip_address(sockaddr[0])
        except (IndexError, ValueError):
            return False
        if _ip_is_non_public(resolved_ip):
            return False
        resolved_any = True
    return resolved_any


def _build_no_redirect_opener():
    import ssl
    import urllib.error
    import urllib.request

    class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: PLR0913
            raise urllib.error.HTTPError(
                req.full_url,
                code,
                f"PDF redirect blocked ({newurl})",
                headers,
                fp,
            )

    ssl_context = ssl.create_default_context(purpose=ssl.Purpose.SERVER_AUTH)
    ssl_context.check_hostname = True
    ssl_context.verify_mode = ssl.CERT_REQUIRED
    https_handler = urllib.request.HTTPSHandler(context=ssl_context, check_hostname=True)

    return urllib.request.build_opener(NoRedirectHandler, https_handler)


def _read_pdf_response(resp) -> bytes | None:
    ctype = resp.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
    if ctype != "application/pdf":
        scraper_log(f"\tCharityVillage: rejecting PDF response with Content-Type={ctype or 'missing'}")
        return None

    try:
        clen = int(resp.headers.get("Content-Length", "0") or "0")
    except ValueError:
        clen = 0
    if clen > _PDF_MAX_BYTES:
        scraper_log(f"\tCharityVillage: rejecting PDF larger than {_PDF_MAX_BYTES} bytes")
        return None

    chunks = []
    total = 0
    while True:
        chunk = resp.read(65536)
        if not chunk:
            break
        total += len(chunk)
        if total > _PDF_MAX_BYTES:
            scraper_log(f"\tCharityVillage: PDF stream exceeded {_PDF_MAX_BYTES} bytes")
            return None
        chunks.append(chunk)
    pdf_bytes = b"".join(chunks)
    if not pdf_bytes.lstrip().startswith(b"%PDF"):
        scraper_log("\tCharityVillage: rejecting PDF response without PDF magic bytes")
        return None
    return pdf_bytes


def _extract_bounded_pdf_text(reader) -> str | None:
    parts = []
    total = 0
    truncated = False
    for page in reader.pages[:_PDF_MAX_PAGES]:
        page_text = page.extract_text() or ""
        if not page_text:
            continue
        remaining = _PDF_MAX_CHARS - total
        if len(page_text) > remaining:
            parts.append(page_text[:remaining])
            truncated = True
            break
        parts.append(page_text)
        total += len(page_text)
        if total >= _PDF_MAX_CHARS:
            truncated = True
            break

    text = "\n".join(parts).strip()
    if not text:
        return None
    if truncated or len(reader.pages) > _PDF_MAX_PAGES:
        text = f"{text}\n\n[truncated: description exceeded PDF extraction limits]"
    return text


def _extract_text_from_pdf_url(pdf_url: str) -> str | None:
    """Fetch a PDF by URL and extract its plain text using pypdf."""
    import io
    import socket
    import ssl
    import urllib.error
    import urllib.request

    from pypdf import PdfReader
    from pypdf.errors import PdfReadError

    original_pdf_url = pdf_url
    try:
        pdf_url = _normalize_pdf_url(pdf_url)
        if not pdf_url:
            scraper_log(f"\tCharityVillage: rejecting invalid PDF URL ({original_pdf_url})")
            return None
        if not _is_safe_pdf_url(pdf_url):
            scraper_log(f"\tCharityVillage: rejecting unsafe PDF URL host ({pdf_url})")
            return None
        req = urllib.request.Request(pdf_url, headers={"User-Agent": "Mozilla/5.0"})
        opener = _build_no_redirect_opener()
        with opener.open(req, timeout=_PDF_READ_TIMEOUT) as resp:
            pdf_bytes = _read_pdf_response(resp)
        if not pdf_bytes:
            return None
        try:
            reader = PdfReader(io.BytesIO(pdf_bytes))
        except (PdfReadError, OSError, ValueError) as e:
            scraper_log(f"\tCharityVillage: PDF parse failed ({pdf_url}): {e}")
            return None
        return _extract_bounded_pdf_text(reader)
    except urllib.error.HTTPError as e:
        scraper_log(f"\tCharityVillage: PDF HTTP error ({pdf_url}): HTTP {e.code}")
        return None
    except urllib.error.URLError as e:
        reason = getattr(e, "reason", e)
        scraper_log(f"\tCharityVillage: PDF URL error ({pdf_url}): {reason}")
        return None
    except socket.timeout:
        scraper_log(f"\tCharityVillage: PDF fetch timed out ({pdf_url})")
        return None
    except ssl.SSLError as e:
        scraper_log(f"\tCharityVillage: PDF SSL error ({pdf_url}): {e}")
        return None
    except (PdfReadError, OSError, ValueError) as e:
        scraper_log(f"\tCharityVillage: PDF extraction failed ({pdf_url}): {e}")
        return None
    except Exception as e:
        scraper_log(f"\tCharityVillage: unexpected PDF error ({pdf_url}): {type(e).__name__}: {e}")
        return None


_LISTINGS_URL = "https://www.charityvillage.com/jobs"

_NEXT_PAGE_PATTERN = re.compile(r"next", re.IGNORECASE)

_EMPLOYMENT_TYPE_KEYWORDS = [
    "full-time", "full time", "part-time", "part time",
    "contract", "temporary", "volunteer", "internship",
    "seasonal", "casual", "permanent",
]


class CharityVillageScraper(BaseScraper):
    is_chronological = True
    listing_selector = "div[data-testid='jcl-job-teaser-wrapper']"
    job_wait_selector = "div[data-testid='job-detail-wrapper']"

    def __init__(self, source):
        super().__init__(source)
        self.current_page_number = 1

    def get_listings_url(self):
        return _LISTINGS_URL

    def open_listings_page(self, page):
        url = self.get_listings_url()
        scraper_log(f"\nNavigating to {url}")
        self._goto_with_networkidle(page, url)
        page.wait_for_timeout(3000)
        self._listings_base_url = page.url

    def has_next_page(self, page) -> bool:
        try:
            count = page.locator(self.listing_selector).count()
            if count == 0:
                return False
            return self._find_next_element(page) is not None
        except Exception as e:
            scraper_log(f"\tCharityVillage: error checking for next page: {e}")
            return False

    def go_next_page(self, page):
        self.current_page_number += 1
        next_el = self._find_next_element(page)
        if next_el:
            try:
                with page.expect_navigation():
                    next_el.click()
                page.wait_for_timeout(3000)
                return
            except Exception as e:
                scraper_log(f"\tCharityVillage: error clicking next: {e}")
        next_url = self._build_page_url(page)
        try:
            self._goto_with_networkidle(page, next_url)
            page.wait_for_timeout(3000)
        except Exception as e:
            scraper_log(f"\tCharityVillage: error going to page {self.current_page_number}: {e}")
            self.should_quit_list = True

    def _find_next_element(self, page):
        try:
            btn = page.get_by_role("button", name=_NEXT_PAGE_PATTERN)
            if btn.count() > 0 and not btn.first.is_disabled():
                return btn.first
            link = page.get_by_role("link", name=_NEXT_PAGE_PATTERN)
            if link.count() > 0:
                return link.first
            li = page.locator("li.next:not(.disabled), li:has-text('Next'):not(.disabled)")
            if li.count() > 0:
                a = li.locator("a")
                return a.first if a.count() > 0 else li.first
        except Exception:
            pass
        return None

    def _build_page_url(self, page) -> str:
        base = getattr(self, "_listings_base_url", page.url)
        base = re.sub(r"[&?]page=\d+", "", base)
        sep = "&" if "?" in base else "?"
        return f"{base}{sep}page={self.current_page_number}"

    def extract_job_title(self, page, listing_data) -> str:
        return self._extract_text(page, "[data-testid='title']") or listing_data.get("job_title", "Unknown")

    def extract_organization(self, page, listing_data) -> str | None:
        return self._extract_text(page, "[data-testid='company-name']")

    def extract_description(self, page, listing_data) -> str | None:
        # Check for an iframe PDF embed first — CharityVillage posts some job
        # descriptions as PDF files embedded via <iframe src="...pdf">.
        try:
            iframe = page.locator("[data-testid='job-detail-description'] iframe")
            if iframe.count() > 0:
                pdf_url = iframe.first.get_attribute("src", timeout=3000)
                if pdf_url and ".pdf" in pdf_url.lower():
                    pdf_url = _normalize_pdf_url(pdf_url, page.url)
                    if not pdf_url:
                        scraper_log("\tCharityVillage: rejecting invalid PDF iframe URL")
                        return self._extract_text(page, "[data-testid='job-detail-description']")
                    scraper_log(f"\tCharityVillage: description is a PDF — extracting from {pdf_url}")
                    text = _extract_text_from_pdf_url(pdf_url)
                    if text:
                        return text
                    scraper_log("\tCharityVillage: PDF extraction returned no text, falling back to DOM")
        except Exception:
            pass
        return self._extract_text(page, "[data-testid='job-detail-description']")

    def extract_location(self, page, listing_data) -> str | None:
        return listing_data.get("teaser_location")

    def extract_wage(self, page, listing_data) -> str | None:
        fields = self._extract_text(page, "[data-testid='fields-values']")
        if fields:
            return extract_salary_from_text(fields)
        return None

    def extract_date_posted(self, page, listing_data) -> str | None:
        return listing_data.get("date_posted")

    def extract_close_date(self, page, listing_data) -> str | None:
        return listing_data.get("close_date")

    def extract_employment_type(self, page, listing_data) -> str | None:
        fields = self._extract_text(page, "[data-testid='fields-values']")
        if fields:
            for part in fields.split("|"):
                part = part.strip()
                lower = part.lower()
                if any(kw in lower for kw in _EMPLOYMENT_TYPE_KEYWORDS):
                    return part
        return None

    def get_listing_data(self, item) -> dict:
        data = {}
        try:
            loc = item.locator("[data-testid='jcl-job-teaser-location']")
            if loc.count() > 0:
                data["teaser_location"] = loc.inner_text().strip()

            text = item.inner_text()
            if "Fully Remote" in text:
                data["remote_status"] = "Fully Remote"
            elif "Hybrid" in text:
                data["remote_status"] = "Hybrid"

            pub_match = re.search(r"Published:\s*(\d{4}-\d{2}-\d{2})", text)
            if pub_match:
                data["date_posted"] = pub_match.group(1)
            exp_match = re.search(r"Expires:\s*(\d{4}-\d{2}-\d{2})", text)
            if exp_match:
                data["close_date"] = exp_match.group(1)
        except Exception:
            pass
        return data

    def _extract_text(self, page, selector: str) -> str | None:
        try:
            loc = page.locator(selector)
            if loc.count() == 0:  # count() does not wait
                return None
            return loc.first.inner_text().strip()
        except Exception:
            return None
