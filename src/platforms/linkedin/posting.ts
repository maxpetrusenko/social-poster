import { LinkedInPersonalProvider } from "../../lib/providers/linkedin-personal";
import { LinkedInCompanyProvider } from "../../lib/providers/linkedin-company";
import type { ProviderCredentials } from "../_shared/base-platform";
import type { PlatformPosting } from "../_shared/types";

export function createPosting(
  credentials: ProviderCredentials,
  variant: "personal" | "company" = "personal"
): PlatformPosting {
  const provider =
    variant === "company"
      ? new LinkedInCompanyProvider(credentials)
      : new LinkedInPersonalProvider(credentials);

  return {
    supportedPostTypes: provider.supportedPostTypes,
    supportedMediaTypes: provider.supportedMediaTypes,
    maxCaptionLength: provider.maxCaptionLength,
    createPost: (t, c) => provider.publishPost(t, c),
  };
}
