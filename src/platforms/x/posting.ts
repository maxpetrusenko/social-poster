import { TwitterProvider } from "../../lib/providers/twitter";
import type { ProviderCredentials } from "../_shared/base-platform";
import type { PlatformPosting } from "../_shared/types";

export function createPosting(credentials: ProviderCredentials): PlatformPosting {
  const provider = new TwitterProvider(credentials);
  return {
    supportedPostTypes: provider.supportedPostTypes,
    supportedMediaTypes: provider.supportedMediaTypes,
    maxCaptionLength: provider.maxCaptionLength,
    createPost: (t, c) => provider.publishPost(t, c),
  };
}
