import { describe, it, expect } from "vitest";
import type { ComponentRow } from "@scoutui/web-shared";
import {
  emptyFacets,
  facetOptions,
  facetsToParams,
  filterRows,
  paramsToFacets,
  parsePropertyColumns,
  propertyColumnsToParams,
  propertyValueLabel,
  propertyValueText,
  rowsUsedIn,
  togglePropertyValue,
  topMetadataKeys,
  usedInOptions,
  writtenNameMatch,
  type FacetState,
} from "@/lib/component-facets";

const baseRow: ComponentRow = {
  componentId: "", kind: "react-component", scope: "local", packageName: null,
  displayName: "", disambiguator: null, version: null,
  occurrenceCount: 1, fileCount: 1, deprecated: false, tags: [],
};
import { queryString } from "@/lib/query-string";

describe("search text", () => {
  const row: ComponentRow = {
    componentId: "", kind: "react-component", scope: "local", packageName: null,
    displayName: "", disambiguator: null, version: null,
    occurrenceCount: 1, fileCount: 1, deprecated: false, tags: [],
  };
  const header: ComponentRow = { ...row, componentId: "header", displayName: "Header", writtenNames: ["SettingsHeader"] };
  const settings: ComponentRow = { ...row, componentId: "settings", displayName: "Settings" };

  it("finds a component by a name files write for it, and says which name matched", () => {
    const text = "settingsh";
    expect(filterRows([header, settings], { ...emptyFacets(), text }).map(r => r.componentId)).toEqual(["header"]);
    expect(writtenNameMatch(header, text)).toBe("SettingsHeader");
  });

  it("names no written name when the display name matches", () => {
    expect(filterRows([header, settings], { ...emptyFacets(), text: "settings" }).map(r => r.componentId)).toEqual(["header", "settings"]);
    expect(writtenNameMatch(header, "head")).toBeUndefined();
  });
});

