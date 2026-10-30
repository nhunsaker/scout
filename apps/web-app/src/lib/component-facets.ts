// Client-side faceted filtering for the repo-detail components table. The repo
// page sends every row to the browser on first load, so filtering runs locally.
//
// `FacetState` is kept in the page URL, one param per value (`FACET_PARAMS`).
// Facets combine with AND, and the values within a facet with OR.

import type { ComponentRow } from "@scoutui/web-shared";
import { friendlyKind, metadataValueLabel, metadataValueText, type QueryView } from "@scoutui/web-shared/client";
import { hrefWithQuery, type QueryParams } from "@/lib/query-string";

export type OriginValue = "external" | "local";
export type KindValue = QueryView["kind"];
export type OccurrenceOp = ">" | ">=" | "<" | "<=" | "=";

export type FacetState = {
  text: string; // free-text name search (case-insensitive substring on displayName)
  origin: OriginValue | null; // a component is either external or local, so single-select
  kinds: KindValue[]; // OR within
  packages: string[]; // OR within
  tags: string[]; // OR within (a row matches if it carries any selected tag)
  deprecated: boolean | null; // true = only deprecated with uses, false = only not-deprecated, null = any
  changed: boolean; // true = only rows that moved since the last scan (needs the diff's marks; applied by the explorer)
  occurrences: { op: OccurrenceOp; value: number } | null;
  usedIn: string | null; // one package; every count becomes that package's
  // Selected metadata values, by key: OR within a key, AND across keys (like tags, but keyed).
  // A key with no selected value is absent, never an empty array.
  properties: Record<string, string[]>;
};

export function emptyFacets(): FacetState {
  return { text: "", origin: null, kinds: [], packages: [], tags: [], deprecated: null, changed: false, occurrences: null, usedIn: null, properties: {} };
}

export const KIND_LABEL: Record<KindValue, string> = {
  react: "React",
  vue: "Vue",
  wc: "Web component",
  "undefined-element": "Undefined element",
};

export const ORIGIN_LABEL: Record<OriginValue, string> = {
  external: "External",
  local: "Local",
};

export const NO_PACKAGE_TITLE = "no import links this component to a package";

export const ORIGIN_DESCRIPTION: Record<OriginValue, string> = {
  external: "From outside this repo",
  local: "Defined in this repo",
};

/** True when any facet is active (i.e. the row set is being narrowed). */
export function isFiltering(f: FacetState): boolean {
  return (
    f.text.trim() !== "" ||
    f.origin !== null ||
    f.kinds.length > 0 ||
    f.packages.length > 0 ||
    f.tags.length > 0 ||
    f.deprecated !== null ||
    f.occurrences !== null ||
    f.usedIn !== null ||
    Object.values(f.properties).some((values) => values.length > 0) ||
    f.changed
  );
}

function occurrenceMatches(n: number, op: OccurrenceOp, v: number): boolean {
  switch (op) {
    case ">": return n > v;
    case ">=": return n >= v;
    case "<": return n < v;
    case "<=": return n <= v;
    case "=": return n === v;
  }
}

/** The written name the search text finds a row by, when its display name doesn't contain the text. */
export function writtenNameMatch(r: ComponentRow, text: string): string | undefined {
  const needle = text.trim().toLowerCase();
  if (!needle || r.displayName.toLowerCase().includes(needle)) return undefined;
  return r.writtenNames?.find((name) => name.toLowerCase().includes(needle));
}

/** A deprecated row with at least one use: what the deprecated chip counts and keeps. */
export function deprecatedInUse(r: ComponentRow): boolean {
  return r.deprecated && r.occurrenceCount > 0;
}

/** `properties` with `value` toggled under `key`: added if absent, removed if present. The key
 *  itself is dropped once its last value is removed, keeping the "no empty array" invariant. */
export function togglePropertyValue(properties: Record<string, string[]>, key: string, value: string): Record<string, string[]> {
  const current = properties[key] ?? [];
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  const result = { ...properties };
  if (next.length) result[key] = next;
  else delete result[key];
  return result;
}

/** The row's value under a metadata key, as plain text (see `metadataValueText`); undefined when the row carries no such key. */
export function propertyValueText(r: ComponentRow, key: string): string | undefined {
  const v = r.metadata?.[key];
  return v === undefined ? undefined : metadataValueText(v);
}

