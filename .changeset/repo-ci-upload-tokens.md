---
"@scoutui/web-app": minor
---

Each repo has its own CI upload token, made on the repo's new Settings page: open the repo's **⋯** menu and choose **Settings**. Editors and Admins create a token there, see it once, and can regenerate or revoke it. A token uploads scans of its own repo only. **Delete repo** moves onto the same page.

**Breaking:** the dashboard no longer reads `SCOUTUI_CI_UPLOAD_TOKEN`, so CI jobs that upload with it stop working. After upgrading, create a token on the Settings page of each repo that uploads from CI, save it as that repo's `SCOUTUI_TOKEN` CI secret, and remove `SCOUTUI_CI_UPLOAD_TOKEN` from the dashboard's environment.