describe("facetOptions: every count follows the other filters", () => {
  const ds = { id: "t-ds", value: "ds", category: null, color: "teal" as const };
  const row: ComponentRow = {
    componentId: "", kind: "react-component", scope: "external", packageName: null,
    displayName: "", disambiguator: null, version: null,
    occurrenceCount: 1, fileCount: 1, deprecated: false, tags: [],
  };
  const a: ComponentRow = { ...row, componentId: "a", displayName: "A", packageName: "@x/lib", tags: [ds], deprecated: true };
  const b: ComponentRow = { ...row, componentId: "b", displayName: "B", kind: "vue-component", packageName: "@x/lib" };
  const c: ComponentRow = { ...row, componentId: "c", displayName: "C", scope: "local", tags: [ds] };
  const d: ComponentRow = { ...row, componentId: "d", displayName: "D", packageName: "@y/ui" };
  const rows = [a, b, c, d];

  it("each facet counts under the other facets and ignores its own selections", () => {
    const o = facetOptions(rows, null, { ...emptyFacets(), packages: ["@x/lib"], kinds: ["react"] });
    // Packages ignore `package` but keep `kind:react`: B (vue) does not count toward @x/lib.
    expect(o.packages).toEqual([{ value: "@x/lib", count: 1 }, { value: "@y/ui", count: 1 }]);
    // Type ignores `kind` but keeps `package:@x/lib`: A (react) and B (vue).
    expect(o.kinds).toEqual([{ value: "react", count: 1 }, { value: "vue", count: 1 }]);
    // Origin, Tag and the deprecated chip keep both: only A.
    expect(o.origin).toEqual({ external: 1, local: 0 });
    expect(o.tags).toEqual([{ value: "ds", color: "teal", count: 1 }]);
    expect(o.deprecatedCount).toBe(1);
  });

  it("search text, occurrences and deprecated narrow every facet; deprecated ignores only itself", () => {
    const o = facetOptions(rows, null, { ...emptyFacets(), text: "c", deprecated: true });
    expect(o.origin).toEqual({ external: 0, local: 0 }); // C matches the text but is not deprecated
    expect(o.deprecatedCount).toBe(0);
    const occ = facetOptions(rows, null, { ...emptyFacets(), occurrences: { op: ">=", value: 2 } });
    expect(occ.packages).toEqual([{ value: "@x/lib", count: 0 }, { value: "@y/ui", count: 0 }]);
  });

  it("lists every value the base holds, at 0 when the other filters exclude it, so a selection stays visible", () => {
    const o = facetOptions(rows, null, { ...emptyFacets(), origin: "local", packages: ["@y/ui"] });
    expect(o.packages).toEqual([{ value: "@x/lib", count: 0 }, { value: "@y/ui", count: 0 }]);
  });

  it("counts the changed view's candidates, ghosts included, under every other filter; null without a changed view", () => {
    const ghost: ComponentRow = { ...row, componentId: "g", displayName: "Ghost", packageName: "@x/old", tags: [ds] };
    const changed = [b, ghost];
    expect(facetOptions(rows, changed, emptyFacets()).changedCount).toBe(2);
    expect(facetOptions(rows, changed, { ...emptyFacets(), tags: ["ds"] }).changedCount).toBe(1);
    // `changed` itself never narrows the chip's own count.
    expect(facetOptions(rows, changed, { ...emptyFacets(), changed: true, tags: ["ds"] }).changedCount).toBe(1);
    expect(facetOptions(rows, null, emptyFacets()).changedCount).toBeNull();
    // In the changed view the counts run over the view's rows: a package only a
    // ghost had is offered, and an unmoved package is still listed, at 0.
    const inView = facetOptions(rows, changed, { ...emptyFacets(), changed: true, packages: ["@y/ui"] }).packages;
    expect(inView).toContainEqual({ value: "@x/old", count: 1 });
    expect(inView).toContainEqual({ value: "@x/lib", count: 1 }); // B only; A did not move
    expect(inView).toContainEqual({ value: "@y/ui", count: 0 });
  });

  it("reports each chip's ceiling regardless of filters: every deprecated row, ghosts included, and every changed-view row", () => {
    const depGhost: ComponentRow = { ...row, componentId: "dg", displayName: "DepGhost", deprecated: true };
    const changed = [b, depGhost];
    const narrow = { ...emptyFacets(), changed: true, text: "zzz", deprecated: true };
    expect(facetOptions(rows, changed, narrow)).toMatchObject({ deprecatedCount: 0, changedCount: 0, deprecatedMax: 2, changedMax: 2 });
    expect(facetOptions(rows, null, emptyFacets())).toMatchObject({ deprecatedMax: 1, changedMax: 0 });
  });

  it("counts and keeps only deprecated rows with uses under the deprecated chip", () => {
    const unused: ComponentRow = { ...row, componentId: "u", displayName: "Unused", packageName: "@x/lib", deprecated: true, occurrenceCount: 0, fileCount: 0 };
    const all = [...rows, unused];
    expect(facetOptions(all, null, emptyFacets())).toMatchObject({ deprecatedCount: 1, deprecatedMax: 1 });
    expect(filterRows(all, { ...emptyFacets(), deprecated: true }).map(r => r.componentId)).toEqual(["a"]);
  });

  it("lists a selected value the page doesn't know, at 0, so a pasted URL's selection can be unticked", () => {
    const o = facetOptions(rows, null, { ...emptyFacets(), packages: ["@nope/pkg"], tags: ["gone"] });
    expect(o.packages).toContainEqual({ value: "@nope/pkg", count: 0 });
    expect(o.tags).toContainEqual({ value: "gone", color: "", count: 0 });
  });

  it("lists a framework this dashboard doesn't know by name as its own kind, never folded into react", () => {
    const svelteRow: ComponentRow = { ...row, componentId: "s", displayName: "S", kind: "svelte-component" };
    const o = facetOptions([...rows, svelteRow], null, emptyFacets());
    expect(o.kinds).toContainEqual({ value: "svelte", count: 1 });
    expect(o.kinds).toContainEqual({ value: "react", count: 3 }); // a, c, d: unchanged, not inflated by the svelte row
  });
});

