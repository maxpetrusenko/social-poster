# Hypefury Deep Crawl Reference

> Comprehensive product teardown of Hypefury (hypefury.com / app.hypefury.com)
> Crawled: April 2026 | Founded: 2019 | Founders: Yannick Veys & Samy Dindane

---

## 1. Full Site Map

### Marketing Site (hypefury.com)

```
hypefury.com/
  /                           Home - hero + social proof + feature overview
  /features-pricing           Pricing tiers + feature comparison matrix
  /about                      Company story, mission, team
  /llm-info                   Structured data for AI assistants
  /bluesky                    Bluesky marketing guide
  /threads                    Threads marketing guide
  /tiktok                     TikTok marketing guide (hashtags, video sizes)
  /facebook                   Facebook integration info
  /mastodon                   Mastodon integration info
  /instagram                  Instagram guide (not crawled separately)
  /twitter                    X/Twitter guide
  /linkedin                   LinkedIn guide
  /comparisons                Competitor comparisons hub
  /tweethunter                vs TweetHunter
  /typefully                  vs Typefully
  /feedhive                   vs FeedHive
  /zlappo                     vs Zlappo
  /chirr-app                  vs Chirr App
  /tools/                     Free tools hub
    /x-twitter-fonts-generator
    /fake-revenue-generator
    /fake-tweet-generator
    /tweet-analyzer
    /instagram-grid-maker
    /instagram-bio-generator
    /twitter-bio-generator
    /twitter-intent-generator
    /content-ideas-generator
    /threads-posts-generator
    /what-to-tweet
  /prompts-generator/         AI prompt generators
    /twitter-x
    /writing
    /marketing
    /business
  /blog-en                    Blog index
  /growth-notes-signup        Newsletter signup
  /affiliate                  Affiliate program
  /podcast                    Podcast page
  /v2                         V2 preview/landing
  /v2-preview                 V2 preview variant
  /creator-courses            Creator education
  /creator-vault              Resource vault
  /15-minute-courses          Quick courses
  /growth-challenge           General growth challenge
  /growth-challenge-x         X-specific challenge
  /growth-challenge-instagram Instagram challenge
  /growth-challenge-linkedin  LinkedIn challenge
  /growth-challenge-threads   Threads challenge
  /growth-challenge-bluesky   Bluesky challenge
```

### App (app.hypefury.com)

```
app.hypefury.com/
  /login                      Login (Twitter OAuth)
  /                           Dashboard / Queue view (primary screen)
  /create                     Composer window (write tweets/posts)
  /queue                      Queue/schedule view (time slots)
  /history                    Post history (all published content)
  /drafts                     Saved drafts
  /analytics                  Tweet + follower analytics
  /analytics/:username        Public analytics profile
  /engagement                 Engagement builder
  /auto-dms                   Auto-DM campaign manager
  /powerups                   Powerups hub page
  /evergreen                  Evergreen posts list
  /recurrent-posts            Recurrent post categories
  /inspirations               Inspiration panel / prompts
  /settings                   Settings hub
    > Connections tab          Platform connections (X, IG, FB, LI, Threads, TikTok)
    > Composer tab             Composer preferences
    > Account tab              Account management
    > Gumroad tab              Gumroad integration
```

### Help Center (hypefury.crisp.help)

```
Categories (English):
  /en/category/getting-started-14a04jx
  /en/category/writing-tweets-1csdubl
  /en/category/powerups-ch6zgw
  /en/category/analytics-1b75coe
  /en/category/facebook-18e0hk3
  /en/category/instagram-1wwpom
  /en/category/linkedin-17jz3mc
  /en/category/evergreen-posts-1odutsv
  /en/category/recurrent-posts-mr8hyo
  /en/category/sales-1tjzyyi
  /en/category/engage-uc6k6e
  /en/category/troubleshooting-my8mxu
  /en/category/hypefury-faqs-cvhy00
```

---

## 2. Core Flow Diagrams

### Compose -> Schedule -> Publish -> Analytics Cycle

