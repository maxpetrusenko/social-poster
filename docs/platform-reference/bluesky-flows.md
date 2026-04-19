# Bluesky AT Protocol API Reference — Platform Depth

> Reference for `src/platforms/bluesky/` implementation
> Last updated: 2026-04-17

---

## 1. API Overview

Bluesky uses the AT Protocol (atproto), a decentralized social networking protocol. Unlike OAuth-based APIs, atproto uses session-based authentication with direct PDS (Personal Data Server) endpoints.

### Base URLs
- Default PDS: `https://bsky.social/xrpc/`
- Public AppView: `https://public.api.bsky.app/xrpc/`
- Chat service: proxied via PDS to central chat service

### Access Model
- **No OAuth** — Session-based auth via app passwords
- **No API keys** — Direct username + app password authentication
- **No rate tiers** — Same limits for all users
- **Open protocol** — Can self-host PDS for higher limits

---

## 2. Authentication Flow

```
┌──────────┐    ┌──────────────┐    ┌──────────┐
│  User    │    │  Our App     │    │ Bluesky  │
│ Browser  │    │  Backend     │    │  PDS     │
└────┬─────┘    └──────┬───────┘    └────┬─────┘
     │                 │                 │
     │  Enter handle   │                 │
     │  + app password │                 │
     │────────────────>│                 │
     │                 │                 │
     │                 │  POST /xrpc/    │
     │                 │  com.atproto.   │
     │                 │  server.        │
     │                 │  createSession  │
     │                 │  {identifier,   │
     │                 │   password}     │
     │                 │────────────────>│
     │                 │                 │
     │                 │  {accessJwt,    │
     │                 │   refreshJwt,   │
     │                 │   did,          │
     │                 │   handle}       │
     │                 │<────────────────│
     │                 │                 │
     │  Connected!     │                 │
     │<────────────────│                 │

Token details:
- accessJwt: short-lived (~2 hours)
- refreshJwt: longer-lived (~90 days)
- Refresh: POST /xrpc/com.atproto.server.refreshSession
  Authorization: Bearer {refreshJwt}
- DID = persistent user identifier (did:plc:...)
```

### Session Management
```
Create: POST /xrpc/com.atproto.server.createSession
  { "identifier": "handle.bsky.social", "password": "app-password" }

Refresh: POST /xrpc/com.atproto.server.refreshSession
  Authorization: Bearer {refreshJwt}

Delete: POST /xrpc/com.atproto.server.deleteSession
  Authorization: Bearer {refreshJwt}
```

---

## 3. No OAuth Scopes

AT Protocol does not use OAuth scopes. Authentication grants full access to the account. App passwords provide the same access level as the main password but can be individually revoked.

**Note:** OAuth for AT Protocol is on the 2025-2026 roadmap but not yet available.

---

## 4. API Capabilities Matrix

### 4A. Posting (Records)

All content in atproto is stored as "records" in repositories.

| Endpoint | Method | Description |
|---|---|---|
| `com.atproto.repo.createRecord` | POST | Create post, like, repost, follow |
| `com.atproto.repo.deleteRecord` | POST | Delete a record |
| `com.atproto.repo.getRecord` | GET | Read a specific record |
| `com.atproto.repo.listRecords` | GET | List records by collection |
| `com.atproto.repo.putRecord` | POST | Update/replace a record |
| `com.atproto.repo.applyWrites` | POST | Batch create/update/delete |

**Create text post:**
```json
POST /xrpc/com.atproto.repo.createRecord
{
  "repo": "did:plc:user_did",
  "collection": "app.bsky.feed.post",
  "record": {
    "$type": "app.bsky.feed.post",
    "text": "Hello world!",
    "createdAt": "2026-04-17T12:00:00.000Z",
    "langs": ["en"]
  }
}
```

**Post with image:**
```
1. Upload blob:
   POST /xrpc/com.atproto.repo.uploadBlob
   Content-Type: image/jpeg
   Body: binary image data
   → { "blob": { "$type": "blob", "ref": {...}, "mimeType": "image/jpeg", "size": N } }

2. Create post with embed:
   POST /xrpc/com.atproto.repo.createRecord
   {
     "repo": "did:plc:...",
     "collection": "app.bsky.feed.post",
     "record": {
       "$type": "app.bsky.feed.post",
       "text": "Photo caption",
       "embed": {
         "$type": "app.bsky.embed.images",
         "images": [{
           "alt": "Alt text",
           "image": { "$type": "blob", "ref": {...}, "mimeType": "image/jpeg", "size": N }
         }]
       },
       "createdAt": "2026-04-17T12:00:00.000Z"
     }
   }
```