describe("Has unused props", () => {
  const declared = { ...baseRow, componentId: "d", displayName: "Panel", apiUsage: { declaredCount: 2, neverUsedCount: 1 } };
  const fullyUsed = { ...baseRow, componentId: "f", displayName: "Field", apiUsage: { declaredCount: 2, neverUsedCount: 0 } };
  const undeclared = { ...baseRow, componentId: "u", displayName: "Tag" }; // no declared API: never has unused props

  it("keeps only rows with at least one never-used declared prop", () => {
    expect(filterRows([declared, fullyUsed, undeclared], { ...emptyFacets(), hasUnusedProps: true }).map(r => r.componentId)).toEqual(["d"]);
  });

  it("without the filter, keeps every row regardless of declared API", () => {
    expect(filterRows([declared, fullyUsed, undeclared], emptyFacets()).map(r => r.componentId)).toEqual(["d", "f", "u"]);
  });

  it("hasUnusedProps:false, reachable only from a pasted URL, excludes rows with an unused prop", () => {
    expect(filterRows([declared, fullyUsed, undeclared], { ...emptyFacets(), hasUnusedProps: false }).map(r => r.componentId)).toEqual(["f", "u"]);
  });

  it("counts under the other filters and ignores its own selection", () => {
    const o = facetOptions([declared, fullyUsed, undeclared], null, { ...emptyFacets(), hasUnusedProps: true });
    expect(o.hasUnusedPropsCount).toBe(1);
    expect(o.hasUnusedPropsMax).toBe(1);
  });
});

describe("Used in", () => {
  const base: ComponentRow = {
    componentId: "", kind: "react-component", scope: "local", packageName: null,
    displayName: "", disambiguator: null, version: null,
    occurrenceCount: 0, fileCount: 0, deprecated: false, tags: [],
  };
  const row = (r: Partial<ComponentRow>): ComponentRow => ({ ...base, ...r });
  const counts = (occurrenceCount: number, fileCount: number) => ({ occurrenceCount, fileCount });
  const shared = row({ componentId: "a", displayName: "SharedButton", occurrenceCount: 4, fileCount: 3,
    usedIn: { "@example/web": counts(2, 1), "@example/playground": counts(1, 1), "whole-repo-scope": counts(1, 1) } });
  const button = row({ componentId: "b", displayName: "Button", occurrenceCount: 2, fileCount: 2,
    usedIn: { "@example/web": counts(1, 1), "@example/shared-ui": counts(1, 1) } });
  const unused = row({ componentId: "c", displayName: "Demo", occurrenceCount: 0, fileCount: 0 });

  it("keeps the rows used in the package, with that package's uses and files", () => {
    expect(rowsUsedIn([shared, button, unused], "@example/web").map(r => [r.displayName, r.occurrenceCount, r.fileCount]))
      .toEqual([["SharedButton", 2, 1], ["Button", 1, 1]]);
  });

  it("offers each package with its rows under the other filters, and keeps a selected package the rows don't have", () => {
    expect(usedInOptions([shared, button, unused], { ...emptyFacets(), text: "shared", usedIn: "@example/renamed" })).toEqual([
      { value: "@example/playground", count: 1 },
      { value: "@example/web", count: 1 },
      { value: "whole-repo-scope", count: 1 },
      { value: "@example/renamed", count: 0 },
      { value: "@example/shared-ui", count: 0 },
    ]);
  });
});

