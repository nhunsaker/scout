import { z } from "zod";
import { isKnownMetadataValue, metadataValueText, type RawMetadataValue } from "./metadata.js";

/**
 * A tag's rule, and the matching behind it. Historically a tag only ever selected components by
 * PACKAGE NAME (`glob`/`exact`). PR-10 adds two more, independent ways to select a component:
 * by its display name (`component`) and by a scanned custom property (`property`), so a tag can
 * follow Omlet's "components whose name starts with Old" or "components whose Owner is
 * @acme/ds" without a matching package.
 */

// ---- Glob/exact patterns, shared by the package part and the component-name part ----

const globCache = new Map<string, RegExp>();

function globToRegExp(glob: string): RegExp {
  const hit = globCache.get(glob);
  if (hit) return hit;
  // Escape regex metacharacters, then turn `*` into `.*`.
  const escaped = glob.replace(/[.+^${}()|[\]\\?]/g, "\\$&").replace(/\*/g, ".*");
  const re = new RegExp(`^${escaped}$`);
  globCache.set(glob, re);
  return re;
}

export const PatternRuleSchema = z.object({
  glob: z.array(z.string()).default([]),
  exact: z.array(z.string()).default([]),
});
export type PatternRule = z.infer<typeof PatternRuleSchema>;

/** Whether `value` matches one of `pattern`'s exact entries or glob patterns (`*` = any run of characters). Vacuously false when `pattern` has neither — "no criteria" never matches, the same as before PR-10. */
export function patternMatches(pattern: PatternRule, value: string): boolean {
  if (pattern.exact.includes(value)) return true;
  return pattern.glob.some((g) => globToRegExp(g).test(value));
}

// ---- The property part: a scanned custom property (metadata key) ----

export const PropertyRuleSchema = z.object({
  key: z.string(),
  /** The key's value (as `metadataValueText` renders it) equals one of these. */
  equals: z.array(z.string()).optional(),
  /** The key's value contains this text, case-insensitively. */
  contains: z.string().optional(),
});
export type PropertyRule = z.infer<typeof PropertyRuleSchema>;

/** A metadata record as a scan file's open list carries it: a known value, or one of a future type this dashboard doesn't know (see `isKnownMetadataValue`). Both `ComponentDigest.metadata` and the dashboard's own filtered `ComponentMetadata` satisfy it. */
export type RawMetadataRecord = Record<string, RawMetadataValue>;

/**
 * Whether `metadata[property.key]` satisfies `property`: equals one of `equals` (exact text) or
 * contains `contains` (case-insensitive substring). An entry of a type this dashboard doesn't
 * know yet is ignored, like every other metadata reader (`isKnownMetadataValue`). Vacuously
 * false when `metadata` is undefined (this evaluation context has none to offer — see
 * `TagMatchTarget`), the key is absent, or `property` sets neither `equals` nor `contains`.
 */
export function propertyMatches(property: PropertyRule, metadata: RawMetadataRecord | undefined): boolean {
  if (!metadata) return false;
  const raw = metadata[property.key];
  if (raw === undefined || !isKnownMetadataValue(raw)) return false;
  const text = metadataValueText(raw);
  if (property.equals?.includes(text)) return true;
  if (property.contains !== undefined && property.contains !== "" && text.toLowerCase().includes(property.contains.toLowerCase())) return true;
  return false;
}

// ---- The tag rule itself ----

/**
 * A tag's match rule. `glob`/`exact` are the pre-PR-10 shape, unchanged: a package-name pattern,
 * matched exactly as `tagMatchesPackage` always has. `component` (a component's display name)
 * and `property` (a scanned custom property) are new, optional, independent parts.
 *
 * A stored `{glob, exact}` row with neither new field parses to the same `TagRule` it always
 * has (both new fields `undefined`) and matches exactly as before — see `tagRuleMatches`.
 */
export const TagRuleSchema = z.object({
  glob: z.array(z.string()).default([]), // ["@example/*"] — package name, as before PR-10
  exact: z.array(z.string()).default([]), // ["legacy-design-system"] — package name, as before PR-10
  component: PatternRuleSchema.optional(), // component display name
  property: PropertyRuleSchema.optional(), // a scanned custom property
});
export type TagRule = z.infer<typeof TagRuleSchema>;

/**
 * What a tag rule can be checked against, assembled by each caller from whatever it has to hand.
 * Leave `componentName`/`metadata` `undefined` (never `""` or `{}`) where that part genuinely
 * doesn't apply at that call site — a package summary row, a package-scoped facet has no single
 * component to name or read metadata from — so the rule's component/property parts simply don't
 * match there, rather than matching something that isn't real.
 */
export type TagMatchTarget = {
  packageName: string | null;
  componentName?: string | undefined;
  metadata?: RawMetadataRecord | undefined;
};

/**
 * Whether a component matches a tag's rule: true when it matches ANY part the rule sets — its
 * package pattern OR its component-name pattern OR its property rule.
 *
 * This is a deliberate OR, not an AND, and it's what keeps a pre-PR-10 package tag's meaning
 * identical: such a tag only ever sets the package part, so `component`/`property` are
 * `undefined` and can never flip a package match to `false`. AND would need the *same* "this
 * part isn't set" case to count as vacuously *true* instead, so a rule with only `component` set
 * doesn't also require a package it never named — making "not set" mean two different things for
 * the package part and the new parts. OR needs only the one, uniform rule: a part that isn't set
 * (or a target that can't evaluate it) never matches, and the overall rule matches target if any
 * part that *is* set, matches it.
 */
export function tagRuleMatches(rule: TagRule, target: TagMatchTarget): boolean {
  if (target.packageName !== null && patternMatches({ glob: rule.glob, exact: rule.exact }, target.packageName)) return true;
  if (rule.component && target.componentName !== undefined && patternMatches(rule.component, target.componentName)) return true;
  if (rule.property && propertyMatches(rule.property, target.metadata)) return true;
  return false;
}
