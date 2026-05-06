import { OAuthError, PublishError } from "./errors";
import { LinkedInProvider } from "./linkedin";
import type { AccountProfile, PublishContent } from "./types";

const API_BASE = "https://api.linkedin.com";
const LINKEDIN_API_VERSION = process.env.LINKEDIN_API_VERSION?.trim() || "202604";
const LINKEDIN_HEADERS = {
  "LinkedIn-Version": LINKEDIN_API_VERSION,
  "X-Restli-Protocol-Version": "2.0.0",
};

type JsonRecord = Record<string, unknown>;

export class LinkedInCompanyProvider extends LinkedInProvider {
  platformName = "LinkedIn (Company Page)";
  requiredScopes = [
    "openid",
    "profile",
    "email",
    "w_member_social",
    "w_organization_social",
    "r_organization_social",
    "rw_organization_admin",
  ];

  async getProfile(accessToken: string): Promise<AccountProfile> {
    const memberProfile = await super.getProfile(accessToken);
    const organizations = await this.getPostableOrganizations(accessToken);
    const organization = organizations[0];

    if (!organization) {
      throw new OAuthError(
        "LinkedIn Page connection requires a company page where the signed-in member has admin access.",
        { platform: this.platformName }
      );
    }

    return {
      platformId: organization.urn,
      name: organization.name || `LinkedIn Page ${organization.id}`,
      handle: organization.vanityName || undefined,
      avatarUrl: organization.logoUrl || undefined,
      extra: {
        memberProfile,
        organization,
        organizations,
      },
    };
  }

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

  private async getPostableOrganizations(accessToken: string) {
    try {
      return await this.getAuthorizedOrganizations(accessToken);
    } catch {
      return this.getAdminOrganizations(accessToken);
    }
  }

  private async getAuthorizedOrganizations(accessToken: string) {
    const body = await this.requestJson<JsonRecord>(
      "GET",
      `${API_BASE}/rest/organizationAuthorizations`,
      {
        accessToken,
        headers: LINKEDIN_HEADERS,
        params: {
          bq: "authorizationActionsAndImpersonator",
          authorizationActions:
            "List((authorizationAction:(organizationContentAuthorizationAction:(actionType:ORGANIC_SHARE_CREATE))))",
        },
      }
    );

    const organizationUrns = readOrganizationAuthorizationUrns(body);
    return Promise.all(
      organizationUrns.map((urn) => this.getOrganizationProfile(accessToken, urn))
    );
  }

  private async getAdminOrganizations(accessToken: string) {
    const body = await this.requestJson<JsonRecord>(
      "GET",
      `${API_BASE}/rest/organizationAcls`,
      {
        accessToken,
        headers: LINKEDIN_HEADERS,
        params: {
          q: "roleAssignee",
          role: "ADMINISTRATOR",
          state: "APPROVED",
        },
      }
    );

    const elements = Array.isArray(body.elements) ? body.elements : [];
    const organizationUrns = Array.from(
      new Set(
        elements
          .map((item) =>
            item && typeof item === "object" && !Array.isArray(item)
              ? readString(item as Record<string, unknown>, "organization")
              : ""
          )
          .filter(Boolean)
      )
    );

    return Promise.all(
      organizationUrns.map((urn) => this.getOrganizationProfile(accessToken, urn))
    );
  }

  private async getOrganizationProfile(accessToken: string, urn: string) {
    const id = urn.split(":").pop() || urn;
    const body = await this.requestJson<JsonRecord>(
      "GET",
      `${API_BASE}/rest/organizations/${encodeURIComponent(id)}`,
      {
        accessToken,
        headers: LINKEDIN_HEADERS,
      }
    );

    return {
      id,
      urn,
      name:
        readLocalizedName(body) ||
        readString(body, "localizedName") ||
        readString(body, "name"),
      vanityName: readString(body, "vanityName"),
      logoUrl: readLogoUrl(body),
      raw: body,
    };
  }
}

function readOrganizationAuthorizationUrns(source: JsonRecord) {
  const outerElements = Array.isArray(source.elements) ? source.elements : [];
  const urns: string[] = [];

  for (const outer of outerElements) {
    if (!outer || typeof outer !== "object" || Array.isArray(outer)) continue;
    const innerElements = Array.isArray((outer as JsonRecord).elements)
      ? ((outer as JsonRecord).elements as unknown[])
      : [];

    for (const inner of innerElements) {
      if (!inner || typeof inner !== "object" || Array.isArray(inner)) continue;
      const record = inner as JsonRecord;
      if (!isApprovedAuthorization(record.status)) continue;
      const organization = readString(record, "organization");
      if (organization) urns.push(organization);
    }
  }

  return Array.from(new Set(urns));
}

function isApprovedAuthorization(status: unknown) {
  if (!status || typeof status !== "object" || Array.isArray(status)) {
    return false;
  }

  return Object.keys(status).some((key) => key.endsWith(".Approved"));
}

function readString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === "string" ? value : "";
}

function readLocalizedName(source: Record<string, unknown>) {
  const localizedName = source.localizedName;
  if (typeof localizedName === "string") return localizedName;

  const localized =
    source.localizedName && typeof source.localizedName === "object"
      ? (source.localizedName as Record<string, unknown>)
      : null;
  if (!localized) return "";

  for (const value of Object.values(localized)) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

function readLogoUrl(source: Record<string, unknown>) {
  const logoV2 = source.logoV2;
  if (!logoV2 || typeof logoV2 !== "object" || Array.isArray(logoV2)) {
    return "";
  }

  const original = (logoV2 as Record<string, unknown>).original;
  return typeof original === "string" ? original : "";
}

export default LinkedInCompanyProvider;