**Post types (via embed $type):**
- Text only: no embed
- Images: `app.bsky.embed.images` (up to 4 images)
- Video: `app.bsky.embed.video`
- Link card: `app.bsky.embed.external`
- Quote post: `app.bsky.embed.record`
- Images + quote: `app.bsky.embed.recordWithMedia`

### 4B. Feed & Timeline

| Endpoint | Method | Description |
|---|---|---|
| `app.bsky.feed.getTimeline` | GET | Home timeline |
| `app.bsky.feed.getAuthorFeed` | GET | User's posts |
| `app.bsky.feed.getPostThread` | GET | Full thread (post + replies) |
| `app.bsky.feed.getPosts` | GET | Batch fetch posts by URI |
| `app.bsky.feed.getLikes` | GET | Users who liked a post |
| `app.bsky.feed.getRepostedBy` | GET | Users who reposted |
| `app.bsky.feed.searchPosts` | GET | Full-text post search |

### 4C. Engagement (via createRecord)

| Action | Collection | Record Type |
|---|---|---|
| Like | `app.bsky.feed.like` | `{ subject: { uri, cid } }` |
| Repost | `app.bsky.feed.repost` | `{ subject: { uri, cid } }` |
| Follow | `app.bsky.graph.follow` | `{ subject: did }` |
| Block | `app.bsky.graph.block` | `{ subject: did }` |
| Mute | `app.bsky.graph.muteActor` | (separate endpoint) |

**Like a post:**
```json
POST /xrpc/com.atproto.repo.createRecord
{
  "repo": "did:plc:...",
  "collection": "app.bsky.feed.like",
  "record": {
    "$type": "app.bsky.feed.like",
    "subject": { "uri": "at://did:plc:.../app.bsky.feed.post/...", "cid": "..." },
    "createdAt": "2026-04-17T12:00:00.000Z"
  }
}
```

### 4D. Notifications

| Endpoint | Method | Description |
|---|---|---|
| `app.bsky.notification.listNotifications` | GET | All notifications (likes, replies, follows, mentions, quotes, reposts) |
| `app.bsky.notification.getUnreadCount` | GET | Unread notification count |
| `app.bsky.notification.updateSeen` | POST | Mark notifications as read |

### 4E. Direct Messages (Chat)

| Endpoint | Method | Description |
|---|---|---|
| `chat.bsky.convo.listConvos` | GET | List conversations |
| `chat.bsky.convo.getConvo` | GET | Get specific conversation |
| `chat.bsky.convo.getMessages` | GET | Messages in conversation |
| `chat.bsky.convo.sendMessage` | POST | Send a message |
| `chat.bsky.convo.sendMessageBatch` | POST | Send multiple messages |
| `chat.bsky.convo.deleteMessageForSelf` | POST | Delete message (self) |
| `chat.bsky.convo.updateRead` | POST | Mark as read |
| `chat.bsky.convo.updateAllRead` | POST | Mark all as read |
| `chat.bsky.convo.acceptConvo` | POST | Accept conversation invite |
| `chat.bsky.convo.leaveConvo` | POST | Leave conversation |
| `chat.bsky.convo.muteConvo` | POST | Mute notifications |
| `chat.bsky.convo.unmuteConvo` | POST | Unmute |
| `chat.bsky.convo.addReaction` | POST | React to message |
| `chat.bsky.convo.removeReaction` | POST | Remove reaction |
| `chat.bsky.convo.getConvoForMembers` | GET | Find convo with specific users |
| `chat.bsky.convo.getConvoAvailability` | GET | Check if convo is possible |
| `chat.bsky.convo.getLog` | GET | Activity log |

### 4F. Profile & Identity

| Endpoint | Method | Description |
|---|---|---|
| `app.bsky.actor.getProfile` | GET | Full profile |
| `app.bsky.actor.getProfiles` | GET | Batch profiles (up to 25) |
| `app.bsky.actor.searchActors` | GET | Search users |
| `app.bsky.actor.getSuggestions` | GET | Suggested follows |
| `com.atproto.identity.resolveHandle` | GET | Handle → DID resolution |

### 4G. Lists & Feeds