```
 ┌─────────────────────────────────────────────────────────────────────┐
 │                        COMPOSE PHASE                               │
 │                                                                     │
 │  ┌─────────┐   ┌──────────────┐   ┌────────────────┐              │
 │  │Inspiration│──>│  Composer     │──>│ Cross-post     │              │
 │  │  Panel    │   │  Window      │   │ Toggles        │              │
 │  │          │   │              │   │ [X][IG][LI]    │              │
 │  │ - Viral  │   │ - Text       │   │ [FB][Threads]  │              │
 │  │   tweets │   │ - Media      │   │ [TikTok]       │              │
 │  │ - Hooks  │   │ - Thread     │   └────────┬───────┘              │
 │  │ - Prompts│   │ - Autoplug   │            │                      │
 │  │ - History│   │ - Auto-DM    │            │                      │
 │  └─────────┘   └──────┬───────┘            │                      │
 │                        │                    │                      │
 │                        v                    v                      │
 │               ┌────────────────────────────────────┐               │
 │               │  Save as Draft  OR  Add to Queue   │               │
 │               └──────────────────┬─────────────────┘               │
 └──────────────────────────────────┼─────────────────────────────────┘
                                    │
 ┌──────────────────────────────────┼─────────────────────────────────┐
 │                        SCHEDULE PHASE                              │
 │                                  v                                  │
 │  ┌──────────────────────────────────────────────────┐              │
 │  │              Posting Schedule                     │              │
 │  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐           │              │
 │  │  │ 9:00 │ │11:00 │ │14:00 │ │18:00 │ ...       │              │
 │  │  │  X   │ │ X+LI │ │  X   │ │ X+IG │           │              │
 │  │  └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘           │              │
 │  │     │        │        │        │                 │              │
 │  │     v        v        v        v                 │              │
 │  │  ┌──────────────────────────────────┐            │              │
 │  │  │     Queue (time-ordered slots)   │            │              │
 │  │  │  [Tweet 1] [Tweet 2] [Tweet 3]  │            │              │
 │  │  │  Green = Evergreen slots         │            │              │
 │  │  │  Blue  = Platform-specific slots │            │              │
 │  │  └──────────────┬───────────────────┘            │              │
 │  │                 │                                 │              │
 │  │  Also fed by:   │                                 │              │
 │  │  - Recurrent Post Categories                      │              │
 │  │  - Evergreen Posts (fill empty slots)             │              │
 │  │  - CSV Bulk Upload                                │              │
 │  └──────────────────────────────────────────────────┘              │
 └──────────────────────────────────┼─────────────────────────────────┘
                                    │
 ┌──────────────────────────────────┼─────────────────────────────────┐
 │                        PUBLISH PHASE                               │
 │                                  v                                  │
 │  ┌─────────────────────────────────────────────────────┐           │
 │  │              Hypefury Backend                        │           │
 │  │                                                      │           │
 │  │  At scheduled time:                                  │           │
 │  │  1. Post tweet to X/Twitter via API                  │           │
 │  │  2. Cross-post to enabled platforms:                 │           │
 │  │     - LinkedIn (text or carousel)                    │           │
 │  │     - Instagram (tweetshot image or carousel)        │           │
 │  │     - Facebook Page (text + media)                   │           │
 │  │     - Threads (text)                                 │           │
 │  │     - TikTok (video from Tweet-to-Reel)              │           │
 │  │  3. Start Auto-DM campaign if configured             │           │
 │  │  4. Monitor engagement for Autoplug trigger          │           │
 │  └─────────────────────┬───────────────────────────────┘           │
 │                        │                                            │
 │  On engagement threshold met:                                       │
 │  ┌─────────────────────v───────────────────────────────┐           │
 │  │  Autoplug fires: post follow-up reply automatically  │           │
 │  │  (X and/or LinkedIn, depending on plan)              │           │
 │  └─────────────────────────────────────────────────────┘           │
 └──────────────────────────────────┼─────────────────────────────────┘
                                    │
 ┌──────────────────────────────────┼─────────────────────────────────┐
 │                       ANALYTICS PHASE                              │
 │                                  v                                  │
 │  ┌─────────────────────────────────────────────────────┐           │
 │  │  Tweet Analytics                                     │           │
 │  │  - Engagement per tweet                              │           │
 │  │  - Engagement rate                                   │           │
 │  │  - Impressions                                       │           │
 │  │  - Tweet volume / breakdown                          │           │
 │  │                                                      │           │
 │  │  Follower Analytics                                  │           │
 │  │  - Follower volume                                   │           │
 │  │  - Daily growth rate                                 │           │
 │  │  - Profile clicks                                    │           │
 │  │                                                      │           │
 │  │  Filter & sort top-performing tweets                 │           │
 │  │  Optional: public analytics page                     │           │
 │  └─────────────────────────────────────────────────────┘           │
 │                                                                     │
 │  Feeds back into: Inspiration Panel, Evergreen selection            │
 └─────────────────────────────────────────────────────────────────────┘
```

