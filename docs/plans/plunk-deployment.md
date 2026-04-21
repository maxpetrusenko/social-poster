# Plunk Self-Hosted Deployment Guide

Target: `plunk.maxpetrusenko.com` on Contabo VPS via Coolify.

---

## Prerequisites

- AWS SES account with verified sending domain
- Cloudflare DNS access for `maxpetrusenko.com`
- Coolify dashboard access on VPS

## DNS Records (Cloudflare)

A records pointing to VPS IP (`<VPS_IP>`):

| Record | Type | Name | Proxy |
|--------|------|------|-------|
| Landing | A | `plunk` | Off |
| Dashboard | A | `app.plunk` | Off |
| API | A | `api.plunk` | Off |

Disable Cloudflare proxy (grey cloud) so Coolify handles SSL via Let's Encrypt.

## AWS SES Setup

1. **Verify domain** in SES console (region: `eu-west-1` or closest)
   - Add DKIM CNAME records (3x) to Cloudflare
   - Add SPF TXT record: `v=spf1 include:amazonses.com ~all`
   - Add DMARC TXT record: `v=DMARC1; p=quarantine; rua=mailto:dmarc@maxpetrusenko.com`
2. **Exit sandbox** - Request production access via SES console (takes ~24h)
3. **Create configuration set**: `plunk-configuration-set`
   - Add SNS destination for bounces/complaints (optional but recommended)
4. **Create IAM user** (`plunk-ses-sender`)
   - Policy: `ses:SendEmail`, `ses:SendRawEmail` on `*`
   - Save Access Key ID + Secret Access Key

## Coolify Deployment

1. New Resource -> Services -> search **Plunk**
2. Set domains in Coolify service config:
   - Landing: `https://plunk.maxpetrusenko.com`
   - Dashboard: `https://app.plunk.maxpetrusenko.com`
   - API: `https://api.plunk.maxpetrusenko.com`

### Environment Variables

```env
# Core
JWT_SECRET=<generate: openssl rand -hex 32>
DB_PASSWORD=<generate: openssl rand -hex 16>
DATABASE_URL=mysql://plunk:${DB_PASSWORD}@mysql:3306/plunk
REDIS_URL=redis://redis:6379

# Domains
API_DOMAIN=api.plunk.maxpetrusenko.com
DASHBOARD_DOMAIN=app.plunk.maxpetrusenko.com
LANDING_DOMAIN=plunk.maxpetrusenko.com

# AWS SES
AWS_SES_REGION=eu-west-1
AWS_SES_ACCESS_KEY_ID=<from IAM>
AWS_SES_SECRET_ACCESS_KEY=<from IAM>
AWS_SES_CONFIGURATION_SET=plunk-configuration-set

# Security
DISABLE_SIGNUPS=false  # flip to true after first account
USE_HTTPS=true

# Bug fix: prevents IPv6 DNS resolution crash in Node
NODE_OPTIONS=--no-network-family-autoselection
```

3. Deploy. Wait for all containers (api, dashboard, mysql, redis) to go green.

## Post-Deploy

1. Navigate to `https://app.plunk.maxpetrusenko.com`, create admin account
2. In Coolify, set `DISABLE_SIGNUPS=true`, redeploy
3. In Plunk dashboard: create project, copy API keys:
   - Secret key (`sk_...`) - server-side only
   - Public key (`pk_...`) - client-side tracking
4. Test send:
   ```bash
   curl -X POST https://api.plunk.maxpetrusenko.com/v1/send \
     -H "Authorization: Bearer sk_..." \
     -H "Content-Type: application/json" \
     -d '{"to":"test@example.com","subject":"Test","body":"<p>Works</p>"}'
   ```

## ClawPoster Integration (Phase 2)

Add to `.env`:
```env
PLUNK_API_URL=https://api.plunk.maxpetrusenko.com
PLUNK_SECRET_KEY=sk_...
```

Integration points:
- **Drip sequences**: Migrate to Plunk automations via `POST /v1/track` events
- **Subscriber management**: `POST /v1/contacts` for signup, tagging, metadata
- **Transactional email**: `POST /v1/send` for password resets, notifications
- **Event tracking**: Fire `user-signed-up`, `post-published`, etc. to trigger flows
