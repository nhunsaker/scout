import type { Tag, TagRef } from "./dto.js";
import { patternMatches, tagRuleMatches, type TagMatchTarget } from "./tag-rules.js";

export type { TagMatchTarget } from "./tag-rules.js";

/**
 * Whether `packageName` matches a tag's PACKAGE pattern only — the component-name and property
 * parts of the rule don't apply here, because there's no single component to check them
 * against. Used where only a package name is available: a package summary row, a package-scoped
 * facet, or a package-name preview in the tag editor. For a component, use `resolveTags`/
 * `tagMatches` with a fuller `TagMatchTarget` instead, so its name and metadata are considered.
 */
export function tagMatchesPackage(tag: Pick<Tag, "rule">, packageName: string): boolean {
  return patternMatches({ glob: tag.rule.glob, exact: tag.rule.exact }, packageName);
}

/** Whether a component matches a tag: by its package, its display name, or a scanned property — see `tagRuleMatches`. */
export function tagMatches(tag: Pick<Tag, "rule">, target: TagMatchTarget): boolean {
  return tagRuleMatches(tag.rule, target);
}

/**
 * Resolve the tags that apply to a component. `target` carries whatever the caller has: a bare
 * `{ packageName }` (nullable) only evaluates each tag's package part, same as before PR-10;
 * adding `componentName` and/or `metadata` lets a tag also match by name or property, including
 * for a local component (`packageName: null`) that a name/property rule can still select.
 */
export function resolveTags(target: TagMatchTarget, tags: Tag[]): TagRef[] {
  const refs: TagRef[] = [];
  for (const t of tags) {
    if (tagMatches(t, target)) {
      refs.push({ id: t.id, value: t.value, category: t.category, color: t.color });
    }
  }
  return refs;
}

/**
 * Decorate already-projected rows with their resolved tags (read-time, cache-safe). Package-only:
 * these rows (a package summary, a package facet) carry nothing a rule's component/property
 * parts could match, so only each tag's package part is evaluated — see `tagMatchesPackage`.
 */
export function attachTags<T extends { packageName: string | null }>(
  rows: T[],
  tags: Tag[],
): Array<T & { tags: TagRef[] }> {
  return rows.map((r) => ({ ...r, tags: resolveTags({ packageName: r.packageName }, tags) }));
}

/** The library-category tags, sorted by value. */
export function libraryTags(tags: Tag[]): Tag[] {
  return tags
    .filter((t) => t.category === "library")
    .sort((a, b) => a.value.localeCompare(b.value));
}
