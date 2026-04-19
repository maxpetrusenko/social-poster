import {
  passwordField,
  textField,
  textareaField,
  type ConnectionPlatformDefinition,
} from "../_shared/connection-config";

export const connectionDefinition: ConnectionPlatformDefinition = {
  type: "reddit",
  label: "Reddit",
  category: "community",
  summary: "OAuth app or custom workflow depending on subreddit access.",
  capabilities: [],
  futureCapabilities: ["posting", "comments", "engagement"],
  methods: [
    {
      id: "reddit_custom",
      label: "Reddit app credentials",
      provider: "direct",
      authType: "manual",
      description:
        "Use for subreddit-specific posting where you control the app and account.",
      recommendation:
        "Use for controlled Reddit workflows and subreddit-bound publishing.",
      infoTooltip: {
        title: "Reddit app credentials",
        bullets: [
          "Best for controlled accounts where subreddit rules are known upfront.",
          "Requires a refresh token and careful per-subreddit operator notes.",
          "Full connector work belongs in Phase 6 with comments and moderation tools.",
        ],
        learnMoreUrl: "https://www.reddit.com/dev/api/",
      },
      fields: [
        textField("displayName", "Connection name", "Reddit Main"),
        textField("handle", "Username or subreddit", "u/max or r/yourcommunity"),
        passwordField("clientId", "Client ID", "Paste Reddit app client ID"),
        passwordField("clientSecret", "Client secret", "Paste Reddit client secret"),
        passwordField("refreshToken", "Refresh token", "Paste Reddit refresh token"),
        textareaField(
          "customInstructions",
          "Operator instructions",
          "Subreddit rules, flair requirements, anti-spam notes"
        ),
      ],
      docs: [
        {
          label: "Reddit app preferences",
          url: "https://www.reddit.com/prefs/apps",
        },
        { label: "Reddit API docs", url: "https://www.reddit.com/dev/api/" },
      ],
    },
  ],
};

export const connectionDefinitions = [connectionDefinition];
