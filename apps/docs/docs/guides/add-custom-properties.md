---
description: "Write a hook script that sets custom properties, such as an owner or a design-system version, on each component the scan finds."
sidebar_label: "Add custom properties"
---

# Add custom properties with a hook script

A scan already counts a component's uses, props and composition. A *custom property* is anything else you want to track against it: who owns it, whether it has stories, how many props its own code declares, which version of your design system it's built on. You compute these yourself, in a small script the CLI runs after each scan, and they show up on the component's page on the dashboard alongside everything else the scan found.

This guide assumes you already have a working `scout.config.json`. If you don't, see [Configure a scan](/docs/guides/configure-a-scan).

## 1. Write the hook script

Create a script next to your config, for example `scout.hook.mjs`:

```js title="scout.hook.mjs"
/** @type {import("@scoutui/cli").ScoutHook} */
export default {
  afterScan(components, context) {
    for (const component of components) {
      component.setMetadata("owner", "design-systems");
    }
  },
};
```

Export a default object with an `afterScan(components, context)` function, as above, or export `afterScan` directly:

```js title="scout.hook.mjs"
export function afterScan(components, context) {
  // ...
}
```

A CommonJS script (`.cjs`) works the same way with `module.exports`. The JSDoc comment on the default export isn't required, but it gives you autocomplete for `components`, `context` and `setMetadata` in editors that read `@scoutui/cli`'s types.

`afterScan` can be `async`. The scan waits for it before validating and uploading.

## 2. Point the config at it

```json title="scout.config.json"
{
  "$schema": "https://unpkg.com/@scoutui/cli/schema/config.schema.json",
  "repoId": "storefront",
  "hookScript": "./scout.hook.mjs"
}
```

`hookScript` is relative to the config's folder. `scout backfill` runs it too, through the same config, once per commit it scans. To try a different script without editing the config, pass [`--hook-script <path>`](/docs/reference/cli#scan) to `scout scan`; it's relative to the current directory and replaces `hookScript`.

Run a dry run to check it:

```bash
npx scout scan --dry-run
jq '.components[0].metadata' scout-scan.json
```

## The `afterScan` API

