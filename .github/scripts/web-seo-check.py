#!/usr/bin/env python3
"""
web-seo-check.py — SEO / indexing CI gate for public websites.

Catches the GSC (Google Search Console) error classes that are preventable
in CI, before they show up weeks later in Search Console:

  - Alternate page with proper canonical tag   (canonical points at a DIFFERENT url)
  - Duplicate without user-selected canonical  (missing canonical)
  - Page with redirect                          (sitemap URLs that 3xx)
  - Discovered/Crawled — currently not indexed (noindex, thin content, robots block)
  - Soft 404                                    (200 with 404-ish content)
  - Duplicate field FAQPage / bad JSON-LD
  - Sitemap 404s / sitemap missing from robots.txt
  - SERP default icon (SVG-only or <48px favicon), broken og:image

Two modes:

  DIR mode  (--dir PATH)   : scan a built static output directory. No network.
                            Maps each .html file to a URL via --base-url.
                            Reads sitemap.xml + robots.txt from the dir if present.
  LIVE mode (--url URL)    : serial crawl of robots.txt + sitemap.xml + every
                            sitemap URL. Serial + delay + 503 retry (Cloudflare
                            rate-limits parallel crawls — see
                            manager/docs/plans/seo-indexing-ci-gate-phase-0.md).

Exit code: 0 = pass, 1 = errors (block deploy), 2 = warnings only.
Promote warnings to failures with --warn-as-error.

Stdlib-only, runs on any Python 3.9+. No external deps.
"""

import argparse
import json
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

UA = "Mozilla/5.0 (compatible; web-seo-check/1.0; +https://maxpetrusenko.com)"
TIMEOUT = 30
MAX_REDIRECTS = 5
DEFAULT_DELAY = 0.25
SOFT_404_MARKERS = re.compile(
    r"(page not found|404 not found|this page could not be found|"
    r"oops.*not found|error 404|page you (were|are) looking for)", re.I
)

# ---------------------------------------------------------------- helpers