### Auto-Plug Flow

```
 ┌──────────────────────────────────────────────────────┐
 │                 AUTOPLUG SYSTEM                       │
 │                                                       │
 │  Two modes:                                           │
 │                                                       │
 │  ┌─────────────────────┐  ┌────────────────────────┐ │
 │  │  GLOBAL AUTOPLUGS    │  │  TWEET-SPECIFIC PLUGS  │ │
 │  │                      │  │                         │ │
 │  │ Configured in        │  │ Configured per-tweet    │ │
 │  │ Powerups page        │  │ in Composer window      │ │
 │  │                      │  │                         │ │
 │  │ Applied to ALL       │  │ Applied to ONE tweet    │ │
 │  │ tweets (even ones    │  │ only                    │ │
 │  │ posted outside HF)   │  │                         │ │
 │  │                      │  │ Templates can be saved  │ │
 │  │ Multiple variations  │  │ and reused              │ │
 │  │ (rotated to avoid    │  │                         │ │
 │  │ repetition)          │  │                         │ │
 │  └──────────┬──────────┘  └───────────┬────────────┘ │
 │             │                          │               │
 │             v                          v               │
 │  ┌────────────────────────────────────────────┐       │
 │  │         TRIGGER CONDITIONS                  │       │
 │  │                                             │       │
 │  │  - Percentage-based: "top X% of tweets"     │       │
 │  │  - Absolute: "N likes" or "N retweets"      │       │
 │  │  - Applies to % of tweets (configurable)    │       │
 │  │                                             │       │
 │  │  Advanced options:                           │       │
 │  │  - Don't autoplug if manually replied        │       │
 │  │  - Global priority vs tweet-specific         │       │
 │  └──────────────────┬─────────────────────────┘       │
 │                     │                                   │
 │                     v                                   │
 │  ┌────────────────────────────────────────────┐       │
 │  │  EXECUTION                                  │       │
 │  │                                             │       │
 │  │  When threshold met:                        │       │
 │  │  - Pick variation (or template)             │       │
 │  │  - Post as reply to original tweet          │       │
 │  │  - Can include links, CTAs, media           │       │
 │  │                                             │       │
 │  │  Platforms:                                  │       │
 │  │  - X/Twitter: all plans                     │       │
 │  │  - LinkedIn: Creator plan and above         │       │
 │  └────────────────────────────────────────────┘       │
 └──────────────────────────────────────────────────────┘
```

### Auto-DM Flow

