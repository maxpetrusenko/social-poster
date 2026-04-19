import { LinkedInProvider } from "./linkedin";

export class LinkedInPersonalProvider extends LinkedInProvider {
  platformName = "LinkedIn (Personal)";
  requiredScopes = ["openid", "profile", "email", "w_member_social"];
}

export default LinkedInPersonalProvider;
