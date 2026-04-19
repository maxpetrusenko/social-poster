import { PublishError } from "./errors";
import { LinkedInProvider } from "./linkedin";
import type { PublishContent } from "./types";

export class LinkedInCompanyProvider extends LinkedInProvider {
  platformName = "LinkedIn (Company Page)";
  requiredScopes = [
    "openid",
    "profile",
    "email",
    "w_member_social",
    "w_organization_social",
    "r_organization_social",
    "r_organization_admin",
  ];

  protected async resolveAuthor(
    _accessToken: string,
    content: PublishContent
  ): Promise<string> {
    const extra = content.extra ?? {};
    const author = readString(extra, "author") || readString(extra, "organizationUrn");
    if (author) return author;

    const organizationId =
      readString(extra, "organizationId") ||
      readString(extra, "companyId") ||
      readString(extra, "pageId");
    if (organizationId) return `urn:li:organization:${organizationId}`;

    throw new PublishError(
      "LinkedIn company publish requires content.extra.author or organizationId",
      { platform: this.platformName }
    );
  }
}

function readString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === "string" ? value : "";
}

export default LinkedInCompanyProvider;
