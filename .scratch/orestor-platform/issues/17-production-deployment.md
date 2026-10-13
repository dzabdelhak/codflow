# 17: Production deployment and operations

**What to build:** The platform installs reproducibly on our servers in Algeria from versioned config: Docker images, Caddy config, timers and proxy limits in the repo, nothing typed by hand. Two or more app servers run behind Caddy with no machine-local state. PostgreSQL has automated backups with a restore that is tested on a schedule; there is monitoring and alerting (app health, queue age, certificate failures, disk). The last Cloudflare remnants (wrangler configs, D1 scripts, Cloudflare env keys) are removed and the deployment docs and AGENTS.md describe the new setup.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] A fresh server reaches a working platform from the repo and a secrets file alone
- [ ] Stopping one app server does not interrupt the storefront or order transmission
- [ ] A scheduled restore of last night's backup succeeds and is reported
- [ ] No Cloudflare configuration remains in the repo