| Argument | Type | Description |
| --- | --- | --- |
| `components` | `HookComponent[]` | Every component this scan found, read-only. |
| `context` | object | `repoId`, `commit`, `configDir` (absolute path to the config's folder) and `repoRoot` (absolute path every `filePath` below is relative to). |

Each `HookComponent` is a snapshot: everything but `setMetadata` is frozen, and changing it has no effect.

| Field | Type | Description |
| --- | --- | --- |
| `id` | `string` | The component's id in the scan file. |
| `name` | `string` | The name Scout shows for it on the dashboard. |
| `identity` | object | Same shape as [`identity`](/docs/reference/artifact#component-identity) in the scan file. |
| `framework` | `"react" \| "vue"` \| absent | Absent on web components. |
| `filePath` | `string` \| absent | Repository-relative path to the declaration. Present only on a component defined in the repo. |
| `packageName` | `string` \| absent | Present only on a component imported from a package. |
| `version` | `string \| null` | Same as [`version`](/docs/reference/artifact#components) in the scan file. |
| `declaredProps` | `string[]` \| absent | Names of the props the component's own code declares, in source order. Present only when the declaration site is readable; see [`declared`](/docs/reference/artifact#declared). |
| `uses` | `{ filePath, line, column }[]` | Every place this scan found the component rendered. |
| `setMetadata(key, value)` | function | Sets a custom property. See below. |

## Setting values

```js
component.setMetadata("owner", "design-systems");
component.setMetadata("hasStories", true);
component.setMetadata("propCount", component.declaredProps?.length ?? 0);
component.setMetadata("reviewed", new Date());
```

`key` is the property's name, shown as-is on the dashboard. `value` is a string, a finite number, a boolean or a `Date`. Limits:

| Rule | Limit |
| --- | --- |
| Key pattern | Starts with a letter; letters, digits, spaces, `.`, `_` and `-` after that; up to 64 characters. |
| Keys per component | 32. |
| String length | 256 characters. |

An invalid key, a value that isn't one of the four types above (including `NaN`, `Infinity` or an invalid `Date`), a string over the length limit, or a 33rd key on one component, is dropped. The scan still succeeds: it prints one warning per rule that dropped at least one value, not one per call, for example:

```
Warning: 3 custom properties dropped: its value isn't a string, number, boolean or Date.
```

Setting the same key twice keeps the last value. A `Date` is stored as an ISO 8601 timestamp, same as everywhere else in the scan file; see [`metadata`](/docs/reference/artifact#metadata).

## Examples

### Owner, from `CODEOWNERS`

A minimal parser for a `CODEOWNERS` file with simple path entries (no globs):

```js title="scout.hook.mjs"
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readOwners(repoRoot) {
  const text = readFileSync(join(repoRoot, "CODEOWNERS"), "utf8");
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const [path, ...owners] = line.split(/\s+/);
      return { path, owners };
    });
}

function ownerFor(filePath, entries) {
  // CODEOWNERS: the last matching entry wins.
  const match = [...entries].reverse().find((e) => filePath.startsWith(e.path.replace(/^\//, "")));
  return match?.owners.join(", ");
}

/** @type {import("@scoutui/cli").ScoutHook} */
export default {
  afterScan(components, context) {
    const entries = readOwners(context.repoRoot);
    for (const component of components) {
      if (component.filePath) component.setMetadata("owner", ownerFor(component.filePath, entries) ?? "unowned");
    }
  },
};
```

### Whether it has stories

```js
import { existsSync } from "node:fs";
import { join } from "node:path";

for (const component of components) {
  if (!component.filePath) continue;
  const storiesPath = join(context.repoRoot, component.filePath.replace(/\.(tsx|jsx)$/, ".stories.$1"));
  component.setMetadata("hasStories", existsSync(storiesPath));
}
```

### Number of props

```js
for (const component of components) {
  if (component.declaredProps) component.setMetadata("propCount", component.declaredProps.length);
}
```

### Design-system version, from a package's own version

```js
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

for (const component of components) {
  try {
    const pkg = JSON.parse(readFileSync(require.resolve("@acme/ui/package.json"), "utf8"));
    component.setMetadata("designSystemVersion", pkg.version);
  } catch {
    // @acme/ui isn't installed in this repo.
  }
}
```

## Using it in CI

A hook script runs with `scan`, so it needs no extra step in CI: commit it alongside `scout.config.json`, and make sure anything it reads, such as `CODEOWNERS`, is checked out before the scan runs. See [Run a scan and upload in CI](/docs/guides/run-in-ci). If the script needs packages beyond Node's built-ins, add them to the repo's own `dependencies` or `devDependencies` so CI installs them.

## Security

A hook script runs with the same permissions as the CLI itself, as part of your own build: it can read and write anywhere the CLI process can. Only point `hookScript` at a script your repo controls, the same way you'd trust any other build step.

## Troubleshooting

| Message starts with | Fix |
| --- | --- |
| `Couldn't find the hook script` | Check `hookScript` in the config, or the `--hook-script` path: it's relative to the config folder (or the current directory for `--hook-script`), and the file must exist. |
| `Couldn't load the hook script <path>:` | The script has a syntax error, or throws while loading (for example, importing a package that isn't installed). The rest of the message is the underlying error. |
| `The hook script <path> doesn't export afterScan.` | Export a default object with an `afterScan` function, or export `afterScan` directly. See [Write the hook script](#1-write-the-hook-script). |
| `The hook script <path> failed:` | `afterScan` threw. The rest of the message is the error it threw. |
| `Warning: N custom propert(y/ies) dropped: ...` | One of the [limits](#setting-values) rejected a value; the scan still succeeded. Fix the script to send a valid key or value, or stay under 32 keys per component. |

A missing script, one with no `afterScan`, or one that throws, stops the scan: a hook you asked for that silently didn't run would leave the dashboard with the wrong properties, not just missing ones, so Scout fails loudly instead.
