# Infrastructure Plan
## Cloudflare + Contabo/Coolify

Reviewed on 2026-04-04 against current Cloudflare, Docker, Coolify, and Contabo docs.

## Review Outcome

The original direction is broadly right: keep static sites on Cloudflare Pages, keep compute-heavy automation on the VPS, and preserve portability with Docker/Coolify. The plan needed four corrections:

1. Do not expose admin surfaces on public A records by default. `coolify.maxpetrusenko.com` should be reached via SSH tunnel or Cloudflare Tunnel + Cloudflare Access, not a normal proxied A record.
2. Do not rely on UFW alone to protect Docker-published ports. Docker publishes traffic before UFW's normal chains, so `ufw delete allow 8000` is not sufficient if a container still publishes `8000:8000`.
3. Treat Cloudflare TLS settings carefully. `Always Use HTTPS` is safe and recommended, but `Minimum TLS Version` does not apply to Cloudflare Pages hostnames.
4. Add pre-change rollback and persistent-data handling. Contabo snapshots help before risky changes, but they are not backups and auto-delete after 30 days.

## Recommended Target Architecture

### Keep

- `maxpetrusenko.com`, `www`, `atelier`, and other static sites on Cloudflare Pages.
- Contabo VPS for workloads that need Docker, Chromium, ffmpeg, SQLite/Postgres, or long-running jobs.
- Coolify as the deployment layer on the VPS.

### Change

- Public application traffic:
  - `social.maxpetrusenko.com`
  - `api.maxpetrusenko.com`
  - Use Cloudflare proxied DNS to Traefik on `443`, with Full (strict) and an Origin CA certificate.
- Admin traffic:
  - Prefer SSH tunnel for Coolify admin.
  - If browser access from anywhere is required, use Cloudflare Tunnel + Access for Coolify, not a public A record.
- Origin exposure:
  - Either keep `80/443` open only for public apps behind Cloudflare, or move public apps to Cloudflare Tunnel as well.
  - Do not leave `8000`, `6001`, `6002`, or `8080` published on the host.

## Current State Notes

These items came from local audit notes in the plan and should be re-checked live before execution:

- Contabo VPS: `173.249.52.27`
- Ubuntu 24.04
- Coolify `v4.0.0-beta.470`
- One existing app container already deployed
- Cloudflare zone hosts Pages projects and SES/email records

## Target Routing

| Hostname | Target | Public? | Notes |
| --- | --- | --- | --- |
| `maxpetrusenko.com` | Cloudflare Pages | Yes | Leave on Pages |
| `www.maxpetrusenko.com` | Cloudflare Pages | Yes | Redirect to apex |
| `atelier.maxpetrusenko.com` | Cloudflare Pages | Yes | Leave on Pages |
| `social.maxpetrusenko.com` | Traefik on VPS | Yes | Public app endpoint |
| `api.maxpetrusenko.com` | Traefik on VPS | Yes | Future APIs |
| `coolify.maxpetrusenko.com` | SSH tunnel or Cloudflare Tunnel | No public origin IP exposure preferred | Admin only |
| `realtime.maxpetrusenko.com` | Only if Coolify is tunneled | Restricted | Needed for Coolify realtime if using public browser access |
| `terminal.maxpetrusenko.com` | Only if Coolify is tunneled | Restricted | Needed for Coolify terminal websocket if using public browser access |

## Hardening Plan

### Phase 0: Rollback First

1. Create a Contabo snapshot before SSH, Docker, or proxy changes.
2. Export Coolify configuration and note current container names, published ports, and domains.
3. Back up any persistent app data separately. Contabo snapshots are temporary and are not backups.

### Phase 1: Cloudflare Edge

1. SSL/TLS mode:
   - If the zone is still on `Flexible`, move to `Full (strict)`.
   - Install a Cloudflare Origin CA certificate on Traefik/Coolify first.
   - Cloudflare now also offers Automatic SSL/TLS, but the safe steady state is still strict origin validation.

2. Enable `Always Use HTTPS`.
   - This redirects HTTP to HTTPS for all hosts and subdomains.

3. Set `Minimum TLS Version` to `1.2` for proxied VPS hostnames.
   - Important: this does not apply to Cloudflare Pages hostnames.

4. Turn on DNSSEC if the registrar supports DS record updates cleanly.

5. Enable managed WAF rules, Browser Integrity Check, and Bot Fight Mode if they do not break anything you need.

6. Add one rate-limiting rule for `/health`, `/status`, and any admin or manual-run endpoints.

### Phase 2: Origin Lockdown

1. SSH:
   - Create a non-root sudo user.
   - Set `PasswordAuthentication no`.
   - Set `PermitRootLogin prohibit-password` or `no`.
   - Keep root SSH only if there is a documented reason.

2. Install `fail2ban`.

3. Add swap.
   - 4 GB is a reasonable starting point on an 8 GB host for ffmpeg/Chromium spikes.

4. Enable unattended security upgrades.

5. Remove host-published admin ports.
   - Coolify dashboard should not publish `8000` to `0.0.0.0`.
   - Coolify realtime ports `6001` and `6002` should not be public.
   - Traefik dashboard `8080` should be disabled or localhost-only.

