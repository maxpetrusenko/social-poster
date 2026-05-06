import type { ProviderCredentials, SocialProvider } from "./base";
import { FacebookProvider } from "./facebook";
import {
  InstagramLoginProvider,
  InstagramPersonalProvider,
} from "./instagram-personal";
import { ThreadsProvider } from "./threads";

export const metaProviderConstructors = {
  facebook: FacebookProvider,
  instagram: InstagramLoginProvider,
  instagram_personal: InstagramPersonalProvider,
  threads: ThreadsProvider,
} as const;

export type MetaProviderKey = keyof typeof metaProviderConstructors;

export function isMetaProviderKey(platform: string): platform is MetaProviderKey {
  return platform in metaProviderConstructors;
}

export function createMetaProvider(
  platform: MetaProviderKey,
  credentials: ProviderCredentials = {}
): SocialProvider {
  const Provider = metaProviderConstructors[platform];
  return new Provider(credentials);
}