/** The row's value under a metadata key, for display (see `metadataValueLabel`: a `date` renders short); undefined when the row carries no such key. */
export function propertyValueLabel(r: ComponentRow, key: string): string | undefined {
  const v = r.metadata?.[key];
  return v === undefined ? undefined : metadataValueLabel(v);
}

/**
 * The metadata keys offered as optional table columns: the `limit` most common across `rows`
 * (every row the page knows, not the filtered set, so the choice doesn't shift as the table is
 * filtered), ties broken alphabetically.
 */
export function topMetadataKeys(rows: readonly ComponentRow[], limit = 3): string[] {
  const counts = new Map<string, number>();
  for (const r of rows) for (const key of Object.keys(r.metadata ?? {})) counts.set(key, (counts.get(key) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key]) => key);
}

/** The param the table's optional property columns live in. */
export const COLUMN_PARAMS = ["col"];

/** The `col` URL param: which of `topMetadataKeys` the table shows as columns. */
export function parsePropertyColumns(params: URLSearchParams): string[] {
  return [...new Set(params.getAll("col"))].filter(Boolean);
}

export function propertyColumnsToParams(columns: string[]): QueryParams {
  return columns.map((key) => ["col", key]);
}

/** Does a row match the facets? `changed` is the explorer's to apply; this never reads it. */
function matchesRow(r: ComponentRow, f: FacetState): boolean {
  const text = f.text.trim().toLowerCase();
  if (text && !r.displayName.toLowerCase().includes(text) && writtenNameMatch(r, text) === undefined) return false;
  if (f.origin && r.scope !== f.origin) return false;
  if (f.kinds.length && !f.kinds.includes(friendlyKind(r.kind))) return false;
  if (f.packages.length && !(r.packageName !== null && f.packages.includes(r.packageName))) return false;
  if (f.tags.length) {
    const rowTags = r.tags ?? [];
    if (!rowTags.some((t) => f.tags.includes(t.value))) return false;
  }
  if (f.deprecated === true && !deprecatedInUse(r)) return false;
  if (f.deprecated === false && r.deprecated) return false;
  if (f.occurrences && !occurrenceMatches(r.occurrenceCount, f.occurrences.op, f.occurrences.value)) return false;
  for (const [key, values] of Object.entries(f.properties)) {
    if (values.length === 0) continue;
    const rowValue = propertyValueText(r, key);
    if (rowValue === undefined || !values.includes(rowValue)) return false;
  }
  return true;
}

/** Apply the facet state to the full row set. Pure; memoise at the call site.
 *  `usedIn` is the explorer's to apply first, through `rowsUsedIn`; this never reads it. */
export function filterRows(rows: ComponentRow[], f: FacetState): ComponentRow[] {
  return rows.filter((r) => matchesRow(r, f));
}

/** The rows used in `pkg`, each with that package's uses and files. */
export function rowsUsedIn(rows: readonly ComponentRow[], pkg: string): ComponentRow[] {
  return rows.flatMap((r) => {
    const counts = r.usedIn?.[pkg];
    return counts ? [{ ...r, ...counts }] : [];
  });
}

