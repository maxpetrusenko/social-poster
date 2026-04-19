import { ThreadsProvider } from "../../lib/providers/threads";
import type { ProviderCredentials } from "../_shared/base-platform";
import type { PlatformPosting } from "../_shared/types";

export function createPosting(credentials: ProviderCredentials): PlatformPosting {
  const provider = new ThreadsProvider(credentials);
  return {
    supportedPostTypes: provider.supportedPostTypes,
    supportedMediaTypes: provider.supportedMediaTypes,
    maxCaptionLength: provider.maxCaptionLength,
    createPost: (t, c) => provider.publishPost(t, c),
  };
}
