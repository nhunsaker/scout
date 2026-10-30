import type { CohortSelector, TagRule } from "@scoutui/web-shared";
import { tagMatches } from "@scoutui/web-shared/client";

/** A component the chart builder can add as a series, with its uses in each repo's latest scan. */
export type PickableComponent = {
  componentId: string;
  displayName: string;
  packageName: string | null;
  disambiguator: string | null;
  deprecated: boolean;
  occurrences: number;
  /** Defined in a scanned repo rather than imported from a package. */
  local: boolean;
  /** Null while a latest scan holds it, otherwise when the newest scan holding it was made. */
  lastSeenAt: string | null;
};

export type LibraryTag = { id: string; label: string; color: string; rule: TagRule };
export type DeprecatableSelector = Extract<CohortSelector, { kind: "package" | "tag" }>;
export type DeprecatedShare = { deprecated: number; total: number };

/** No per-component metadata reaches the chart builder (`PickableComponent` carries none), so a
 *  tag's property part can't be previewed here — only its package and component-name parts can. */
function inSeries(sel: DeprecatableSelector, c: PickableComponent, tags: LibraryTag[]): boolean {
  if (sel.kind === "package") return c.packageName === sel.packageName;
  const tag = tags.find((t) => t.id === sel.tagId);
  return tag !== undefined && tagMatches(tag, { packageName: c.packageName, componentName: c.displayName });
}

/** How many of `components` a package or tag series covers, and how many of those are deprecated. */
export function deprecatedShare(sel: DeprecatableSelector, components: PickableComponent[], tags: LibraryTag[]): DeprecatedShare {
  let deprecated = 0;
  let total = 0;
  for (const c of components) {
    if (!inSeries(sel, c, tags)) continue;
    total += 1;
    if (c.deprecated) deprecated += 1;
  }
  return { deprecated, total };
}

/** True when narrowing to deprecated components changes the series, or when it is already on. */
export function offersDeprecatedOnly(sel: DeprecatableSelector, share: DeprecatedShare): boolean {
  return sel.deprecatedOnly === true || (share.deprecated > 0 && share.deprecated < share.total);
}

export function deprecatedShareText({ deprecated, total }: DeprecatedShare, name: string): string | null {
  if (total === 0) return null;
  return `${deprecated} of ${total} ${total === 1 ? "component" : "components"} in ${name} ${deprecated === 1 ? "is" : "are"} deprecated`;
}

export function tagsInUse(tags: LibraryTag[], components: PickableComponent[]): LibraryTag[] {
  // Dedupe by (package, name): many components across repos share one.
  const targets = new Map(components.map((c) => [`${c.packageName ?? ""}\u0000${c.displayName}`, { packageName: c.packageName, componentName: c.displayName }]));
  return tags.filter((t) => [...targets.values()].some((target) => tagMatches(t, target)));
}