```
 ┌──────────────────────────────────────────────────────┐
 │                  AUTO-DM SYSTEM                       │
 │                                                       │
 │  ┌──────────────────────────────────────────┐        │
 │  │  1. COMPOSE GIVEAWAY TWEET               │        │
 │  │     - Write tweet text                    │        │
 │  │     - Clearly state: "engage to get DM"   │        │
 │  │     - Write DM message (cannot change     │        │
 │  │       after posting)                      │        │
 │  │     - Mandatory opt-out message added     │        │
 │  │       automatically (X compliance)        │        │
 │  └────────────────┬─────────────────────────┘        │
 │                   v                                    │
 │  ┌──────────────────────────────────────────┐        │
 │  │  2. SET REQUIREMENTS                      │        │
 │  │     - Like required?                      │        │
 │  │     - Retweet required?                   │        │
 │  │     - Reply with keyword required?        │        │
 │  │       (case insensitive)                  │        │
 │  │     - Follow required?                    │        │
 │  │       (DMs only sent to followers)        │        │
 │  └────────────────┬─────────────────────────┘        │
 │                   v                                    │
 │  ┌──────────────────────────────────────────┐        │
 │  │  3. CAMPAIGN RUNS                         │        │
 │  │     - DMs sent in batches every 30 min    │        │
 │  │     - Campaign lasts 3 days maximum       │        │
 │  │     - Daily limit based on plan:          │        │
 │  │       Starter: 100/day                    │        │
 │  │       Creator: 250/day                    │        │
 │  │       Business: 300/day                   │        │
 │  │       Agency: 400/day                     │        │
 │  └────────────────┬─────────────────────────┘        │
 │                   v                                    │
 │  ┌──────────────────────────────────────────┐        │
 │  │  4. MONITOR & TERMINATE                   │        │
 │  │     - View campaign performance           │        │
 │  │     - See DMs sent count                  │        │
 │  │     - Terminate early if needed           │        │
 │  │                                           │        │
 │  │  CAUTION: Do NOT edit tweet after posting  │        │
 │  │  (tweet ID changes, breaks DM tracking)   │        │
 │  └──────────────────────────────────────────┘        │
 └──────────────────────────────────────────────────────┘
```

### Engagement Builder Flow

```
 ┌──────────────────────────────────────────────────────┐
 │              ENGAGEMENT BUILDER                       │
 │                                                       │
 │  ┌──────────────────────────────────────────┐        │
 │  │  INPUT: Build Your Feed                   │        │
 │  │                                           │        │
 │  │  Option A: WATCHED USERS                  │        │
 │  │  - Manually enter usernames               │        │
 │  │  - OR import from X/Twitter Lists         │        │
 │  │  - Limit based on plan (30/100/unlimited) │        │
 │  │                                           │        │
 │  │  Option B: KEYWORD SEARCH                 │        │
 │  │  - Enter keywords to track                │        │
 │  │  - Limit: 5/10/20/50 by plan             │        │
 │  │  - Pulls latest tweets matching keywords  │        │
 │  └────────────────┬─────────────────────────┘        │
 │                   v                                    │
 │  ┌──────────────────────────────────────────┐        │
 │  │  CUSTOM FEED                              │        │
 │  │                                           │        │
 │  │  - Toggle between Users / Search feeds    │        │
 │  │  - See tweets from watched accounts       │        │
 │  │    OR keyword matches                     │        │
 │  │  - Zero-scroll engagement                 │        │
 │  └────────────────┬─────────────────────────┘        │
 │                   v                                    │
 │  ┌──────────────────────────────────────────┐        │
 │  │  ACTIONS (per tweet in feed)              │        │
 │  │                                           │        │
 │  │  [Reply] [Quote RT] [Like] [RT] [Emoji]  │        │
 │  │                                           │        │
 │  │  After replying: tweet dismissed          │        │
 │  │  [Skip] to dismiss without action         │        │
 │  │                                           │        │
 │  │  Keyboard shortcuts available             │        │
 │  │  "Engage with 30 people in 30 minutes"    │        │
 │  └──────────────────────────────────────────┘        │
 └──────────────────────────────────────────────────────┘
```

---

## 3. Connection Flows Per Platform

### X/Twitter (Primary Platform)
- **Auth method**: OAuth 1.0a (via Twitter login)
- **Connection**: Settings > Connections > click "Connect" for X/Twitter
- **Capabilities**: Full — compose, schedule, threads, autoplugs, auto-DMs, analytics, engagement builder, evergreen retweets, retweet scheduling, long-form posts
- **Multi-account**: Up to 1/5/10/15 connected X accounts by tier; managed accounts 0/3/10/25

