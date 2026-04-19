import type { MetadataRoute } from "next";
import { getProductCanonicalUrl } from "@/lib/site-domains";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: [
          "/api/",
          "/auth/",
          "/dashboard/",
          "/invite/",
          "/login",
          "/health",
          "/social-accounts/",
        ],
      },
    ],
    sitemap: getProductCanonicalUrl("/sitemap.xml"),
  };
}
