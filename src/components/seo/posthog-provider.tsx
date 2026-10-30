"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import posthog from "posthog-js";
import { variantMap } from "@/lib/seo-flags";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
const EXPERIMENT = "seo-p1-2026-11";
const PRIVATE_PREFIXES = ["/dashboard", "/admin", "/api", "/auth", "/login", "/invite", "/social-accounts"];

const AI_HOSTS = [
  "chatgpt.com",
  "chat.openai.com",
  "perplexity.ai",
  "gemini.google.com",
  "copilot.microsoft.com",
  "claude.ai",
  "you.com",
  "phind.com",
  "meta.ai",
  "grok.com",
];
const SEARCH_HOSTS = ["google.", "bing.", "duckduckgo.", "yahoo.", "ecosia.", "search.brave.com"];
const SOCIAL_HOSTS = [
  "twitter.com",
  "x.com",
  "t.co",
  "facebook.com",
  "linkedin.com",
  "lnkd.in",
  "reddit.com",
  "instagram.com",
  "threads.net",
  "youtube.com",
  "news.ycombinator.com",
];

function hostMatches(host: string, needle: string) {
  return needle.endsWith(".") || needle.includes("/")
    ? host.includes(needle)
    : host === needle || host.endsWith(`.${needle}`);
}

export function classifyTraffic(referrer: string, search: string): string {
  const utm = new URLSearchParams(search).get("utm_source")?.toLowerCase() ?? "";
  if (/chatgpt|perplexity|openai/.test(utm)) return "ai_referral";
  if (!referrer) return "direct";
  let host = "";
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return "other";
  }
  if (AI_HOSTS.some((h) => hostMatches(host, h))) return "ai_referral";
  if (SEARCH_HOSTS.some((h) => hostMatches(host, h))) return "organic_search";
  if (SOCIAL_HOSTS.some((h) => hostMatches(host, h))) return "social";
  return "other";
}

function pageVariants(pathname: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, arm] of Object.entries(variantMap(pathname))) {
    out[`seo_${key}`] = arm;
  }
  return out;
}

let initialized = false;

export function PostHogProvider() {
  const pathname = usePathname();

  useEffect(() => {
    if (!KEY || PRIVATE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
      return;
    }
    if (!initialized) {
      posthog.init(KEY, {
        api_host: HOST,
        person_profiles: "identified_only",
        capture_pageview: false,
        disable_session_recording: true,
        autocapture: false,
      });
      posthog.register({ site: window.location.hostname, seo_experiment: EXPERIMENT });
      initialized = true;
    }
    posthog.register(pageVariants(pathname));
    posthog.capture("$pageview", {
      traffic_class: classifyTraffic(document.referrer, window.location.search),
    });
  }, [pathname]);

  return null;
}
