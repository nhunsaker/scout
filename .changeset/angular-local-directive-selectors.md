---
"@scoutui/cli": patch
---

An element that a `@Directive` declared in your own repo selects, such as `<hlm-field>` for `@Directive({ selector: "hlm-field, [hlmField]" })`, is no longer reported as a custom element. Before, only directives from installed packages were recognised, so every element your repo's own directives claim showed up as a web component. Directives still aren't counted as components.
