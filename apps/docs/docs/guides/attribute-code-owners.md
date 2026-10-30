---
description: "Attribute each use, and each component defined in the repo, to the team that owns its file, read from your CODEOWNERS file."
sidebar_label: "Attribute code owners"
---

# Attribute code owners

If your repository has a `CODEOWNERS` file, Scout reads it and attributes each use, and each component defined in the repo, to the team or person that owns the file it's written in. No configuration or hook script is needed: it's on by default.

## How Scout finds the file

A scan looks for the first of these that exists, at the repository root (the same folder `git rev-parse --show-toplevel` names, or [`--repo-root`](/docs/reference/cli#scan) when you pass it):

1. `.github/CODEOWNERS`
2. `CODEOWNERS`
3. `docs/CODEOWNERS`

This is the order GitHub itself checks. If none of the three exists, the scan carries on silently, with no attribution: a repository with no `CODEOWNERS` file is a normal case, not a warning.

To read a `CODEOWNERS` file somewhere else, point [`codeOwners`](/docs/reference/config#attribution-fields) at it:

```json title="scout.config.json"
{
  "codeOwners": "./config/CODEOWNERS"
}
```

The path is relative to the config folder. If nothing exists there, the scan warns and carries on without attribution. Set `codeOwners` to `false` to turn attribution off entirely.

## What gets attributed

| Where | Owners of |
| --- | --- |
| `occurrences[].codeOwners` | The file the use is written in. |
| `components[].metadata["Code owners"]` | The file a repository-declared component is defined in. Package components (installed from `node_modules`) get no entry: `CODEOWNERS` is a property of your repo, not a package's. |

Both are absent when the file has no owner. See [`codeOwners`](/docs/reference/artifact#occurrences) in the occurrences reference, and [`metadata`](/docs/reference/artifact#metadata) in the components reference.

```json title="An occurrence with an owned file"
{
  "occurrenceId": "686831181daeddbc",
  "resolution": { "status": "resolved", "componentId": "143bee555932e50c" },
  "filePath": "src/checkout/PaymentForm.tsx",
  "codeOwners": ["@example/checkout"]
}
```

```json title="A component's metadata"
{
  "Code owners": { "type": "string", "value": "@example/design-system, @example/checkout" }
}
```

## How matching works

`CODEOWNERS` patterns follow the same rules as `.gitignore`:

- Blank lines and lines starting with `#` are comments. A pattern that itself starts with `#` is written `\#` to escape it.
- A pattern starting with `/`, or with a `/` anywhere but a lone trailing one, is anchored to the repository root. Otherwise it matches at any depth: `*.js` owns every `.js` file, not just ones at the root.
- A pattern ending in `/` owns the whole directory: every file nested anywhere below it, however deep.
- A pattern without a trailing `/` matches files at its own position only. A single `*` never crosses a `/`, so `docs/*` owns `docs/getting-started.md` but not `docs/build-app/troubleshooting.md` — the same example GitHub's own docs use. Write `docs/**` to reach nested files too.
- **The last matching line wins.** A later line with a pattern and no owners clears ownership for the paths it matches, even if an earlier line claimed them.

| Pattern | Matches | Doesn't match |
| --- | --- | --- |
| `*` | Every file, at any depth. | |
| `*.js` | Every `.js` file, at any depth. | `src/App.tsx` |
| `/build/logs/` | `build/logs/error.log` and anything else under `build/logs`. | `app/build/logs/error.log` (not anchored under `app`) |
| `docs/*` | `docs/getting-started.md`. | `docs/build-app/troubleshooting.md` (nested one level deeper) |
| `apps/` | `apps/web/src/index.ts` — any file under an `apps` folder, at any depth. | |

GitLab's `[Section]` and `^[Optional Section]` headers are skipped like a comment: Scout reads ownership rules, not GitLab's per-section approval counts.

```text title="CODEOWNERS"
# Design system owns every component by default...
*.tsx @example/design-system

# ...except checkout, which owns its own.
src/checkout/ @example/checkout

# Generated files have no owner.
src/generated/
```

With this file, `src/checkout/PaymentForm.tsx` is owned by `@example/checkout` (the later, more specific rule wins over the first), and nothing under `src/generated/` has an owner, even though `*.tsx` would otherwise claim the `.tsx` files in it.

## Overriding from a hook script

A [hook script](/docs/guides/add-custom-properties) runs after this attribution, and can read it on `component.codeOwners` and each use's `codeOwners`:

```js title="scout.hook.mjs"
/** @type {import("@scoutui/cli").ScoutHook} */
export default {
  afterScan(components) {
    for (const component of components) {
      // Fold "Code owners" into your own "owner" property instead.
      if (component.codeOwners) component.setMetadata("owner", component.codeOwners[0]);
    }
  },
};
```

Setting any other property leaves `"Code owners"` alone. Call `component.setMetadata("Code owners", ...)` to replace it, for example to map a team handle to a friendlier name.

## Troubleshooting

| Message starts with | Fix |
| --- | --- |
| `"codeOwners" in scout.config.json points at <path>, which doesn't exist.` | Fix the path in `codeOwners`, or remove it to use the default locations. The scan continues without attribution. |

No `CODEOWNERS` file under the default locations is never a warning: most repositories don't have one.
