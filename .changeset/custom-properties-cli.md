---
"@scoutui/cli": minor
---

`scout scan` can now run a hook script after scanning to set custom properties on each component, such as its owner, whether it has stories, or a design-system version. Set `hookScript` in `scout.config.json`, or pass `--hook-script <path>`; `scout backfill` runs the configured script too. See [Add custom properties with a hook script](https://scoutui.dev/docs/guides/add-custom-properties).
