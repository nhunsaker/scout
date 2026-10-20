---
"@scoutui/web-app": minor
---

New: `OIDC_EXTRA_SCOPES`, scopes for the dashboard to ask your sign-in provider for on top of `openid profile email`, separated by spaces. Set it to `groups` when your provider sends groups only when asked, as Okta does, so `SCOUTUI_ADMIN_GROUP` works. With the Helm chart, set `auth.oidc.extraScopes`.