/** Each package the rows are used in, with how many rows the other filters keep there; a selected package stays listed. */
export function usedInOptions(rows: readonly ComponentRow[], f: FacetState): { value: string; count: number }[] {
  const names = new Set(rows.flatMap((r) => Object.keys(r.usedIn ?? {})));
  if (f.usedIn) names.add(f.usedIn);
  return [...names]
    .map((value) => ({ value, count: filterRows(rowsUsedIn(rows, value), { ...f, usedIn: null }).length }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/** One metadata key's offered values, each with its count under the other filters. */
export type PropertyFacetOption = { key: string; values: { value: string; label: string; count: number }[] };

/** What the Filter menu and the status chips offer, each value with its count. */
export type FacetOptions = {
  origin: { external: number; local: number };
  kinds: { value: KindValue; count: number }[];
  packages: { value: string; count: number }[];
  tags: { value: string; color: string; count: number }[];
  /** Only keys the rows in scope carry (plus any selected key, even at 0); see `facetOptions`. */
  properties: PropertyFacetOption[];
  deprecatedCount: number;
  /** Rows the changed view shows under the other filters; null when there is no
   *  changed view to offer (a first scan, or no row moved). */
  changedCount: number | null;
  /** The most each chip's count can read under any filters (every deprecated
   *  row with uses, ghosts included; every changed-view row), so a chip can reserve that
   *  width and a count narrowing from 14 to 7 never slides the controls after it. */
  deprecatedMax: number;
  changedMax: number;
};

/**
 * Faceted counts: each count is the rows matching all the other active filters
 * (search text, occurrences and the statuses included). A facet ignores its own
 * selections, so a second package stays offered at its real count while every
 * other filter narrows the list. Counts are rows, through `matchesRow`.
 *
 * Every value the page knows (live rows and removed ghosts) is listed, zero
 * counts included, and so is any selected value it doesn't know: the menu can
 * tell "this repo has no tags" from "no tag matches the other filters", and a
 * selection stays visible at 0 so it can be unticked, even one missing from the
 * changed view's smaller set. Hiding zeros is the menu's job.
 *
 * `all` is every live row. `changed` is the changed view's candidates (marked
 * rows plus the removed ghosts), null when there is no changed view. Counts run
 * over `changed` when the changed view is on, otherwise over `all`. The chip counts
 * `changed` under every other filter, since the explorer applies `changed`
 * itself.
 */
export function facetOptions(
  all: readonly ComponentRow[],
  changed: readonly ComponentRow[] | null,
  f: FacetState,
): FacetOptions {
  const base = f.changed && changed !== null ? changed : all;
  const inBase = new Set(base.map((r) => r.componentId));
  const liveIds = new Set(all.map((r) => r.componentId));
  const known = changed === null ? all : [...all, ...changed.filter((r) => !liveIds.has(r.componentId))];
  const withoutOrigin: FacetState = { ...f, origin: null };
  const withoutKinds: FacetState = { ...f, kinds: [] };
  const withoutPackages: FacetState = { ...f, packages: [] };
  const withoutTags: FacetState = { ...f, tags: [] };
  const withoutDeprecated: FacetState = { ...f, deprecated: null };

  const origin = { external: 0, local: 0 };
  const kindCounts = new Map<KindValue, number>(f.kinds.map((k) => [k, 0]));
  const pkgCounts = new Map<string, number>(f.packages.map((p) => [p, 0]));
  const tagCounts = new Map<string, { color: string; count: number }>(f.tags.map((t) => [t, { color: "", count: 0 }]));
  let deprecatedCount = 0;

  // One map per selected or present key, each value → { label, count }; a selected value starts at 0
  // so it stays offered even where none of `known` carries it (e.g. only a removed ghost did).
  const propertyCounts = new Map<string, Map<string, { label: string; count: number }>>();
  for (const [key, values] of Object.entries(f.properties)) {
    propertyCounts.set(key, new Map(values.map((v) => [v, { label: v, count: 0 }])));
  }

  for (const r of known) {
    const counted = inBase.has(r.componentId);
    origin[r.scope] += counted && matchesRow(r, withoutOrigin) ? 1 : 0;
    const kind = friendlyKind(r.kind);
    kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + (counted && matchesRow(r, withoutKinds) ? 1 : 0));
    if (r.packageName) {
      pkgCounts.set(r.packageName, (pkgCounts.get(r.packageName) ?? 0) + (counted && matchesRow(r, withoutPackages) ? 1 : 0));
    }
    const inTags = counted && matchesRow(r, withoutTags) ? 1 : 0;
    for (const [value, color] of new Map((r.tags ?? []).map((t) => [t.value, t.color]))) {
      tagCounts.set(value, { color, count: (tagCounts.get(value)?.count ?? 0) + inTags });
    }
    if (counted && deprecatedInUse(r) && matchesRow(r, withoutDeprecated)) deprecatedCount++;
    for (const [key, raw] of Object.entries(r.metadata ?? {})) {
      const withoutKey: FacetState = { ...f, properties: { ...f.properties, [key]: [] } };
      if (!(counted && matchesRow(r, withoutKey))) continue;
      const values = propertyCounts.get(key) ?? new Map<string, { label: string; count: number }>();
      const value = metadataValueText(raw);
      const prev = values.get(value);
      values.set(value, { label: prev?.label ?? metadataValueLabel(raw), count: (prev?.count ?? 0) + 1 });
      propertyCounts.set(key, values);
    }
  }

  const kinds = (Object.keys(KIND_LABEL) as KindValue[])
    .filter((k) => kindCounts.has(k))
    .map((k) => ({ value: k, count: kindCounts.get(k) ?? 0 }))
    .sort((a, b) => b.count - a.count);
  const packages = [...pkgCounts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  const tags = [...tagCounts.entries()]
    .map(([value, { color, count }]) => ({ value, color, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  const properties = [...propertyCounts.entries()]
    .map(([key, values]) => ({
      key,
      values: [...values.entries()]
        .map(([value, { label, count }]) => ({ value, label, count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
  const changedCount = changed === null ? null : changed.filter((r) => matchesRow(r, f)).length;

  return {
    origin,
    kinds,
    packages,
    tags,
    properties,
    deprecatedCount,
    changedCount,
    deprecatedMax: known.filter(deprecatedInUse).length,
    changedMax: changed?.length ?? 0,
  };
}

// --- URL params ---------------------------------------------------------------

/** The params the components table keeps its facets in. One `prop` param per selected (key,
 *  value) pair, as `key:value` (split on the first colon); a key practice never puts a colon in
 *  (see the CLI's hook-script guide), so this round-trips the keys this dashboard actually sees. */
export const FACET_PARAMS = ["q", "origin", "kind", "package", "tag", "deprecated", "uses", "used-in", "changed", "prop"];

const KINDS: readonly KindValue[] = ["react", "vue", "wc", "undefined-element"];
const OCCURRENCE_WORDS: Record<OccurrenceOp, string> = { ">=": "gte:", ">": "gt:", "<=": "lte:", "<": "lt:", "=": "" };
const OCCURRENCE_RE = /^(gte:|gt:|lte:|lt:)?(\d+)$/;

/** A link to a repo's components table filtered to one package. */
export function packageFilterHref(repoId: string, packageName: string): string {
  return hrefWithQuery(`/repos/${encodeURIComponent(repoId)}`, facetsToParams({ ...emptyFacets(), packages: [packageName] }));
}

export function facetsToParams(f: FacetState): QueryParams {
  const params: [string, string][] = [];
  // Untrimmed, so a trailing space survives while the user is still typing; matching trims.
  if (f.text.trim() !== "") params.push(["q", f.text]);
  if (f.origin) params.push(["origin", f.origin]);
  for (const kind of f.kinds) params.push(["kind", kind]);
  for (const pkg of f.packages) params.push(["package", pkg]);
  for (const tag of f.tags) params.push(["tag", tag]);
  if (f.deprecated !== null) params.push(["deprecated", String(f.deprecated)]);
  if (f.occurrences) params.push(["uses", `${OCCURRENCE_WORDS[f.occurrences.op]}${f.occurrences.value}`]);
  if (f.usedIn) params.push(["used-in", f.usedIn]);
  if (f.changed) params.push(["changed", "true"]);
  for (const [key, values] of Object.entries(f.properties)) {
    for (const value of values) params.push(["prop", `${key}:${value}`]);
  }
  return params;
}

/** Facet state from the URL. Values it doesn't know are skipped, so a hand-edited link reads as far as it can. */
export function paramsToFacets(params: URLSearchParams): FacetState {
  const f = emptyFacets();
  f.text = params.get("q") ?? "";
  const origin = params.get("origin");
  if (origin === "external" || origin === "local") f.origin = origin;
  f.kinds = [...new Set(params.getAll("kind"))].filter((k): k is KindValue => KINDS.includes(k as KindValue));
  f.packages = [...new Set(params.getAll("package"))].filter(Boolean);
  f.tags = [...new Set(params.getAll("tag"))].filter(Boolean);
  const deprecated = params.get("deprecated");
  if (deprecated === "true" || deprecated === "false") f.deprecated = deprecated === "true";
  f.usedIn = params.get("used-in") || null;
  f.changed = params.get("changed") === "true";
  const om = OCCURRENCE_RE.exec(params.get("uses") ?? "");
  if (om) {
    const op = (Object.keys(OCCURRENCE_WORDS) as OccurrenceOp[]).find((k) => OCCURRENCE_WORDS[k] === (om[1] ?? ""));
    if (op) f.occurrences = { op, value: Number(om[2]) };
  }
  const properties: Record<string, string[]> = {};
  for (const raw of params.getAll("prop")) {
    const i = raw.indexOf(":");
    if (i < 0) continue;
    const key = raw.slice(0, i);
    const value = raw.slice(i + 1);
    if (!key || !value) continue;
    const values = properties[key] ?? [];
    if (!values.includes(value)) values.push(value);
    properties[key] = values;
  }
  f.properties = properties;
  return f;
}