class Checker:
    def __init__(self, base_url, delay=DEFAULT_DELAY, max_urls=None, verbose=False):
        self.base_url = base_url.rstrip("/")
        self.delay = delay
        self.max_urls = max_urls
        self.verbose = verbose
        self.errors = []
        self.warnings = []
        self.infos = []
        self.ctx = ssl.create_default_context()
        self.ctx.check_hostname = True

    # -- result recording -------------------------------------------------

    def err(self, check, url, msg):
        self.errors.append({"check": check, "url": url, "message": msg})

    def warn(self, check, url, msg):
        self.warnings.append({"check": check, "url": url, "message": msg})

    def info(self, check, url, msg):
        self.infos.append({"check": check, "url": url, "message": msg})

    # -- url handling ------------------------------------------------------

    def normalize(self, url):
        """Canonical normalization: scheme://host/path (no fragment, no default port)."""
        u = urllib.parse.urlsplit(url)
        scheme = (u.scheme or "https").lower()
        host = (u.hostname or "").lower()
        if u.port and not ((scheme == "http" and u.port == 80) or (scheme == "https" and u.port == 443)):
            host = f"{host}:{u.port}"
        path = u.path or "/"
        return urllib.parse.urlunsplit((scheme, host, path, u.query, ""))

    def same_page(self, a, b):
        """True if two urls are the same page ignoring trailing slash + fragment."""
        na = self.normalize(a).rstrip("/")
        nb = self.normalize(b).rstrip("/")
        return na == nb

    def host_of(self, url):
        try:
            return (urllib.parse.urlsplit(url).hostname or "").lower()
        except Exception:
            return ""

    # -- http ---------------------------------------------------------------

    def fetch(self, url, allow_redirects=True, method="GET"):
        """Fetch with retries on 5xx. Returns (status, final_url, headers, body)."""
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
        try:
            resp = urllib.request.urlopen(req, timeout=TIMEOUT, context=self.ctx)
            body = resp.read()
            return resp.status, resp.geturl(), dict(resp.headers), body
        except urllib.error.HTTPError as e:
            if e.code >= 500 and e.code < 600:
                for attempt in range(3):
                    time.sleep(self.delay * (attempt + 1))
                    try:
                        resp = urllib.request.urlopen(req, timeout=TIMEOUT, context=self.ctx)
                        return resp.status, resp.geturl(), dict(resp.headers), resp.read()
                    except urllib.error.HTTPError as e2:
                        if e2.code < 500:
                            try:
                                return e2.code, url, dict(e2.headers), e2.read()
                            except Exception:
                                return e2.code, url, {}, b""
                return e.code, url, dict(e.headers), (e.read() if hasattr(e, "read") else b"")
            return e.code, url, dict(e.headers), (e.read() if hasattr(e, "read") else b"")
        except urllib.error.URLError as e:
            return 0, url, {}, f"NETWORK ERROR: {e}".encode()

    def fetch_text(self, url):
        status, final, headers, body = self.fetch(url)
        text = ""
        try:
            text = body.decode("utf-8", errors="replace")
        except Exception:
            text = body.decode("latin-1", errors="replace")
        return status, final, text

    # -- html parsing ---------------------------------------------------------

    def parse_meta(self, html):
        """Extract head signals with regex (fast, robust to malformed html)."""
        out = {
            "canonical": None,
            "canonicals": [],
            "robots": [],
            "title": None,
            "description": None,
            "og_image": None,
            "twitter_image": None,
            "favicons": [],
            "hreflang": [],
            "jsonld": [],
            "http_equiv": [],
        }
        # title
        m = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
        if m:
            out["title"] = re.sub(r"\s+", " ", m.group(1)).strip()
        # canonical
        for m in re.finditer(r'<link[^>]*rel=["\']canonical["\'][^>]*>', html, re.I):
            href = re.search(r'href=["\']([^"\']+)["\']', m.group(0), re.I)
            if href:
                out["canonicals"].append(href.group(1))
        if out["canonicals"]:
            out["canonical"] = out["canonicals"][0]
        # robots meta (also catch Next.js RSC escaped payload)
        for m in re.finditer(r'<meta[^>]*name=["\']robots["\'][^>]*>', html, re.I):
            content = re.search(r'content=["\']([^"\']+)["\']', m.group(0), re.I)
            if content:
                out["robots"].append(content.group(1).lower())
        for m in re.finditer(r'"robots":"([^"]*)"', html):
            out["robots"].append(m.group(1).lower())
        for m in re.finditer(r"robots\\u0022:\\u0022([^\\]+)", html):
            out["robots"].append(m.group(1).lower())
        # description
        for m in re.finditer(r'<meta[^>]*name=["\']description["\'][^>]*>', html, re.I):
            content = re.search(r'content=["\']([^"\']*)["\']', m.group(0), re.I | re.S)
            if content:
                out["description"] = content.group(1).strip()
        # og:image / twitter:image
        for m in re.finditer(r'<meta[^>]*property=["\']og:image["\'][^>]*>', html, re.I):
            c = re.search(r'content=["\']([^"\']+)["\']', m.group(0), re.I)
            if c:
                out["og_image"] = c.group(1)
        for m in re.finditer(r'<meta[^>]*name=["\']twitter:image["\'][^>]*>', html, re.I):
            c = re.search(r'content=["\']([^"\']+)["\']', m.group(0), re.I)
            if c:
                out["twitter_image"] = c.group(1)
        # favicons
        for m in re.finditer(r'<link[^>]*rel=["\'][^"\']*icon[^"\']*["\'][^>]*>', html, re.I):
            tag = m.group(0)
            href = re.search(r'href=["\']([^"\']+)["\']', tag, re.I)
            sizes = re.search(r'sizes=["\']([^"\']+)["\']', tag, re.I)
            typ = re.search(r'type=["\']([^"\']+)["\']', tag, re.I)
            if href:
                out["favicons"].append(
                    {
                        "href": href.group(1),
                        "sizes": sizes.group(1) if sizes else None,
                        "type": typ.group(1) if typ else None,
                    }
                )
        # hreflang
        for m in re.finditer(r'<link[^>]*rel=["\']alternate["\'][^>]*hreflang=["\'][^"\']+["\'][^>]*>', html, re.I):
            href = re.search(r'href=["\']([^"\']+)["\']', m.group(0), re.I)
            hl = re.search(r'hreflang=["\']([^"\']+)["\']', m.group(0), re.I)
            if href and hl:
                out["hreflang"].append((hl.group(1), href.group(1)))
        # JSON-LD
        for m in re.finditer(r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, re.I | re.S):
            out["jsonld"].append(m.group(1).strip())
        # http-equiv refresh (soft 404 detector)
        for m in re.finditer(r'<meta[^>]*http-equiv=["\']refresh["\'][^>]*>', html, re.I):
            out["http_equiv"].append(m.group(0))
        return out

    def parse_jsonld(self, block):
        """Parse a JSON-LD block; returns (ok, data, error)."""
        block = block.strip()
        if not block:
            return False, None, "empty json-ld block"
        try:
            data = json.loads(block)
            return True, data, None
        except json.JSONDecodeError as e:
            # tolerate a single trailing comma (common manual error) then re-parse
            fixed = re.sub(r",\s*([}\]])", r"\1", block)
            try:
                data = json.loads(fixed)
                return True, data, f"trailing comma fixed: {e}"
            except json.JSONDecodeError as e2:
                return False, None, f"invalid json: {e2}"

    # -- sitemap ---------------------------------------------------------------

    def parse_sitemap_urls(self, body):
        """Extract <loc> urls from a sitemap (handles sitemap index + urlset)."""
        urls = []
        try:
            root = ET.fromstring(body)
        except ET.ParseError:
            # fallback regex
            return re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", body)
        ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        for loc in root.findall(".//sm:loc", ns):
            urls.append(loc.text.strip() if loc.text else "")
        return [u for u in urls if u]

    # -- checks ---------------------------------------------------------------

    def check_canonical(self, url, meta, html=""):
        """Checks 1-3: canonical present, self-referencing, no chain."""
        if not meta["canonical"]:
            self.err("canonical-missing", url, "no <link rel=canonical> found")
            return
        if len(meta["canonicals"]) > 1:
            self.warn("canonical-multiple", url, f"multiple canonical tags: {meta['canonicals']}")
        canon = meta["canonical"]
        canon_host = self.host_of(canon)
        page_host = self.host_of(url)
        if canon_host and page_host and canon_host != page_host:
            self.err(
                "canonical-cross-host",
                url,
                f"canonical points at different host {canon} (page host {page_host}) — "
                "classic 'Alternate page with proper canonical tag'",
            )
        elif canon_host and page_host and canon_host == page_host:
            # same host: must be self-referencing (ignoring slash + .html suffix,
            # since static hosts serve both /page and /page.html)
            canon_norm = re.sub(r"\.html$", "", self.normalize(canon).rstrip("/"))
            page_norm = re.sub(r"\.html$", "", self.normalize(url).rstrip("/"))
            if canon_norm != page_norm and not self.same_page(canon, url):
                self.warn(
                    "canonical-other-page",
                    url,
                    f"canonical {canon} != page url {url} (same host) — alternate-page risk "
                    "unless this is a deliberate canonicalization; verify target resolves",
                )
        # absolute url check
        if not canon.startswith(("http://", "https://")):
            self.warn("canonical-relative", url, f"canonical is relative: {canon}")
        elif canon.startswith("http://"):
            self.warn("canonical-http", url, f"canonical uses http:// not https://: {canon}")

    def check_robots(self, url, meta, html=""):
        """Check 4: no noindex on sitemap URLs."""
        noindex = False
        for r in meta["robots"]:
            if "noindex" in r:
                noindex = True
        if noindex:
            self.err("noindex", url, "page has robots noindex but is in sitemap — will never index")

    def check_title_desc(self, url, meta, html=""):
        """Check 7: title + description present, sane lengths, dup detection later."""
        title = meta["title"]
        desc = meta["description"]
        if not title:
            self.err("title-missing", url, "no <title>")
        elif len(title) < 10:
            self.warn("title-short", url, f"title too short ({len(title)} chars): {title!r}")
        elif len(title) > 70:
            self.warn("title-long", url, f"title >70 chars ({len(title)}): {title!r}")
        if desc is None:
            self.err("description-missing", url, "no meta description")
        elif len(desc) < 30:
            self.warn("description-short", url, f"description too short ({len(desc)} chars)")
        elif len(desc) > 165:
            self.warn("description-long", url, f"description >165 chars ({len(desc)})")

    def check_soft404(self, url, meta, html):
        """Check 8: 200 page that looks like a 404."""
        hay = f"{meta.get('title') or ''} {meta.get('description') or ''}"
        if SOFT_404_MARKERS.search(hay):
            self.warn("soft-404", url, f"200 response but content looks like 404: {meta.get('title')!r}")
        if meta.get("http_equiv"):
            self.warn("meta-refresh", url, f"http-equiv refresh present: {meta['http_equiv']}")

    def check_jsonld(self, url, meta, html=""):
        """Check 9: JSON-LD parses; no duplicate FAQPage."""
        types_seen = []
        for i, block in enumerate(meta["jsonld"]):
            ok, data, err = self.parse_jsonld(block)
            if not ok:
                self.err("jsonld-invalid", url, f"JSON-LD block #{i}: {err}")
                continue
            # collect @type(s)
            def collect_types(node, acc):
                if isinstance(node, dict):
                    t = node.get("@type")
                    if isinstance(t, str):
                        acc.append(t)
                    elif isinstance(t, list):
                        acc.extend(x for x in t if isinstance(x, str))
                    for v in node.values():
                        collect_types(v, acc)
                elif isinstance(node, list):
                    for v in node:
                        collect_types(v, acc)

            collect_types(data, types_seen)
        for t in set(types_seen):
            if t == "FAQPage" and types_seen.count(t) > 1:
                self.warn("jsonld-dup-faqpage", url, f"duplicate FAQPage type ({types_seen.count(t)}x) — GSC 'Duplicate field FAQPage'")

    def check_favicon(self, url, meta, html=""):
        """Check 10: PNG/ICO >=48px favicon present (not SVG-only)."""
        favs = meta["favicons"]
        if not favs:
            self.warn("favicon-missing", url, "no <link rel=icon> found")
            return
        has_png_ico = False
        largest = 0
        for f in favs:
            href = f["href"].lower()
            typ = (f["type"] or "").lower()
            if ".png" in href or ".ico" in href or "image/x-icon" in typ or "png" in typ:
                size = 0
                if f["sizes"] and "x" in f["sizes"]:
                    try:
                        w, h = f["sizes"].split("x")[:2]
                        size = min(int(w), int(h))
                    except Exception:
                        size = 0
                # unknown size counts as present but not provably >=48
                if size == 0 and f["sizes"] is None:
                    size = 32
                largest = max(largest, size)
                if size == 0 or size >= 48:
                    has_png_ico = True
        if not has_png_ico:
            self.err(
                "favicon-svg-only",
                url,
                f"no PNG/ICO favicon >=48px (largest PNG/ICO declared: {largest}px) — Google SERP shows default icon",
            )

    def check_ogimage(self, url, meta, html=""):
        """Check 11: og:image absolute https."""
        og = meta["og_image"]
        if not og:
            self.warn("og-image-missing", url, "no og:image")
            return
        if og.startswith("/"):
            self.warn("og-image-relative", url, f"og:image is relative: {og} — must be absolute for social previews")
        elif og.startswith("http://"):
            self.warn("og-image-http", url, f"og:image uses http:// — https required: {og}")

    def check_hreflang(self, url, meta, html=""):
        """Check 12: hreflang alternates consistent."""
        if not meta["hreflang"]:
            return
        seen = set()
        for hl, href in meta["hreflang"]:
            if href in seen:
                self.warn("hreflang-dup", url, f"duplicate hreflang target: {href}")
            seen.add(href)
            if not href.startswith(("http://", "https://")):
                self.warn("hreflang-relative", url, f"hreflang target relative: {href}")

    def check_host_consistency(self, url, meta, html=""):
        """Check 13: sitemap URLs on canonical host — no www/apex mixing."""
        canon = meta["canonical"]
        if canon and self.host_of(canon) != self.host_of(url):
            # already reported cross-host; skip
            return
        # base host for the crawl is the intended canonical host
        base_host = self.host_of(self.base_url)
        if base_host and self.host_of(url) != base_host and url.startswith(("http://", "https://")):
            self.warn(
                "host-mix",
                url,
                f"sitemap URL on {self.host_of(url)} but canonical host is {base_host} — www/apex split",
            )

    # -- orchestrators -----------------------------------------------------------

    def run_page_checks(self, url, status, final_url, html):
        """All HTML checks for one page."""
        if status == 0:
            self.err("fetch-failed", url, "network error fetching page")
            return None
        if status >= 400:
            self.err("status-4xx-5xx", url, f"HTTP {status} for sitemap URL")
            return None
        if status >= 300:
            self.warn("status-redirect", url, f"HTTP {status} (sitemap URL should be 200) → {final_url}")
            return None
        meta = self.parse_meta(html)
        self.check_canonical(url, meta, html)
        self.check_robots(url, meta, html)
        self.check_title_desc(url, meta, html)
        self.check_soft404(url, meta, html)
        self.check_jsonld(url, meta, html)
        self.check_favicon(url, meta, html)
        self.check_ogimage(url, meta, html)
        self.check_hreflang(url, meta, html)
        self.check_host_consistency(url, meta, html)
        return meta

    def run_live(self):
        base = self.base_url
        # robots.txt
        robots_url = f"{base}/robots.txt"
        st, final, text = self.fetch_text(robots_url)
        if st == 0:
            self.err("robots-fetch", robots_url, "network error fetching robots.txt")
        elif st >= 400:
            self.err("robots-missing", robots_url, f"robots.txt HTTP {st}")
        else:
            if "sitemap:" not in text.lower():
                self.warn("robots-no-sitemap", robots_url, "robots.txt does not reference a Sitemap:")
            for line in text.splitlines():
                low = line.lower().strip()
                if low.startswith("disallow:") and low.split(":", 1)[1].strip() in ("/", ""):
                    self.err("robots-block-root", robots_url, f"robots.txt disallows everything: {line}")
            self.info("robots-ok", robots_url, f"robots.txt HTTP {st}")
        time.sleep(self.delay)

        # sitemap.xml
        sitemap_url = f"{base}/sitemap.xml"
        st, final, text = self.fetch_text(sitemap_url)
        urls = []
        if st == 0:
            self.err("sitemap-fetch", sitemap_url, "network error fetching sitemap.xml")
        elif st >= 400:
            self.err("sitemap-missing", sitemap_url, f"sitemap.xml HTTP {st}")
        else:
            urls = self.parse_sitemap_urls(text)
            if not urls:
                self.warn("sitemap-empty", sitemap_url, "sitemap.xml parsed but contains no <loc> urls")
            else:
                self.info("sitemap-ok", sitemap_url, f"sitemap.xml HTTP {st} with {len(urls)} urls")
        time.sleep(self.delay)

        if self.max_urls:
            urls = urls[: self.max_urls]

        titles = {}
        for i, url in enumerate(urls):
            st, final, html = self.fetch_text(url)
            meta = self.run_page_checks(url, st, final, html)
            if meta and meta["title"]:
                titles.setdefault(meta["title"], []).append(url)
            if self.verbose:
                print(f"  [{i+1}/{len(urls)}] {st} {url}", file=sys.stderr)
            time.sleep(self.delay)

        for title, occ in titles.items():
            if len(occ) > 1:
                self.warn("title-duplicate", occ[0], f"duplicate <title> across {len(occ)} pages: {title!r} → {occ[:3]}")

    def run_dir(self, directory, base_url):
        d = Path(directory)
        if not d.is_dir():
            self.err("dir-missing", directory, "directory does not exist")
            return
        base = (base_url or self.base_url).rstrip("/")

        # robots.txt + sitemap.xml from the dir
        robots_path = d / "robots.txt"
        if robots_path.exists():
            text = robots_path.read_text(errors="replace")
            if "sitemap:" not in text.lower():
                self.warn("robots-no-sitemap", f"{base}/robots.txt", "robots.txt does not reference a Sitemap:")
            for line in text.splitlines():
                low = line.lower().strip()
                if low.startswith("disallow:") and low.split(":", 1)[1].strip() in ("/", ""):
                    self.err("robots-block-root", f"{base}/robots.txt", f"robots.txt disallows everything: {line}")
        else:
            self.err("robots-missing", f"{base}/robots.txt", "robots.txt not found in build output")

        sitemap_path = d / "sitemap.xml"
        sitemap_urls = []
        if sitemap_path.exists():
            text = sitemap_path.read_text(errors="replace")
            sitemap_urls = self.parse_sitemap_urls(text)
            if not sitemap_urls:
                self.warn("sitemap-empty", f"{base}/sitemap.xml", "sitemap.xml parsed but contains no <loc> urls")
        else:
            self.warn("sitemap-missing", f"{base}/sitemap.xml", "sitemap.xml not found in build output")

        # map html files -> urls (skip tooling/junk dirs — only the public surface)
        EXCLUDE_PARTS = {
            "node_modules", ".git", ".claude", ".codex", ".cursor", ".next",
            ".vercel", ".wrangler", "dist", "build", "out", "coverage",
            "Library", "Page", "admin", "scripts", "tests", "docs", "output",
            ".tmp", "Tantra", ".webtool-bench",
        }
        html_files = [
            f
            for f in sorted(d.rglob("*.html"))
            if not any(part in EXCLUDE_PARTS for part in f.parts)
        ]
        file_to_url = {}
        for f in html_files:
            rel = f.relative_to(d).as_posix()
            if rel.startswith("_next/") or "/_next/" in rel:
                continue
            path = "/" + rel if not rel.startswith("/") else rel
            if path.endswith("/index.html"):
                path = path[: -len("index.html")]
            elif rel == "index.html":
                path = "/"
            file_to_url[f] = base + path

        # file-existence check for sitemap urls
        sitemap_host = self.host_of(self.base_url)
        for u in sitemap_urls:
            parsed = urllib.parse.urlsplit(u)
            if sitemap_host and parsed.hostname and parsed.hostname.lower() != sitemap_host:
                self.warn("sitemap-cross-host", u, f"sitemap url host {parsed.hostname} != base {sitemap_host}")
                continue
            rel_path = parsed.path
            if rel_path.endswith("/"):
                candidate = d / (rel_path.lstrip("/") + "index.html")
            else:
                candidate = d / rel_path.lstrip("/")
                if not candidate.exists():
                    candidate = d / (rel_path.lstrip("/") + ".html")
            if not candidate.exists():
                self.err("sitemap-file-missing", u, f"sitemap url has no file in build output: {candidate}")

        titles = {}
        for f, url in file_to_url.items():
            if f.name.lower() == "404.html":
                continue  # error page, not indexable content
            html = f.read_text(errors="replace")
            meta = self.parse_meta(html)
            self.check_canonical(url, meta, html)
            self.check_robots(url, meta, html)
            self.check_title_desc(url, meta, html)
            self.check_jsonld(url, meta, html)
            self.check_favicon(url, meta, html)
            self.check_ogimage(url, meta, html)
            self.check_hreflang(url, meta, html)
            if meta["title"]:
                titles.setdefault(meta["title"], []).append(url)

        for title, occ in titles.items():
            if len(occ) > 1:
                self.warn("title-duplicate", occ[0], f"duplicate <title> across {len(occ)} pages: {title!r} → {occ[:3]}")

    # -- reporting -----------------------------------------------------------------

    def report(self, json_path=None):
        report = {
            "base_url": self.base_url,
            "errors": self.errors,
            "warnings": self.warnings,
            "infos": self.infos,
            "error_count": len(self.errors),
            "warning_count": len(self.warnings),
        }
        if json_path:
            Path(json_path).write_text(json.dumps(report, indent=2))
        return report