### Instagram
- **Auth method**: Facebook/Meta OAuth (requires Instagram Business account linked to Facebook Page)
- **Connection**: Settings > Connections > Instagram > logs into Facebook > selects IG Business account
- **Capabilities**:
  - Cross-post tweets as "tweetshot" images
  - Schedule Instagram-exclusive posts
  - Instagram Carousel from threads
  - Tweet-to-Reel automation (10/50/300 per month by tier)
- **Fallback**: Email method for personal accounts (tweetshot emailed to user for manual posting)
- **Limitation**: Requires Instagram Business account for direct posting

### LinkedIn
- **Auth method**: LinkedIn OAuth 2.0
- **Connection**: Settings > Connections > LinkedIn > popup OAuth login
- **Capabilities**:
  - Cross-post tweets as LinkedIn posts
  - Schedule LinkedIn-exclusive posts
  - Convert threads to LinkedIn carousels
  - LinkedIn Autoplugs (Creator plan+)
  - Post to Company Pages (connected account must have admin rights)
- **Media limits**: Documented in dedicated help article

### Facebook
- **Auth method**: Facebook OAuth (same flow as Instagram)
- **Connection**: Settings > Connections > Facebook > login with authorized account > select ONE Page
- **Capabilities**:
  - Cross-post tweets to Facebook Page
  - Schedule Facebook-exclusive posts
  - Upload media or create tweetshots
  - Platform-specific posting slots in schedule

### Threads
- **Auth method**: Via Instagram/Meta connection (Threads API)
- **Connection**: Settings > Connections > Threads
- **Capabilities**:
  - Cross-post tweets to Threads
  - Schedule Threads-exclusive posts
  - Text-based posts (up to 500 chars)

### TikTok
- **Auth method**: TikTok OAuth
- **Connection**: Settings > Connections > TikTok
- **Capabilities**:
  - Tweet-to-Reel automation (generates video from tweet)
  - Schedule video content
  - Monthly limits: 10/50/300 by plan
- **Note**: Not a traditional cross-post; converts text to video format

### Bluesky
- **Auth method**: App password (AT Protocol)
- **Connection**: Listed as "coming soon" in LLM info page; integration page exists
- **Capabilities**: Cross-posting (limited, newer integration)
- **Protocol**: AT Protocol (decentralized, user owns data)

### Mastodon
- **Auth method**: Instance-based OAuth
- **Connection**: Listed as "coming soon"
- **Capabilities**: Cross-posting (planned)

### Gumroad (Sales Integration)
- **Auth method**: Gumroad OAuth
- **Connection**: Settings > Gumroad > click Connect > redirect to Gumroad login
- **Capabilities**:
  - Automated sales campaigns with discount codes
  - Time-limited promotions with urgency tweets
  - Auto-reply updates on sales progress
  - Quote tweet reminders
  - Customizable alerts and wordings

---

## 4. Feature Matrix: Capabilities Per Platform

| Feature                        | X/Twitter | Instagram | LinkedIn | Facebook | Threads | TikTok | Bluesky | Mastodon |
|-------------------------------|-----------|-----------|----------|----------|---------|--------|---------|----------|
| Schedule posts                 | Yes       | Yes       | Yes      | Yes      | Yes     | Video  | Soon    | Soon     |
| Cross-post from X             | N/A       | Yes       | Yes      | Yes      | Yes     | Reel   | Soon    | Soon     |
| Platform-exclusive posts       | Yes       | Yes       | Yes      | Yes      | Yes     | No     | No      | No       |
| Threads (multi-part)           | Yes       | Carousel  | Carousel | No       | No      | No     | No      | No       |
| Autoplugs (auto first comment) | Yes       | No        | Yes*     | No       | No      | No     | No      | No       |
| Auto-DMs                       | Yes       | No        | No       | No       | No      | No     | No      | No       |
| Engagement builder             | Yes       | No        | No       | No       | No      | No     | No      | No       |
| Analytics                      | Yes       | No        | No       | No       | No      | No     | No      | No       |
| Evergreen reposting            | Yes       | No        | No       | No       | No      | No     | No      | No       |
| Recurrent posts                | Yes       | No        | No       | No       | No      | No     | No      | No       |
| Gumroad sales                  | Yes       | No        | No       | No       | No      | No     | No      | No       |
| Tweet-to-Reel                  | N/A       | No        | No       | No       | No      | Yes    | No      | No       |
| CSV bulk upload                | Yes       | No        | No       | No       | No      | No     | No      | No       |
| Tweetshot (tweet as image)     | N/A       | Yes       | No       | Yes      | No      | No     | No      | No       |

