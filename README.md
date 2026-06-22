# scanservjs-plus

> **Independent fork** of [sbs20/scanservjs](https://github.com/sbs20/scanservjs).
> Added features needed for a homelab environment that are outside the scope of upstream.
> All credit for the original scanner UI goes to [Sam Strachan](https://github.com/sbs20) and contributors.

[![GitHub](https://img.shields.io/github/license/sbs20/scanservjs?style=for-the-badge)](https://github.com/sbs20/scanservjs/blob/master/LICENSE.md)
[![Build](https://img.shields.io/github/actions/workflow/status/tinkermesomething/scanservjs-plus/build.yml?branch=master&style=for-the-badge)](https://github.com/tinkermesomething/scanservjs-plus/actions)

![screenshot](https://github.com/sbs20/scanservjs/raw/master/docs/screen0.jpg)

## What's added in this fork

| Feature | Description |
|---|---|
| **OIDC authentication** | Login via any OpenID Connect provider (Pocket-ID, Authentik, Keycloak, etc.). Fully env-configured — no code changes needed per provider. |
| **Per-user persistent settings** | Scan parameters saved server-side and restored on any device at next login. |
| **Ephemeral downloads** | Guests and users without an assigned output directory get an automatic browser download instead. File exists only for the duration of the session. |
| **Admin panel** | Assign output directories to users. Access controlled by OIDC group membership. |
| **Quick scan button** | One-click single-page scan using current settings — no batch dialog. |
| **Scan lock** | Prevents concurrent scans from different sessions. Same session can batch uninterrupted. Auto-releases after 5 minutes if abandoned. |

## Deploying

This fork is Docker-only. Images are published to GHCR on every push to `master` and on version tags.

```
ghcr.io/tinkermesomething/scanservjs-plus:latest
ghcr.io/tinkermesomething/scanservjs-plus:v1.0.0
```

### docker-compose.yml

```yaml
services:
  scanservjs:
    image: ghcr.io/tinkermesomething/scanservjs-plus:latest
    restart: unless-stopped
    ports:
      - "8080:8080"
    volumes:
      - /var/run/dbus:/var/run/dbus
      - scanservjs-data:/var/lib/scanservjs
    privileged: true          # required for USB scanner access
    env_file: .env

volumes:
  scanservjs-data:
```

### .env

```dotenv
# ── Scanner ──────────────────────────────────────────────────────────────────
# Manually specify network scanners if not auto-discovered
# DEVICES=net:192.168.1.10:airscan:e0:My Scanner

# ── Output directories ────────────────────────────────────────────────────────
# Admin-assigned mount points available for logged-in users.
# Format: "Label|/path;Label2|/path2"
# OUTPUT_DIRECTORIES=Family|/mnt/nas/family;Archive|/mnt/nas/archive

# ── OIDC authentication ───────────────────────────────────────────────────────
OIDC_ENABLED=true
OIDC_ISSUER=https://your-pocket-id.example.com
OIDC_CLIENT_ID=scanservjs
OIDC_CLIENT_SECRET=your-client-secret
OIDC_REDIRECT_URI=https://scanservjs.example.com/auth/callback
# OIDC_POST_LOGOUT_REDIRECT_URI=https://scanservjs.example.com
# OIDC_SCOPE=openid profile email groups
# OIDC_GROUPS_CLAIM=groups

# Group name (from your OIDC provider) that grants admin access
ADMIN_GROUP=scanservjs-admins

# ── Session ───────────────────────────────────────────────────────────────────
SESSION_SECRET=change-me-to-a-long-random-string
# SESSION_SECURE=true    # set false if not behind HTTPS (dev only)
```

### Pocket-ID setup

1. Create a new OIDC client in Pocket-ID
2. Set redirect URI to `https://<your-host>/auth/callback`
3. Enable the `groups` claim in the token
4. Create a group matching `ADMIN_GROUP` and add admin users to it
5. Copy the client ID and secret into `.env`

### Without OIDC

Leave `OIDC_ENABLED` unset (or `false`). The app runs as a single shared user, identical to upstream behaviour. Optional basic auth is still available via the upstream `users` config.

---

## Original features

- Flatbed and ADF scanning
- Output formats: TIF, JPG, PNG, PDF, TXT (Tesseract OCR)
- Filters: auto-level, threshold, blur
- Multipage and batch scanning with collation
- Cropping and paper size presets
- Light and dark mode, responsive UI
- International translations
- Docker images for `amd64`, `arm64`, `arm/v7`
- OpenAPI documentation at `/api-docs`

Requires a [SANE-compatible scanner](http://www.sane-project.org/sane-supported-devices.html) and a Linux host (physical or VM with USB passthrough).

## Upstream documentation

The following docs from the original project apply to the base app:

- [SANE setup](https://github.com/sbs20/scanservjs/blob/master/docs/03-sane.md)
- [Network scanners](https://github.com/sbs20/scanservjs/blob/master/docs/02-docker.md)
- [Configuration reference](https://github.com/sbs20/scanservjs/blob/master/docs/10-configuration.md)
- [Recipes](https://github.com/sbs20/scanservjs/blob/master/docs/12-recipes.md)
- [Troubleshooting](https://github.com/sbs20/scanservjs/blob/master/docs/04-troubleshooting.md)

## Releasing

```bash
git tag v1.2.3
git push origin v1.2.3
```

This triggers:
- Docker image pushed to GHCR with `v1.2.3`, `1.2`, `1`, and `latest` tags
- GitHub Release created automatically with changelog

## Acknowledgements

- [sbs20/scanservjs](https://github.com/sbs20/scanservjs) — original project, copyright 2016-2026 Sam Strachan
- [phpsane](http://sourceforge.net/projects/phpsane/) — the original genesis of scanservjs
- Everyone who contributed translations, bug reports and fixes to the upstream project