6. Fix Docker firewall assumptions.
   - Do not treat `ufw` as enough protection for published Docker ports.
   - Enforce protection by changing published-port mappings, binding to `127.0.0.1`, using a dedicated Docker firewall strategy, or removing publication entirely.

7. Add Cloudflare Authenticated Origin Pulls if you keep public A/AAAA-record origin access.
   - This adds origin-side verification that traffic came from Cloudflare.
   - Use a custom certificate if you want stricter isolation than the shared zone-level certificate.

### Phase 3: Admin Access

#### Best default

Use SSH port forwarding for Coolify admin:

```bash
ssh -L 8000:127.0.0.1:8000 max@173.249.52.27
```

Then browse `http://127.0.0.1:8000`.

#### If remote browser access is required

Use Cloudflare Tunnel + Access:

1. Run `cloudflared` on the VPS or as a Coolify-managed sidecar.
2. Publish `coolify.maxpetrusenko.com` to `localhost:8000`.
3. If needed for full Coolify UI functionality, also publish:
   - `realtime.maxpetrusenko.com` -> `localhost:6001`
   - `coolify.maxpetrusenko.com/terminal/ws` or a dedicated terminal hostname -> `localhost:6002`
4. Put those hostnames behind Cloudflare Access with an allowlist for `max.petrusenko@gmail.com`.

### Phase 4: Public Apps

For `social.maxpetrusenko.com` and `api.maxpetrusenko.com`:

1. Route through Traefik on `443`.
2. Use Origin CA certs and Full (strict).
3. Keep health checks enabled and verified.
4. Add app-level auth for any write/admin/manual-run endpoints.
5. Do not expose the VPS IP in docs, robots files, client-side code, or public screenshots.

## Portability Strategy

Coolify + Docker remains the right portability layer. Keep the application source portable, not the server state.

### Source of truth

- Git repo for app code
- Coolify-managed environment variables, ideally sourced from Doppler
- Persistent data in named volumes or bind mounts
- Optional GHCR images for reproducible rollback

### Migration playbook

1. Provision the new VPS.
2. Install Docker + Coolify.
3. Restore app data from backup, not from snapshot.
4. Deploy the same compose/image.
5. Validate on staging hostname.
6. Flip Cloudflare DNS or Tunnel routing.
7. Keep the old node intact until health, logs, and scheduled jobs are clean.

## Backups, Monitoring, and Logs

### Backups

- Back up Coolify itself.
- Back up app state separately from the host.
- For lightweight state, ship SQLite or exported JSON to R2/S3 daily.
- If state becomes important or multi-node, move to Postgres and enable DB backups.

### Monitoring

- Uptime monitor:
  - `https://social.maxpetrusenko.com/health`
- Alerting:
  - Slack or email on failed scheduled runs and deployment failures
- Host metrics:
  - CPU, memory, disk, swap, restart count

### Logging

- Structured JSON logs in app containers
- Coolify log viewer for short-term
- Optional Better Stack or Loki later

## Execution Order

### Immediate

1. Create Contabo snapshot
2. Audit Docker published ports with `docker ps` and `docker inspect`
3. Stop publishing Coolify admin/realtime/terminal ports publicly
4. Harden SSH
5. Add swap
6. Install fail2ban
7. Install Origin CA cert
8. Move Cloudflare to `Full (strict)`
9. Enable `Always Use HTTPS`

### This week

10. Set TLS minimum to `1.2` where applicable
11. Decide admin access path: SSH tunnel or Cloudflare Tunnel + Access
12. Add Authenticated Origin Pulls if using public origin DNS
13. Enable unattended upgrades
14. Configure backups
15. Add monitoring and alerts

### Later

16. Add a second VPS only after restore + failover are documented
17. Decide whether GHCR becomes the deployment artifact source
18. Tighten DMARC after validating mail flow

## Cost Notes

The original cost assumptions are mostly fine, but budget for:

- Monitoring if free tiers become too small
- Backups if R2/S3 storage grows
- Additional VPS only after real capacity need

## References

- Cloudflare encryption modes:
  - https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/
- Cloudflare Origin CA:
  - https://developers.cloudflare.com/ssl/origin-configuration/origin-ca/
- Cloudflare Authenticated Origin Pulls:
  - https://developers.cloudflare.com/ssl/origin-configuration/authenticated-origin-pull/
- Cloudflare Always Use HTTPS:
  - https://developers.cloudflare.com/ssl/edge-certificates/additional-options/always-use-https/
- Cloudflare Minimum TLS Version:
  - https://developers.cloudflare.com/ssl/edge-certificates/additional-options/minimum-tls/
- Cloudflare Tunnel:
  - https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/
- Docker firewall behavior with UFW:
  - https://docs.docker.com/engine/network/packet-filtering-firewalls/
- Coolify Cloudflare Tunnel guide:
  - https://coolify.io/docs/integrations/cloudflare/tunnels/single-resource
- Coolify tunnel overview:
  - https://coolify.io/docs/integrations/cloudflare/tunnels/overview
- Coolify health checks:
  - https://coolify.io/docs/knowledge-base/health-checks
- Coolify persistent storage:
  - https://coolify.io/docs/knowledge-base/persistent-storage
- Contabo snapshots:
  - https://help.contabo.com/en/support/solutions/articles/103000270385-how-do-i-create-a-snapshot-of-my-server-