*LinkedIn Autoplugs: Creator plan and above only, works only for posts made through Hypefury

---

## 5. Pricing Tiers

### Plan Names & Pricing (as of late 2025)

| Feature                          | Starter    | Creator       | Business     | Agency       |
|----------------------------------|-----------|---------------|--------------|--------------|
| Price (approx)                   | ~$25/mo   | ~$49/mo       | ~$99/mo      | ~$150/mo     |
| Connected X accounts             | 1         | 5             | 10           | 15           |
| Managed X accounts               | 0         | 3             | 10           | 25           |
| Total social accounts            | 6         | 30            | 60           | 90           |
| Schedule horizon                 | 1 month   | 3 months      | Unlimited    | Unlimited    |
| Drafts                          | 50        | 100           | 1,000        | Unlimited    |
| Engagement builder: users        | 30        | 100           | Unlimited    | Unlimited    |
| Engagement builder: keywords     | 5         | 10            | 20           | 50           |
| Import X lists                   | No        | Yes           | Yes          | Yes          |
| Tweet-to-Reel / YT snippets     | N/A       | 10/mo         | 50/mo        | 300/mo       |
| Autoplugs                        | X only    | X + LinkedIn  | X + LinkedIn | X + LinkedIn |
| Auto-DMs per day                 | 100       | 250           | 300          | 400          |
| Recurrent post categories        | 5         | 10            | Unlimited    | Unlimited    |
| Analytics history                | 7 days    | Unlimited     | Unlimited    | Unlimited    |
| Gumroad sales/week               | 1         | 3             | Unlimited    | Unlimited    |
| Support                          | Basic     | Premium email | Premium email| Premium email|
| Weekend support                  | No        | Yes           | Yes          | Yes          |
| Live chat support                | No        | No            | No           | Yes          |

**Notes:**
- All plans get: long-form X posts, viral thread hooks, tweet templates, 1000+ example questions, thread preview, thread booster, auto cross-posting
- 7-day free trial on all plans
- No free plan (removed)
- Up to 28% off with yearly billing

---

## 6. UI Patterns Worth Copying

### Composer Window Layout
- **Left sidebar**: Navigation (Create, Queue, History, Drafts, Analytics, Engagement, Auto-DMs, Powerups, Evergreen, Recurrent, Inspirations, Settings)
- **Center**: Main compose area with text input, media upload, thread builder
- **Right side**: Inspiration panel / Drafts panel (toggleable)
- **Bottom toolbar**: Platform toggles [X] [IG] [LI] [FB] [Threads] [TikTok] as icon buttons
- **Autoplug**: Accessible via dedicated button in composer, opens inline configuration
- **Auto-DM**: Separate section accessible from composer for giveaway tweets
- **Thread builder**: Add tweet in thread with + button, preview as thread, thread finisher/booster

### Queue/Schedule View
- **Calendar-style layout**: Time slots shown vertically by day
- **Color coding**: Green = Evergreen slots, Blue = Platform-specific slots, Default = Normal X slots
- **Drag and drop**: Reorder posts within queue
- **Insert between slots**: Click to add posts between existing scheduled items
- **Posting Schedule**: Separate config page to define daily time slots per platform

### Engagement Builder Layout
- **Two-tab interface**: Users feed / Search feed (toggle at top)
- **Card-per-tweet**: Shows tweet content with quick-action buttons below
- **Actions row**: [Reply] [Quote RT] [Like] [RT] [Emoji React] [Skip]
- **After action**: Tweet dismissed, next one shown
- **Keyboard shortcuts**: For power users to zip through feed
- **Config sidebar**: Manage watched users list and keyword list