describe("URL params", () => {
  it.each<[string, Partial<FacetState>, string]>([
    ["search text", { text: "date picker" }, "q=date+picker"],
    ["origin", { origin: "local" }, "origin=local"],
    ["one kind param per kind", { kinds: ["react", "vue"] }, "kind=react&kind=vue"],
    ["an undefined element", { kinds: ["undefined-element"] }, "kind=undefined-element"],
    ["an open kind (a framework this dashboard doesn't know by name)", { kinds: ["svelte"] }, "kind=svelte"],
    ["one package param per package", { packages: ["@acme/ui", "@acme/icons"] }, "package=@acme/ui&package=@acme/icons"],
    ["one tag param per tag", { tags: ["icons", "acme-ui"] }, "tag=icons&tag=acme-ui"],
    ["deprecated", { deprecated: true }, "deprecated=true"],
    ["not deprecated", { deprecated: false }, "deprecated=false"],
    ["at least N uses", { occurrences: { op: ">=", value: 10 } }, "uses=gte:10"],
    ["more than N uses", { occurrences: { op: ">", value: 10 } }, "uses=gt:10"],
    ["at most N uses", { occurrences: { op: "<=", value: 10 } }, "uses=lte:10"],
    ["fewer than N uses", { occurrences: { op: "<", value: 10 } }, "uses=lt:10"],
    ["exactly N uses", { occurrences: { op: "=", value: 10 } }, "uses=10"],
    ["used in one package", { usedIn: "@example/web" }, "used-in=@example/web"],
    ["changed since the previous scan", { changed: true }, "changed=true"],
    ["has unused props", { hasUnusedProps: true }, "unused-props=true"],
    ["has no unused props", { hasUnusedProps: false }, "unused-props=false"],
    ["one value of one property", { properties: { Owner: ["@acme/ds"] } }, "prop=Owner:@acme/ds"],
    ["two values of one property (OR within)", { properties: { Owner: ["@acme/ds", "@acme/other"] } }, "prop=Owner:@acme/ds&prop=Owner:@acme/other"],
    ["one value each of two properties (AND across)", { properties: { Owner: ["@acme/ds"], "Has stories": ["true"] } }, "prop=Owner:@acme/ds&prop=Has+stories:true"],
  ])("writes and reads %s", (_case, facets, written) => {
    const f = { ...emptyFacets(), ...facets };
    expect(queryString(facetsToParams(f))).toBe(written);
    expect(paramsToFacets(new URLSearchParams(written))).toEqual(f);
  });

  it("writes no params for no filters", () => {
    expect(facetsToParams(emptyFacets())).toEqual([]);
  });

  it.each([
    ["a param it doesn't know", "usages=gte:10"],
    ["an origin it doesn't know", "origin=elsewhere"],
    ["an empty kind", "kind="],
    ["uses it can't read", "uses=>=10"],
    ["deprecated other than true or false", "deprecated=yes"],
    ["changed other than true", "changed=yes"],
    ["unused-props other than true or false", "unused-props=yes"],
    ["a prop with no colon separating its key and value", "prop=OwnerOnly"],
    ["a prop with an empty value", "prop=Owner:"],
  ])("ignores %s", (_case, written) => {
    expect(paramsToFacets(new URLSearchParams(written))).toEqual(emptyFacets());
  });

  it("reads a repeated value once", () => {
    expect(paramsToFacets(new URLSearchParams("tag=icons&tag=icons")).tags).toEqual(["icons"]);
  });

  it("dedupes a repeated property value within the same key", () => {
    expect(paramsToFacets(new URLSearchParams("prop=Owner:ds&prop=Owner:ds")).properties).toEqual({ Owner: ["ds"] });
  });
});

