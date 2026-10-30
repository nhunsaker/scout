import { describe, it, expect } from "vitest";
import { PropertyRuleSchema, TagRuleSchema, propertyMatches, tagRuleMatches, type TagRule } from "../src/tag-rules.js";

const rule = (partial: Partial<TagRule>): TagRule => ({ glob: [], exact: [], ...partial });

describe("TagRuleSchema", () => {
  it("parses the pre-PR-10 shape unchanged: no component/property keys come out of it", () => {
    const stored = { glob: ["@example/*"], exact: ["legacy-kit"] };
    const parsed = TagRuleSchema.parse(stored);
    expect(parsed).toEqual(stored);
    expect("component" in parsed).toBe(false);
    expect("property" in parsed).toBe(false);
  });

  it("defaults glob/exact to [] when absent, as before", () => {
    expect(TagRuleSchema.parse({})).toEqual({ glob: [], exact: [] });
  });

  it("parses the new component and property parts", () => {
    const stored = {
      glob: [], exact: [],
      component: { glob: ["Old*"], exact: [] },
      property: { key: "Owner", equals: ["@acme/ds"], contains: "ds" },
    };
    expect(TagRuleSchema.parse(stored)).toEqual(stored);
  });

  it("defaults a component rule's glob/exact to [] too", () => {
    expect(TagRuleSchema.parse({ component: {} }).component).toEqual({ glob: [], exact: [] });
  });

  it("rejects a property rule with no key", () => {
    expect(PropertyRuleSchema.safeParse({ equals: ["x"] }).success).toBe(false);
  });
});

describe("tagRuleMatches: package part (unchanged pre-PR-10 behaviour)", () => {
  it("matches a package glob", () => {
    expect(tagRuleMatches(rule({ glob: ["@example/*"] }), { packageName: "@example/ui" })).toBe(true);
  });
  it("matches an exact package name", () => {
    expect(tagRuleMatches(rule({ exact: ["legacy-kit"] }), { packageName: "legacy-kit" })).toBe(true);
  });
  it("doesn't match an unrelated package", () => {
    expect(tagRuleMatches(rule({ glob: ["@example/*"] }), { packageName: "react" })).toBe(false);
  });
  it("never matches a null packageName by the package part alone", () => {
    expect(tagRuleMatches(rule({ glob: ["*"] }), { packageName: null })).toBe(false);
  });
});

describe("tagRuleMatches: component-name part", () => {
  const legacy = rule({ component: { glob: ["Old*"], exact: ["LegacyModal"] } });

  it("matches a component-name glob", () => {
    expect(tagRuleMatches(legacy, { packageName: null, componentName: "OldButton" })).toBe(true);
  });
  it("matches an exact component name", () => {
    expect(tagRuleMatches(legacy, { packageName: "@example/ui", componentName: "LegacyModal" })).toBe(true);
  });
  it("doesn't match an unrelated component name", () => {
    expect(tagRuleMatches(legacy, { packageName: null, componentName: "NewButton" })).toBe(false);
  });
  it("doesn't apply when the target has no component name to check (a package-only target)", () => {
    expect(tagRuleMatches(legacy, { packageName: null })).toBe(false);
  });
  it("is independent of the package part: a tag with only glob/exact set never matches by name", () => {
    expect(tagRuleMatches(rule({ glob: ["*"] }), { packageName: null, componentName: "OldButton" })).toBe(false);
  });
});

describe("propertyMatches", () => {
  const owner = { key: "Owner", equals: ["@acme/ds"] };

  it("matches an equals value", () => {
    expect(propertyMatches(owner, { Owner: { type: "string", value: "@acme/ds" } })).toBe(true);
  });
  it("doesn't match a different value", () => {
    expect(propertyMatches(owner, { Owner: { type: "string", value: "@other/ds" } })).toBe(false);
  });
  it("matches contains, case-insensitively", () => {
    expect(propertyMatches({ key: "Owner", contains: "ACME" }, { Owner: { type: "string", value: "@acme/ds" } })).toBe(true);
  });
  it("renders a non-string value as its text before comparing", () => {
    expect(propertyMatches({ key: "stable", equals: ["true"] }, { stable: { type: "boolean", value: true } })).toBe(true);
    expect(propertyMatches({ key: "count", contains: "4" }, { count: { type: "number", value: 42 } })).toBe(true);
  });
  it("ignores a metadata entry of a type this dashboard doesn't know yet", () => {
    expect(propertyMatches(owner, { Owner: { type: "future-kind" } as never })).toBe(false);
  });
  it("is vacuously false when metadata is undefined (this evaluation context has none to offer)", () => {
    expect(propertyMatches(owner, undefined)).toBe(false);
  });
  it("is vacuously false when the key is absent", () => {
    expect(propertyMatches(owner, { Other: { type: "string", value: "x" } })).toBe(false);
  });
  it("is vacuously false when the rule sets neither equals nor contains", () => {
    expect(propertyMatches({ key: "Owner" }, { Owner: { type: "string", value: "@acme/ds" } })).toBe(false);
  });
});

describe("tagRuleMatches: property part", () => {
  const ds = rule({ property: { key: "Owner", equals: ["@acme/ds"] } });

  it("matches by property alone, package and component both absent/failing", () => {
    expect(tagRuleMatches(ds, { packageName: "unrelated", metadata: { Owner: { type: "string", value: "@acme/ds" } } })).toBe(true);
  });
  it("doesn't apply when the target has no metadata to check", () => {
    expect(tagRuleMatches(ds, { packageName: null })).toBe(false);
  });
});

describe("tagRuleMatches: OR across parts", () => {
  // A rule with every part set: matches if ANY part matches, not only when all do.
  const any = rule({
    glob: ["@example/*"],
    component: { glob: [], exact: ["LegacyModal"] },
    property: { key: "Owner", equals: ["@acme/ds"] },
  });

  it("matches via the package part alone", () => {
    expect(tagRuleMatches(any, { packageName: "@example/ui", componentName: "Unrelated" })).toBe(true);
  });
  it("matches via the component part alone, package not matching", () => {
    expect(tagRuleMatches(any, { packageName: "other", componentName: "LegacyModal" })).toBe(true);
  });
  it("matches via the property part alone, package and component not matching", () => {
    expect(tagRuleMatches(any, { packageName: "other", componentName: "Unrelated", metadata: { Owner: { type: "string", value: "@acme/ds" } } })).toBe(true);
  });
  it("doesn't match when every part fails", () => {
    expect(tagRuleMatches(any, { packageName: "other", componentName: "Unrelated", metadata: { Owner: { type: "string", value: "@other/ds" } } })).toBe(false);
  });
  it("a package-only row (no component/property) matches exactly as it always has: a package hit, nothing else to check", () => {
    const packageOnly = rule({ glob: ["@example/*"] });
    expect(tagRuleMatches(packageOnly, { packageName: "@example/ui", componentName: "Anything", metadata: { Owner: { type: "string", value: "whatever" } } })).toBe(true);
    expect(tagRuleMatches(packageOnly, { packageName: "other", componentName: "Anything", metadata: { Owner: { type: "string", value: "whatever" } } })).toBe(false);
  });
});
