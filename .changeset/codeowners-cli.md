---
"@scoutui/cli": minor
---

`scout scan` now attributes each use, and each component defined in the repo, to its file's owners from a `CODEOWNERS` file (`.github/CODEOWNERS`, `CODEOWNERS` or `docs/CODEOWNERS`, found automatically). Owners show up as `codeOwners` on each occurrence and a `"Code owners"` property on each component; set `codeOwners` in `scout.config.json` to point at a different file or turn it off. A [hook script](https://scoutui.dev/docs/guides/add-custom-properties) can read `component.codeOwners` and override `"Code owners"`. See [Attribute code owners](https://scoutui.dev/docs/guides/attribute-code-owners).
