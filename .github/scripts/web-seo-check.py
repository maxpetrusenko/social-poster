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
  - robots.txt pointing `Sitemap:` at ANOTHER host (a crawler of this host is handed
    a different site's URL list) — measured on smmagent.app / smmclaw.app 2026-09-18
  - sitemap.xml listing URLs on another host
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

# Signatures of an edge/WAF block page (Cloudflare and friends), as opposed to a
# response the origin itself produced. Used to keep "we were blocked" from being
# reported as "the site has no sitemap" -- a false indexing error that makes a live
# check fail on every run and trains its reader to ignore it.
EDGE_BLOCK_MARKERS = (
    "sorry, you have been blocked",
    "attention required",
    "cloudflare ray id",
    "error code: 10",
    "just a moment",
    "enable javascript and cookies to continue",
)


def is_edge_block(body_text: str) -> bool:
    """True when a response body is an edge/WAF block page rather than origin content."""
    low = (body_text or "")[:4000].lower()
    return any(marker in low for marker in EDGE_BLOCK_MARKERS)
DEFAULT_DELAY = 0.25

# Registrable-domain approximation for the cross-host sitemap checks. A full public
# suffix list is not worth a dependency here: the comparison only ever *allows*
# things (same registrable domain = not a cross-host finding), so a conservative
# list can produce a missed finding on an exotic suffix but never a false failure.
MULTI_LABEL_TLDS = frozenset({
    "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk",
    "com.au", "net.au", "org.au",
    "co.nz", "net.nz", "org.nz",
    "co.jp", "co.in", "co.za", "co.il", "com.br", "com.mx", "com.sg", "com.tr",
})


def registrable_host(host: str) -> str:
    """www-stripped, port-stripped, two-label (or known 3-label) suffix of a host."""
    h = (host or "").split("/")[0].split(":")[0].lower().strip()
    if h.startswith("www."):
        h = h[4:]
    parts = h.split(".")
    if len(parts) < 3:
        return h
    if ".".join(parts[-2:]) in MULTI_LABEL_TLDS:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


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
        self._probe_cache = {}
        self.skip_sitemap_files = False

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

    def seo_key(self, url):
        """Route key for sitemap-membership tests.

        The static host serves BOTH `/page` and `/page.html`, and sitemap.xml
        lists the clean form while the built file is `<page>.html`, so a raw
        string/`same_page` comparison would never match. Strip the `.html`
        suffix and the trailing slash, exactly as the canonical check does.
        """
        return re.sub(r"\.html$", "", self.normalize(url).rstrip("/"))

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

    def probe_redirect(self, url):
        """First-hop status for a URL, WITHOUT following the redirect.

        urllib follows redirects unconditionally (the allow_redirects argument on
        fetch() was decorative), which is why a sitemap <loc> that 308s to its
        canonical form was scored as a clean 200 by every gate in this estate.
        Returns (status, location).
        """

        class _NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                return None  # do not follow; surface the 3xx as-is

        opener = urllib.request.build_opener(
            _NoRedirect(), urllib.request.HTTPSHandler(context=self.ctx)
        )
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
        try:
            resp = opener.open(req, timeout=TIMEOUT)
            return resp.status, (resp.headers.get("Location") or "")
        except urllib.error.HTTPError as e:
            return e.code, (e.headers.get("Location") or "")
        except Exception as e:
            return 0, f"probe failed: {e}"

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
            "viewport": None,
        }
        # title
        m = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
        if m:
            out["title"] = re.sub(r"\s+", " ", m.group(1)).strip()
        # viewport (mobile usability)
        m = re.search(r'<meta[^>]*name=["\']viewport["\'][^>]*>', html, re.I)
        if m:
            c = re.search(r'content=["\']([^"\']+)["\']', m.group(0), re.I)
            out["viewport"] = c.group(1) if c else ""
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
        """Checks 1-3: canonical present, self-referencing, no chain.

        A page deliberately excluded from indexing has no canonical to check.
        `noindex` is the stronger directive -- Google drops the URL regardless of
        what a canonical says -- and the sitemap-membership check already reports
        these as `noindex-unlisted ... correctly absent from sitemap`, so requiring
        one contradicted this tool's own classification and produced an
        error-band finding on pages behaving correctly. Since canonical-missing
        blocks a deploy, that contradiction stopped a real deploy.
        """
        noindex = any("noindex" in r for r in meta.get("robots", []) or [])
        if noindex:
            self.info(
                "canonical-skipped-noindex", url,
                "page is noindex, so no canonical was required (a canonical is a hint for "
                "indexable duplicates; noindex is the stronger directive and wins)",
            )
            return
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

    def check_robots(self, url, meta, html="", in_sitemap=True):
        """Check 4: no noindex on sitemap URLs.

        The rule is the CONFLICT, not the noindex: a page that says `noindex`
        AND is listed in sitemap.xml can never index, so the sitemap is lying.
        A page that says `noindex` and is NOT in the sitemap is the correct way
        to keep a page out of the index, and is not a finding.

        This used to fire on any noindex page at all -- `in_sitemap` did not
        exist -- so the message named a condition the code never tested, and the
        only escape was adding the route's directory to run_dir's
        EXCLUDE_PARTS. That made the gate red for every legitimately unlisted
        page: correctly "remove the page from the sitemap AND noindex it"
        turned this gate from green to red even though the page was no longer in
        sitemap.xml. Live mode still defaults to True because it only ever
        crawls URLs read out of the sitemap.

        Mirrored from TantraStudio's .github/scripts/web-seo-check.py commit
        873aa99 ("fix(seo): noindex check must test sitemap membership"), which
        is where the defect was found.
        """
        noindex = False
        for r in meta["robots"]:
            if "noindex" in r:
                noindex = True
        if not noindex:
            return
        if in_sitemap:
            self.err("noindex", url, "page has robots noindex but is in sitemap — will never index")
        else:
            self.info(
                "noindex-unlisted",
                url,
                "page has robots noindex and is correctly absent from sitemap.xml — not a finding",
            )

    def check_robots_sitemap_hosts(self, body, robots_url, base):
        """Check 6b: a `Sitemap:` line must describe the site being crawled.

        Measured 2026-09-18: smmagent.app and smmclaw.app (two brands served by one
        Next.js app whose robots route read the *product* canonical) each advertised
        https://clawposter.app/sitemap.xml. A crawler on smmagent.app is then handed
        another host's URL list: the host's own pages are only discovered by link
        following, and the crawler spends its budget on URLs that belong to a
        different brand. Nothing else in this checker looked at the host of the
        declared sitemap, so a green run proved nothing about it.

        Host comparison is on the registrable domain, not the exact host, because a
        legitimate site may serve robots on the apex and advertise the www sitemap
        (the checker is often invoked with one and the site canonicalises to the
        other). Comparing the exact host would make that a false failure; comparing
        the registrable domain still catches the cross-brand case.
        """
        base_host = self.host_of(base)
        declared = [
            line.split(":", 1)[1].strip()
            for line in body.splitlines()
            if line.lower().strip().startswith("sitemap:")
        ]
        if not declared:
            return
        base_site = registrable_host(base_host)
        for sm in declared:
            if not sm.startswith(("http://", "https://")):
                self.err("robots-sitemap-relative", robots_url, f"Sitemap: must be an absolute URL: {sm}")
                continue
            if registrable_host(self.host_of(sm)) != base_site:
                self.err(
                    "robots-sitemap-crosshost",
                    robots_url,
                    f"Sitemap: points at {self.host_of(sm)}, not {base_host} — crawlers of {base_host} are "
                    f"handed another site's URL list: {sm}",
                )
            else:
                self.info("robots-sitemap-host-ok", robots_url, f"Sitemap: on {base_host}")

    def check_sitemap_hosts(self, urls, sitemap_url, base):
        """Check 6c: sitemap <loc> hosts must live on the site being crawled.

        The mirror of 6b: a sitemap that lists another brand's URLs makes the search
        console property show indexed pages the operator does not own, and the
        property's own URLs stay undiscovered. Registrable-domain comparison for the
        same apex/www reason as 6b.
        """
        base_site = registrable_host(self.host_of(base))
        foreign = {}
        for u in urls:
            host = self.host_of(u)
            if not host or registrable_host(host) == base_site:
                continue
            foreign.setdefault(host, []).append(u)
        for host, sample in sorted(foreign.items()):
            self.err(
                "sitemap-url-crosshost",
                sitemap_url,
                f"{len(sample)} sitemap URL(s) are on {host}, not {base} — e.g. {sample[0]}",
            )

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

    def check_favicon(self, url, meta, html="", local_dir=None):
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
            is_png_ico = ".png" in href or ".ico" in href or "image/x-icon" in typ or "png" in typ
            if not is_png_ico:
                continue
            size = 0
            if f["sizes"] and "x" in f["sizes"]:
                try:
                    w, h = f["sizes"].split("x")[:2]
                    size = min(int(w), int(h))
                except Exception:
                    size = 0
            if size == 0:
                # No declared sizes — read the real image dimensions so we
                # don't flag a valid 1024px PNG or multi-size .ico.
                size = self.probe_image_size(f["href"], local_dir=local_dir)
            largest = max(largest, size)
            # Absolute cross-domain href in dir mode can't be probed without
            # network — presence of a PNG/ICO link is accepted; live mode
            # verifies the actual size.
            if size >= 48 or (size == 0 and local_dir is not None and href.startswith(("http://", "https://"))):
                has_png_ico = True
        if not has_png_ico:
            self.err(
                "favicon-svg-only",
                url,
                f"no PNG/ICO favicon >=48px (largest PNG/ICO: {largest}px) — Google SERP shows default icon",
            )

    def probe_image_size(self, href, local_dir=None):
        """Read real PNG/ICO dimensions. Returns 0 if unknown/failed.
        dir mode (local_dir set): read the local file, no network.
        live mode: fetch the url once.
        """
        cached = self._probe_cache.get(href)
        if cached is not None:
            return cached
        # local-first: relative href resolved under local_dir
        if local_dir is not None and not href.startswith(("http://", "https://")):
            path = (local_dir / href.lstrip("/")).resolve()
            try:
                if path.is_file():
                    return self._image_dimensions(path.read_bytes())
            except Exception:
                return 0
        data = None
        if href.startswith(("http://", "https://")):
            try:
                status, final, headers, body = self.fetch(href)
                if status == 200:
                    data = body
            except Exception:
                return 0
        else:
            # relative — resolve against base_url
            try:
                abs_url = urllib.parse.urljoin(self.base_url, href)
                status, final, headers, body = self.fetch(abs_url)
                if status == 200:
                    data = body
            except Exception:
                return 0
        if not data:
            return 0
        dim = self._image_dimensions(data)
        self._probe_cache[href] = dim
        return dim

    def _image_dimensions(self, data):
        """PNG: bytes 16-24 = width,height (big endian). ICO: header entries."""
        if len(data) < 24:
            return 0
        if data[:8] == b"\x89PNG\r\n\x1a\n":
            w = int.from_bytes(data[16:20], "big")
            h = int.from_bytes(data[20:24], "big")
            return min(w, h) if w and h else 0
        if data[:4] == b"\x00\x00\x01\x00":  # ICO
            count = data[4]
            if count == 0:
                return 0
            # first entry at offset 6: width byte, height byte (0 means 256)
            w = data[6] or 256
            h = data[7] or 256
            return min(w, h)
        return 0

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

    def check_mobile_usability(self, url, meta, html=""):
        """Mobile usability: viewport meta present + width=device-width.
        Without it Google treats the page as desktop-only and may demote it.
        """
        vp = meta.get("viewport")
        if vp is None:
            self.err("mobile-viewport-missing", url, "no viewport meta — page is not mobile-friendly")
        elif "width=device-width" not in vp:
            self.err("mobile-viewport-wrong", url, f"viewport meta lacks width=device-width: {vp!r}")
        elif "initial-scale=1" not in vp and "initial-scale = 1" not in vp:
            self.warn("mobile-viewport-scale", url, f"viewport meta lacks initial-scale=1: {vp!r}")

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
        self.check_mobile_usability(url, meta, html)
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
            self.check_robots_sitemap_hosts(text, robots_url, base)
            self.info("robots-ok", robots_url, f"robots.txt HTTP {st}")
        time.sleep(self.delay)

        # sitemap.xml
        sitemap_url = f"{base}/sitemap.xml"
        st, final, sitemap_headers, sitemap_body = self.fetch(sitemap_url)
        text = sitemap_body.decode("utf-8", errors="replace") if sitemap_body else ""
        # case-insensitive: Cloudflare sends CF-RAY, urllib preserves the sent casing,
        # and a lookup that misses puts "?" in the one line that exists to carry evidence
        ray = next((v for k, v in (sitemap_headers or {}).items() if k.lower() == "cf-ray"), "?")
        urls = []
        if st == 0:
            self.err("sitemap-fetch", sitemap_url, "network error fetching sitemap.xml")
        elif st in (401, 403, 429) and is_edge_block(text):
            # A WAF/edge block aimed at the machine running this check is NOT the claim
            # "this site has no sitemap". Reported as an observation carrying its own
            # evidence, because the content genuinely could not be read -- and saying so
            # is the honest outcome, not a pass. Observed in practice: GitHub Actions
            # runner IPs get 403 from Cloudflare while the same request with the same
            # user-agent returns 200 from a residential IP (verified 2026-09-12).
            self.info(
                "sitemap-edge-blocked", sitemap_url,
                f"sitemap.xml HTTP {st} blocked at the edge (cf-ray {ray}); "
                f"sitemap content NOT verified by this run -- robots.txt was reachable, so this is most "
                f"likely bot protection against the fetching host rather than a missing sitemap",
            )
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

        if urls:
            self.check_sitemap_hosts(urls, sitemap_url, base)

        titles = {}
        for i, url in enumerate(urls):
            st, final, html = self.fetch_text(url)
            # A sitemap must list the URL that returns 200, never one that redirects.
            # Google files a redirecting <loc> as "Page with redirect" and can leave the
            # destination unindexed, which is how southfloridaqigong.com carried three such
            # URLs (all 308 -> trailing-slash form) through every gate in this estate:
            # fetch() follows redirects, so the destination's 200 looked like the <loc>'s.
            # final != url is already proof of a redirect (geturl() returns the request url
            # verbatim when nothing was followed); the probe only supplies the status code
            # as evidence, so it is not required to be conclusive.
            if final and final != url:
                rst, rloc = self.probe_redirect(url)
                code_txt = f"HTTP {rst} " if 300 <= rst < 400 else ""
                self.err(
                    "sitemap-url-redirect", url,
                    f"sitemap url {code_txt}redirects to {rloc or final}; a sitemap must list the "
                    f"200 url, not one that redirects (Google reports 'Page with redirect')",
                )
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
            self.check_robots_sitemap_hosts(text, f"{base}/robots.txt", base)
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
                self.check_sitemap_hosts(sitemap_urls, f"{base}/sitemap.xml", base)
        else:
            self.warn("sitemap-missing", f"{base}/sitemap.xml", "sitemap.xml not found in build output")

        # map html files -> urls (skip tooling/junk dirs — only the public surface)
        EXCLUDE_PARTS = {
            "node_modules", ".git", ".claude", ".codex", ".cursor", ".next",
            ".vercel", ".wrangler", "dist", "build", "out", "coverage",
            "Library", "Page", "admin", "scripts", "tests", "docs", "output",
            ".tmp", "Tantra", ".webtool-bench",
        }
        # Exclusions are matched against the path RELATIVE to the scanned directory, never
        # the absolute path. Matching on f.parts meant a build dir that is itself named
        # dist/out/build — or that sits under .vercel/output — excluded every file inside
        # it, so the scan found nothing and reported PASS. Measured 2026-09-19: a page with
        # no canonical at all, under a path containing .vercel/output, scored 0 errors /
        # 0 warnings while the same fixture at a neutral path scored 3 errors. That is how
        # `--dir nextjs/.vercel/output/static` (maxpetrusenko.com) and `--dir dist`
        # (southfloridaqigong) both scanned zero pages with a green result.
        html_files = [
            f
            for f in sorted(d.rglob("*.html"))
            if not any(part in EXCLUDE_PARTS for part in f.relative_to(d).parts)
        ]
        if not html_files:
            # A dir-mode gate that examined nothing must never look like a pass. This is
            # the estate rule "routes_checked > 0"; without it a path typo or an
            # over-broad exclusion silently retires the whole check.
            self.err(
                "dir-empty", str(d),
                f"no html files found under {d} after exclusions — this gate verified "
                f"NOTHING and must not pass; check the --dir path and EXCLUDE_PARTS",
            )
        else:
            self.info("dir-surface", str(d), f"scanning {len(html_files)} html file(s)")
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
        # (skip with --skip-sitemap-files: Next.js/worker builds don't mirror
        #  every route as a flat file; live mode verifies sitemap URLs instead)
        sitemap_host = self.host_of(self.base_url)
        if not self.skip_sitemap_files:
            for u in sitemap_urls:
                parsed = urllib.parse.urlsplit(u)
                if sitemap_host and parsed.hostname and parsed.hostname.lower() != sitemap_host:
                    self.warn("sitemap-cross-host", u, f"sitemap url host {parsed.hostname} != base {sitemap_host}")
                    continue
                rel_path = parsed.path
                candidates = []
                if rel_path.endswith("/"):
                    candidates = [d / (rel_path.lstrip("/") + "index.html")]
                else:
                    candidates = [
                        d / rel_path.lstrip("/"),
                        d / (rel_path.lstrip("/") + ".html"),
                        d / (rel_path.lstrip("/") + "/index.html"),
                    ]
                if not any(c.exists() for c in candidates):
                    self.err("sitemap-file-missing", u, f"sitemap url has no file in build output: {candidates[0]}")

        titles = {}
        # Membership test for check 4: the sitemap lists clean URLs, the build
        # has <page>.html files, so compare normalized route keys.
        sitemap_keys = {self.seo_key(u) for u in sitemap_urls}
        for f, url in file_to_url.items():
            if f.name.lower() == "404.html":
                continue  # error page, not indexable content
            html = f.read_text(errors="replace")
            meta = self.parse_meta(html)
            self.check_canonical(url, meta, html)
            self.check_robots(url, meta, html, in_sitemap=self.seo_key(url) in sitemap_keys)
            self.check_title_desc(url, meta, html)
            self.check_soft404(url, meta, html)
            self.check_jsonld(url, meta, html)
            self.check_favicon(url, meta, html, local_dir=d)
            self.check_ogimage(url, meta, html)
            self.check_mobile_usability(url, meta, html)
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
    ap.add_argument("--skip-sitemap-files", action="store_true",
                    help="dir mode: do not check that every sitemap URL has a flat file "
                         "(use for Next.js/worker builds — live mode verifies sitemap URLs)")
    ap.add_argument("--verbose", "-v", action="store_true", help="print per-url progress to stderr")
    args = ap.parse_args()

    if not args.dir and not args.url:
        print("error: need --dir or --url", file=sys.stderr)
        sys.exit(2)

    base_url = args.url or args.base_url or "https://example.com"
    checker = Checker(base_url, delay=args.delay, max_urls=args.max, verbose=args.verbose)
    checker.skip_sitemap_files = args.skip_sitemap_files

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
    # Infos are printed too. A SKIP that the reader cannot see is indistinguishable
    # from a rule that silently stopped running — the same failure mode the
    # noindex check above was quietly committing. `noindex-unlisted` in particular
    # is the line that explains why a noindex page passing this gate is correct.
    for i in report["infos"]:
        print(f"  INFO    [{i['check']}] {i['url']}: {i['message']}")

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
