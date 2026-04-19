"""
OAuth Portal URI Configurator
Extracts cookies from Brave, injects into rebrowser-playwright (stealth),
navigates to developer portals to add redirect URIs.

Usage: python3 scripts/oauth-portals/configure.py [facebook|google|tiktok|pinterest|all]

Approach:
1. pycookiecheat reads Brave's encrypted cookie DB (read-only, no logout)
2. rebrowser-playwright launches stealth Chromium with separate profile per platform
3. Cookies injected into fresh context — main browser untouched
4. Each platform profile persists in scripts/oauth-portals/profiles/<platform>/
"""

import asyncio
import json
import os
import sys
from pathlib import Path

from pycookiecheat import chrome_cookies

SCRIPT_DIR = Path(__file__).parent
PROFILES_DIR = SCRIPT_DIR / "profiles"
PROFILES_DIR.mkdir(exist_ok=True)

CALLBACK_URIS = [
    "http://localhost:3000/api/auth/callback",
    "https://social.maxpetrusenko.com/api/auth/callback",
]

PORTALS = {
    "facebook": {
        "url": "https://developers.facebook.com/apps/2361497637361022/fb-login/settings/",
        "cookie_domains": [
            "https://developers.facebook.com",
            "https://www.facebook.com",
            "https://facebook.com",
        ],
        "field": "Valid OAuth Redirect URIs",
    },
    "google": {
        "url": "https://console.cloud.google.com/apis/credentials?project=mysocialmanager",
        "cookie_domains": [
            "https://console.cloud.google.com",
            "https://accounts.google.com",
            "https://google.com",
        ],
        "field": "Authorized redirect URIs",
    },
    "tiktok": {
        "url": "https://developers.tiktok.com/",
        "cookie_domains": [
            "https://developers.tiktok.com",
            "https://www.tiktok.com",
            "https://tiktok.com",
        ],
        "field": "Redirect URI (prod only, no localhost)",
    },
    "pinterest": {
        "url": "https://developers.pinterest.com/",
        "cookie_domains": [
            "https://developers.pinterest.com",
            "https://www.pinterest.com",
            "https://pinterest.com",
        ],
        "field": "Redirect URIs",
    },
}


def extract_brave_cookies(domains: list[str]) -> list[dict]:
    """Read cookies from Brave for given domains. Read-only, no side effects."""
    pw_cookies = []
    seen = set()
    for url in domains:
        try:
            raw = chrome_cookies(url, browser="brave", cookie_file=None)
            for name, value in raw.items():
                key = f"{name}={value}"
                if key not in seen:
                    seen.add(key)
                    from urllib.parse import urlparse
                    domain = urlparse(url).hostname
                    pw_cookies.append({
                        "name": name,
                        "value": value,
                        "domain": f".{domain}",
                        "path": "/",
                        "httpOnly": False,
                        "secure": url.startswith("https"),
                        "sameSite": "None",
                    })
        except Exception as e:
            print(f"  Cookie extraction failed for {url}: {e}")
    return pw_cookies


async def open_portal(platform: str, interactive: bool = True):
    """Open a developer portal with stealth browser + Brave cookies."""
    from rebrowser_playwright.async_api import async_playwright

    config = PORTALS[platform]
    profile_dir = str(PROFILES_DIR / platform)

    print(f"\n{'='*60}")
    print(f"Platform: {platform}")
    print(f"Portal: {config['url']}")
    print(f"Field: {config['field']}")
    print(f"URIs to add:")
    for uri in CALLBACK_URIS:
        if platform == "tiktok" and "localhost" in uri:
            print(f"  SKIP {uri} (TikTok rejects localhost)")
        else:
            print(f"  + {uri}")
    print(f"{'='*60}")

    # Check for saved auth state first
    state_file = PROFILES_DIR / f"{platform}_state.json"
    has_saved_state = state_file.exists()

    if not has_saved_state:
        print(f"Extracting Brave cookies (first run)...")
        cookies = extract_brave_cookies(config["cookie_domains"])
        print(f"  Got {len(cookies)} cookies")
    else:
        cookies = []
        print(f"  Using saved auth state from {state_file.name}")

    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            user_data_dir=profile_dir,
            headless=False,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-first-run",
                "--no-default-browser-check",
            ],
            ignore_default_args=["--enable-automation"],
            viewport={"width": 1400, "height": 900},
            locale="en-US",
        )

        page = ctx.pages[0] if ctx.pages else await ctx.new_page()

        # Inject cookies (Brave extract or saved state)
        if has_saved_state:
            with open(state_file) as f:
                state = json.load(f)
            if state.get("cookies"):
                await ctx.add_cookies(state["cookies"])
                print(f"  Loaded {len(state['cookies'])} saved cookies")
        elif cookies:
            await ctx.add_cookies(cookies)
            print(f"  Injected {len(cookies)} Brave cookies")

        # Navigate
        print(f"Navigating to {config['url']}...")
        await page.goto(config["url"], wait_until="domcontentloaded", timeout=30000)
        await asyncio.sleep(3)

        title = await page.title()
        url = page.url
        print(f"  Title: {title}")
        print(f"  URL: {url}")

        # Detect actual login gates (not URL path names like "fb-login")
        login_indicators = await page.query_selector_all('input[type="password"], form[action*="login"], #loginform')
        login_needed = bool(login_indicators) or "accounts.google.com/v3/signin" in url
        if login_needed:
            print(f"  STATUS: Login page detected — log in manually in the browser window")
        else:
            print(f"  STATUS: Authenticated")
            await page.screenshot(path=str(SCRIPT_DIR / f"{platform}_portal.png"))
            print(f"  Screenshot: scripts/oauth-portals/{platform}_portal.png")

        if interactive and sys.stdin.isatty():
            print(f"\nBrowser open. Add URIs manually, then press Enter here to close...")
            await asyncio.get_event_loop().run_in_executor(None, input)
        else:
            # Non-interactive: keep open 60s for inspection
            print("  Non-interactive mode — closing in 5s...")
            await asyncio.sleep(5)

        # Save auth state for future runs
        state_file = str(PROFILES_DIR / f"{platform}_state.json")
        try:
            state = await ctx.storage_state()
            with open(state_file, "w") as f:
                json.dump(state, f)
            print(f"  Saved auth state: {state_file}")
        except Exception as e:
            print(f"  Could not save state: {e}")

        await ctx.close()
        print(f"  Done: {platform}")


async def main():
    targets = sys.argv[1:] if len(sys.argv) > 1 else ["all"]

    if "all" in targets:
        targets = list(PORTALS.keys())

    for t in targets:
        if t not in PORTALS:
            print(f"Unknown platform: {t}. Options: {', '.join(PORTALS.keys())}")
            continue
        await open_portal(t, interactive=True)


if __name__ == "__main__":
    asyncio.run(main())
