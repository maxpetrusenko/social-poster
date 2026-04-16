import { LinkedInProvider } from "./linkedin";

export class LinkedInPersonalProvider extends LinkedInProvider {
  platformName = "LinkedIn (Personal)";
  requiredScopes = ["r_basicprofile", "w_member_social", "r_member_social"];
}

export default LinkedInPersonalProvider;