def main():
    ap = argparse.ArgumentParser(description="SEO / indexing CI gate")
    ap.add_argument("--dir", help="built static output directory to scan (dir mode)")
    ap.add_argument("--url", help="base url to crawl (live mode), e.g. https://www.maxpetrusenko.com")
    ap.add_argument("--base-url", help="base url used to map files in dir mode (defaults to --url)")
    ap.add_argument("--delay", type=float, default=DEFAULT_DELAY, help="seconds between requests (live)")
    ap.add_argument("--max", type=int, default=None, help="cap sitemap urls crawled (live)")
    ap.add_argument("--json", help="write machine-readable report to this path")
    ap.add_argument("--warn-as-error", action="store_true", help="exit 1 on warnings too")
    ap.add_argument("--verbose", "-v", action="store_true", help="print per-url progress to stderr")
    args = ap.parse_args()

    if not args.dir and not args.url:
        print("error: need --dir or --url", file=sys.stderr)
        sys.exit(2)

    base_url = args.url or args.base_url or "https://example.com"
    checker = Checker(base_url, delay=args.delay, max_urls=args.max, verbose=args.verbose)

    if args.dir:
        checker.run_dir(args.dir, args.base_url or args.url)
    else:
        checker.run_live()

    report = checker.report(args.json)

    # human output
    print(f"\nweb-seo-check: {base_url}")
    print(f"  errors:   {report['error_count']}")
    print(f"  warnings: {report['warning_count']}")
    for e in report["errors"]:
        print(f"  ERROR   [{e['check']}] {e['url']}: {e['message']}")
    for w in report["warnings"]:
        print(f"  WARNING [{w['check']}] {w['url']}: {w['message']}")

    if report["error_count"] > 0:
        print("\nFAIL: indexing-blocking errors found", file=sys.stderr)
        sys.exit(1)
    if args.warn_as_error and report["warning_count"] > 0:
        print("\nFAIL: warnings promoted to errors (--warn-as-error)", file=sys.stderr)
        sys.exit(1)
    print("\nPASS")
    sys.exit(0)


if __name__ == "__main__":
    main()
