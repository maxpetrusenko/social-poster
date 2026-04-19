import { PinterestProvider } from "../../lib/providers/pinterest";
import type { ProviderCredentials } from "../_shared/base-platform";
import type { PlatformPosting } from "../_shared/types";

export function createPosting(credentials: ProviderCredentials): PlatformPosting {
  const provider = new PinterestProvider(credentials);
  return {
    supportedPostTypes: provider.supportedPostTypes,
    supportedMediaTypes: provider.supportedMediaTypes,
    maxCaptionLength: provider.maxCaptionLength,
    createPost: (t, c) => provider.publishPost(t, c),
  };
}