### Powerups Page
- **Feature cards**: Each powerup (Tweet Booster, Auto-Unretweeter, Twitter Autoplug, CSV Upload, Post to IG, Auto Retweeter) as a card with toggle and Settings button
- **Settings modal**: Opens configuration for each feature
- **Enable/disable toggle**: Prominent on/off switch per feature

### Analytics Page
- **Tab structure**: Tweets analytics / Followers analytics
- **Charts**: Line charts for engagement, impressions, follower growth, daily growth
- **Sortable table**: Filter top tweets by engagement, impressions, likes, retweets
- **Public toggle**: "Make this page public" with shareable link

### History Page
- **All posts listed chronologically**: Including posts made outside Hypefury (imported daily)
- **Per-post actions**: Set as Evergreen, view analytics, reuse
- **Import**: Twitter archive uploader for historical data

### Inspirations Panel
- **Category browsing**: 15+ niches of viral tweets
- **Viral thread hooks**: Ready-to-use hooks
- **Tweet templates**: Structured templates
- **1000+ example questions**: Conversation starters
- **"Re-use" button**: Opens tweet in composer for editing
- **Auto-fill**: Composer auto-populated with inspiration from history (toggleable)

---

## 7. Recurrent Posts System

**Concept**: Create pools of tweets (Categories) that auto-post on their own schedule indefinitely.

### How It Works:
1. **Create Category**: Name it (e.g., "Product Tips", "Testimonials")
2. **Assign Schedule**: Set days and times for the category to post
3. **Add Tweets**: Write or import tweets into the category pool
4. **Category Autoplugs**: Optionally assign specific autoplugs per category
5. **Rotation**: Hypefury cycles through tweets in the category; when all posted, starts over with oldest
6. **Limits by plan**: 5/10/unlimited/unlimited categories

---

## 8. Evergreen Posts System

**Concept**: Curated list of best-performing tweets that get retweeted on a schedule.

### How It Works:
1. **Add to Evergreen**: From history page, composer, or auto-detect best tweets
2. **Evergreen Slots**: Dedicated green slots in the posting schedule
3. **Empty Slot Fill**: When enabled, empty normal slots automatically retweet an evergreen post
4. **Rate limiting**: Maximum one retweet per evergreen post per week (anti-spam)
5. **CSV import**: Can mark imported tweets as evergreen

---

## 9. Gumroad Sales Integration

### Flow:
1. Link Gumroad account via OAuth in Settings
2. Navigate to Toolbox > Gumroad Sales
3. Configure: Product, Discount Code, Amount off, Target sales, Duration, Start time
4. Hypefury auto-generates urgency tweet with countdown
5. Auto-replies to original tweet with sales progress updates
6. Optional quote tweet reminders
7. Customizable alert and reminder wordings

---

## 10. Key Competitive Insights

### What Hypefury Does Well:
- **X/Twitter-first**: Deep X integration with autoplugs, auto-DMs, engagement builder
- **Cross-posting is a toggle**: Not a separate workflow; compose once, toggle platforms
- **Evergreen + Recurrent**: Automation keeps feed active without manual effort
- **Monetization built-in**: Gumroad integration, sales campaigns, Auto-DM giveaways
- **Inspiration panel**: Never stare at blank composer; viral templates and prompts built in
- **Engagement builder**: Unique feature; curated reply feed for community building

### What Hypefury Lacks:
- Analytics are basic (X only, limited to engagement/followers/impressions)
- No analytics for Instagram, LinkedIn, Facebook, Threads, TikTok
- No multi-platform inbox or reply management
- No AI content generation (no GPT/Claude integration for writing)
- No image/video editor built in
- No approval workflows for teams
- No competitor analysis or social listening beyond keyword feed
- Bluesky and Mastodon are still "coming soon"
- LinkedIn Autoplugs only work for Hypefury-posted content