describe("Properties", () => {
  const row: ComponentRow = {
    componentId: "", kind: "react-component", scope: "local", packageName: null,
    displayName: "", disambiguator: null, version: null,
    occurrenceCount: 1, fileCount: 1, deprecated: false, tags: [],
  };
  const dsOwned = { ...row, componentId: "d", displayName: "Panel", metadata: { Owner: { type: "string" as const, value: "@acme/ds" }, "Has stories": { type: "boolean" as const, value: true } } };
  const otherOwned = { ...row, componentId: "o", displayName: "Field", metadata: { Owner: { type: "string" as const, value: "@acme/other" } } };
  const unowned = { ...row, componentId: "u", displayName: "Tag" };

  it("keeps only rows whose value for the key is one of the selected values (OR within a key)", () => {
    expect(filterRows([dsOwned, otherOwned, unowned], { ...emptyFacets(), properties: { Owner: ["@acme/ds", "@acme/other"] } }).map(r => r.componentId)).toEqual(["d", "o"]);
    expect(filterRows([dsOwned, otherOwned, unowned], { ...emptyFacets(), properties: { Owner: ["@acme/ds"] } }).map(r => r.componentId)).toEqual(["d"]);
  });

  it("ANDs across keys: a row must carry every selected key with one of its values", () => {
    const f = { ...emptyFacets(), properties: { Owner: ["@acme/ds"], "Has stories": ["true"] } };
    expect(filterRows([dsOwned, otherOwned, unowned], f).map(r => r.componentId)).toEqual(["d"]);
  });

  it("without the filter, keeps every row regardless of metadata", () => {
    expect(filterRows([dsOwned, otherOwned, unowned], emptyFacets()).map(r => r.componentId)).toEqual(["d", "o", "u"]);
  });

  it("facetOptions: each key's value counts follow the other filters and ignore that key's own selection", () => {
    const options = facetOptions([dsOwned, otherOwned, unowned], null, { ...emptyFacets(), properties: { Owner: ["@acme/ds"] } });
    const owner = options.properties.find(p => p.key === "Owner");
    expect(owner?.values).toEqual([
      { value: "@acme/ds", label: "@acme/ds", count: 1 },
      { value: "@acme/other", label: "@acme/other", count: 1 },
    ]);
  });

  it("facetOptions: only offers keys the rows carry, a boolean rendered by its text form", () => {
    const options = facetOptions([dsOwned, otherOwned, unowned], null, emptyFacets());
    expect(options.properties.map(p => p.key)).toEqual(["Has stories", "Owner"]);
    expect(options.properties.find(p => p.key === "Has stories")?.values).toEqual([{ value: "true", label: "true", count: 1 }]);
  });

  it("togglePropertyValue adds, removes, and drops the key once its last value is removed", () => {
    const added = togglePropertyValue({}, "Owner", "@acme/ds");
    expect(added).toEqual({ Owner: ["@acme/ds"] });
    const extended = togglePropertyValue(added, "Owner", "@acme/other");
    expect(extended).toEqual({ Owner: ["@acme/ds", "@acme/other"] });
    const removedOne = togglePropertyValue(extended, "Owner", "@acme/ds");
    expect(removedOne).toEqual({ Owner: ["@acme/other"] });
    const removedLast = togglePropertyValue(removedOne, "Owner", "@acme/other");
    expect(removedLast).toEqual({});
  });

  it("propertyValueText/propertyValueLabel read a row's value by key, undefined when absent", () => {
    expect(propertyValueText(dsOwned, "Owner")).toBe("@acme/ds");
    expect(propertyValueText(dsOwned, "Missing")).toBeUndefined();
    expect(propertyValueLabel(dsOwned, "Has stories")).toBe("true");
  });

  it("topMetadataKeys: the N most common keys by presence count, ties broken alphabetically", () => {
    // Owner appears on both rows (count 2); Has stories only on one (count 1): Owner ranks first.
    expect(topMetadataKeys([dsOwned, otherOwned, unowned], 1)).toEqual(["Owner"]);
    expect(topMetadataKeys([dsOwned, otherOwned, unowned])).toEqual(["Owner", "Has stories"]);
    expect(topMetadataKeys([unowned])).toEqual([]);
  });

  it("topMetadataKeys: breaks a count tie alphabetically", () => {
    const a = { ...row, componentId: "a", metadata: { Zeta: { type: "string" as const, value: "1" } } };
    const b = { ...row, componentId: "b", metadata: { Alpha: { type: "string" as const, value: "1" } } };
    expect(topMetadataKeys([a, b])).toEqual(["Alpha", "Zeta"]);
  });

  it("the col param round-trips a repeated value, deduped", () => {
    expect(propertyColumnsToParams(["Owner", "Has stories"])).toEqual([["col", "Owner"], ["col", "Has stories"]]);
    expect(parsePropertyColumns(new URLSearchParams("col=Owner&col=Owner&col=DS+version"))).toEqual(["Owner", "DS version"]);
    expect(parsePropertyColumns(new URLSearchParams(""))).toEqual([]);
  });
});
