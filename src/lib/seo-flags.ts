import config from "../../seo-flags.json";

export type SeoFlagKey = keyof typeof config.flags;
export type SeoArm = "variant" | "control" | "site" | "none";

type FlagDef = { scope: string; enabled: boolean; split?: number };

export const SEO_EXPERIMENT = config.experiment;

/** Lowercase, no query/hash, no trailing slash except "/". */
export function normalizePath(path: string): string {
  const bare = path.split(/[?#]/)[0].toLowerCase();
  const trimmed = bare.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Site-scope flag state. */
export function isSiteFlagOn(key: SeoFlagKey): boolean {
  return (config.flags[key] as FlagDef).enabled === true;
}

/** Deterministic build/server-time page assignment. "/" is always control. */
export function isVariant(key: SeoFlagKey, path: string): boolean {
  const flag = config.flags[key] as FlagDef;
  const normalized = normalizePath(path);
  if (!flag.enabled || flag.scope !== "page" || normalized === "/") return false;
  return fnv1a32(`${key}:${normalized}`) % 100 < (flag.split ?? 0) * 100;
}

const SHORT: Record<SeoFlagKey, string> = {
  seo_h005_ai_crawlers: "h005",
  seo_h021_indexing: "h021",
  seo_h003_titles: "h003",
  seo_h013_keyword_placement: "h013",
  seo_h014_tldr: "h014",
  seo_h015_open_faq: "h015",
  seo_h022_internal_links: "h022",
  seo_h006: "h006",
};

const CORE_PAGES = ["/social-media-bot", "/docs", "/blog"];

/** Paths where each page flag actually renders a treatment. Others report "none". */
function isTreatedPath(key: SeoFlagKey, normalized: string): boolean {
  if (key === "seo_h022_internal_links") {
    return CORE_PAGES.includes(normalized) || (normalized.startsWith("/blog/") &&
        !normalized.startsWith("/blog/category/"))
  }
  if (
    key === "seo_h003_titles" ||
    key === "seo_h013_keyword_placement" ||
    key === "seo_h014_tldr"
  ) {
    return CORE_PAGES.includes(normalized);
  }
  return false;
}

export function variantMap(path: string): Record<string, SeoArm> {
  const normalized = normalizePath(path);
  const out: Record<string, SeoArm> = {};
  for (const key of Object.keys(SHORT) as SeoFlagKey[]) {
    const def = config.flags[key] as FlagDef;
    out[SHORT[key]] =
      def.scope === "site"
        ? "site"
        : !def.enabled || !isTreatedPath(key, normalized)
          ? "none"
          : isVariant(key, normalized)
            ? "variant"
            : "control";
  }
  return out;
}

/** Content for <meta name="seo-variants">, e.g. "h003=v;h013=c;h005=s". */
export function variantMetaContent(path: string): string {
  const letter = { variant: "v", control: "c", site: "s", none: "n" } as const;
  return Object.entries(variantMap(path))
    .map(([k, v]) => `${k}=${letter[v]}`)
    .join(";");
}
