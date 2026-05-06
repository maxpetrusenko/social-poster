import {
  InstagramLoginProvider,
  InstagramPersonalProvider,
} from "../../lib/providers/instagram-personal";
import type { ProviderCredentials } from "../_shared/base-platform";
import type { PlatformPosting } from "../_shared/types";

export function createPosting(
  credentials: ProviderCredentials,
  variant: "business" | "personal" = "business"
): PlatformPosting {
  const provider =
    variant === "personal"
      ? new InstagramPersonalProvider(credentials)
      : new InstagramLoginProvider(credentials);

  return {
    supportedPostTypes: provider.supportedPostTypes,
    supportedMediaTypes: provider.supportedMediaTypes,
    maxCaptionLength: provider.maxCaptionLength,
    createPost: (t, c) => provider.publishPost(t, c),
  };
}