| Endpoint | Method | Description |
|---|---|---|
| `app.bsky.graph.getLists` | GET | User's lists |
| `app.bsky.graph.getList` | GET | List members |
| `app.bsky.feed.getActorFeeds` | GET | Custom feeds by user |
| `app.bsky.feed.getFeed` | GET | Get custom feed posts |

---

## 5. Rate Limits

### Content Write Operations (Per Account)
**5,000 points/hour; 35,000 points/day**

| Action | Points | Max Per Hour | Max Per Day |
|---|---|---|---|
| CREATE | 3 | 1,666 records | 11,666 records |
| UPDATE | 2 | 2,500 records | 17,500 records |
| DELETE | 1 | 5,000 records | 35,000 records |

### API Requests (Per IP)
| Category | Limit | Window |
|---|---|---|
| Overall API calls | 3,000 | 5 minutes |
| Session creation | 30/account | 5 minutes |
| Session creation | 300/account | 1 day |
| Handle updates | 10/account | 5 minutes |
| Handle updates | 50/account | 1 day |
| Account creation | 100/IP | 5 minutes |

### File Uploads
- Maximum blob size: 50 MB

---

## 6. Current State vs What's Possible

| Capability | Current (`bluesky.ts`) | API Supports | Gap |
|---|---|---|---|
| **Text posting** | Yes | Yes | Implemented |
| **Image posting** | Yes (up to 4) | Up to 4 images + alt text | Implemented |
| **Video posting** | Yes | Video embed | Implemented |
| **Link cards** | Not implemented | `app.bsky.embed.external` | Full gap |
| **Quote posts** | Not implemented | `app.bsky.embed.record` | Full gap |
| **Likes** | Not implemented | createRecord in `app.bsky.feed.like` | Full gap |
| **Reposts** | Not implemented | createRecord in `app.bsky.feed.repost` | Full gap |
| **Follows** | Not implemented | createRecord in `app.bsky.graph.follow` | Full gap |
| **Timeline** | Not implemented | getTimeline, getAuthorFeed | Full gap |
| **Thread reading** | Not implemented | getPostThread | Full gap |
| **Notifications** | Not implemented | listNotifications, unread count | Full gap |
| **DMs** | Not implemented | Full chat API (17 endpoints) | Full gap |
| **Search** | Not implemented | searchPosts, searchActors | Full gap |
| **Lists** | Not implemented | getLists, getList | Full gap |
| **Profile** | Basic (did, handle) | Full profile + batch | Partial gap |

---

## 7. Implementation Priority

### Phase 1: Engagement (Low effort, high value)
- Like, repost, follow via createRecord
- Undo like/repost/follow via deleteRecord
- Estimate: 1-2 days

### Phase 2: Threads & Timeline (Medium effort, high value)
- Read home timeline
- Read post threads (for reply context)
- Quote post support
- Link card embeds
- Estimate: 2-3 days

### Phase 3: Notifications (Low effort, high value)
- List notifications (likes, replies, follows, mentions)
- Mark as read
- Unread count
- Estimate: 1 day

### Phase 4: DMs (Medium effort, high value)
- List conversations
- Read messages
- Send messages
- React to messages
- Estimate: 2-3 days

### Phase 5: Search & Discovery (Low effort, medium value)
- Search posts by keyword
- Search users
- Suggested follows
- Estimate: 1 day

### Not Constrained
- **Everything is available** — AT Protocol is fully open. No feature is blocked.
- **Self-hosting** — Can run own PDS for unlimited rate limits.
- **No app review** — No approval process needed for any feature.

---

## 8. Key Constraints & Gotchas

1. **No OAuth** — Session auth with app passwords. OAuth is on the roadmap but not available.
2. **Record-based model** — All content (posts, likes, reposts, follows) are records in collections. Different mental model from REST APIs.
3. **DIDs are permanent** — `did:plc:...` never changes even if handle changes. Store DIDs, not handles.
4. **CID required for likes/reposts** — Must have both `uri` and `cid` of target post. Get from post data.
5. **50 MB blob limit** — Max upload size for images/videos.
6. **4 images max** — Per post. No carousel-style unlimited.
7. **createdAt required** — All records must include ISO 8601 timestamp.
8. **Chat is centralized** — DMs go through a single central service, proxied via PDS. Not federated yet.
9. **Rate limits are generous** — 1,666 creates/hour is far more than any other platform.
10. **applyWrites for batching** — Can batch multiple create/update/delete in single request.
