import { describe, it, expect, vi } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Component, Occurrence } from "@scoutui/scan-format";
import { runHook, } from "../../../src/hook/run-hook.js";
import { Logger } from "../../../src/util/log.js";
import { createColor } from "../../../src/util/style.js";
import type { HookComponent } from "../../../src/hook/types.js";

const plainColor = createColor({ isTTY: false, env: {} });

async function captureStderr(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const spy = vi.spyOn(process.stderr, "write").mockImplementation(((s: string) => {
    chunks.push(s);
    return true;
  }) as typeof process.stderr.write);
  try {
    await fn();
  } finally {
    spy.mockRestore();
  }
  return chunks.join("");
}

function repoComponent(id: string, filePath: string, declaredProps?: string[]): Component {
  return {
    id,
    identity: { kind: "repository-declaration", repoId: "r", filePath, exportName: "Thing" },
    framework: "react",
    stats: { occurrenceCount: 0, fileCount: 0 },
    usage: "none",
    props: {},
    composition: { rendersByCount: {}, renderedByCount: {}, isRootCount: 0, isLeafCount: 0 },
    version: null,
    ...(declaredProps ? { declared: { props: Object.fromEntries(declaredProps.map((p) => [p, {}])), hasRest: false } } : {}),
  } as Component;
}

function packageComponent(id: string): Component {
  return {
    id,
    identity: { kind: "package-export", packageName: "@example/thing", publicEntry: "", exportName: "Thing" },
    framework: "react",
    stats: { occurrenceCount: 0, fileCount: 0 },
    usage: "none",
    props: {},
    composition: { rendersByCount: {}, renderedByCount: {}, isRootCount: 0, isLeafCount: 0 },
    version: "1.0.0",
  } as Component;
}

function resolvedOccurrence(componentId: string, filePath: string, line: number): Occurrence {
  return {
    occurrenceId: `occ-${componentId}-${line}`,
    resolution: { status: "resolved", componentId },
    filePath,
    line,
    column: 1,
    credit: { kind: "render" },
    trace: [],
    props: {},
  } as Occurrence;
}

/** Writes `source` as a temporary hook script and returns its absolute path; the caller removes the folder. */
async function writeHookScript(source: string, ext = ".mjs"): Promise<{ path: string; dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), "cc-hook-"));
  const path = join(dir, `hook${ext}`);
  await writeFile(path, source, "utf8");
  return { path, dir };
}

const context = { repoId: "r", commit: "c", configDir: "/repo", repoRoot: "/repo" };

async function runWithScript(
  source: string,
  components: Component[],
  occurrences: Occurrence[] = [],
  opts: { codeOwnersLookup?: (filePath: string) => readonly string[] } = {},
): Promise<string> {
  const { path, dir } = await writeHookScript(source);
  const log = new Logger({ color: plainColor });
  try {
    return await captureStderr(async () => {
      await runHook(components, occurrences, { scriptPath: path, displayPath: "hook.mjs", context, log, ...opts });
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("runHook: setMetadata coercion and validation", () => {
  const rows: Array<[name: string, call: string, expected: unknown]> = [
    ["a string", `c.setMetadata("k", "hi")`, { type: "string", value: "hi" }],
    ["a finite number", `c.setMetadata("k", 3)`, { type: "number", value: 3 }],
    ["zero", `c.setMetadata("k", 0)`, { type: "number", value: 0 }],
    ["a boolean (false)", `c.setMetadata("k", false)`, { type: "boolean", value: false }],
    ["a Date", `c.setMetadata("k", new Date("2026-01-01T00:00:00.000Z"))`, { type: "date", value: "2026-01-01T00:00:00.000Z" }],
  ];

  it.each(rows)("accepts %s", async (_name, call, expected) => {
    const components = [repoComponent("c1", "src/A.tsx")];
    await runWithScript(`export default { afterScan(cs) { const c = cs[0]; ${call}; } };`, components);
    expect(components[0]?.metadata).toEqual({ k: expected });
  });

  const invalidRows: Array<[name: string, call: string, warningSubstring: string]> = [
    ["a key starting with a digit", `c.setMetadata("1bad", "x")`, "doesn't match the allowed pattern"],
    ["a key with an invalid character", `c.setMetadata("bad/key", "x")`, "doesn't match the allowed pattern"],
    ["a string over 256 characters", `c.setMetadata("k", "x".repeat(257))`, "longer than 256 characters"],
    ["NaN", `c.setMetadata("k", Number.NaN)`, "isn't a string, number, boolean or Date"],
    ["Infinity", `c.setMetadata("k", Number.POSITIVE_INFINITY)`, "isn't a string, number, boolean or Date"],
    ["an invalid Date", `c.setMetadata("k", new Date("not a date"))`, "isn't a string, number, boolean or Date"],
    ["an object", `c.setMetadata("k", { nope: true })`, "isn't a string, number, boolean or Date"],
    ["undefined", `c.setMetadata("k", undefined)`, "isn't a string, number, boolean or Date"],
    ["null", `c.setMetadata("k", null)`, "isn't a string, number, boolean or Date"],
  ];

  it.each(invalidRows)("drops %s, with one warning", async (_name, call, warningSubstring) => {
    const components = [repoComponent("c1", "src/A.tsx")];
    const stderr = await runWithScript(`export default { afterScan(cs) { const c = cs[0]; ${call}; } };`, components);
    expect(components[0]?.metadata).toBeUndefined();
    expect(stderr).toContain(warningSubstring);
  });

  it("keeps the last value when the same key is set twice", async () => {
    const components = [repoComponent("c1", "src/A.tsx")];
    await runWithScript(`export default { afterScan(cs) { cs[0].setMetadata("k", "first"); cs[0].setMetadata("k", "second"); } };`, components);
    expect(components[0]?.metadata).toEqual({ k: { type: "string", value: "second" } });
  });

  it("drops a 33rd distinct key but still updates one of the first 32", async () => {
    const components = [repoComponent("c1", "src/A.tsx")];
    const stderr = await runWithScript(
      `export default { afterScan(cs) {
        const c = cs[0];
        for (let i = 0; i < 32; i++) c.setMetadata("k" + i, i);
        c.setMetadata("k33", 33);
        c.setMetadata("k0", 999);
      } };`,
      components,
    );
    const metadata = components[0]?.metadata ?? {};
    expect(Object.keys(metadata)).toHaveLength(32);
    expect(metadata.k33).toBeUndefined();
    expect(metadata.k0).toEqual({ type: "number", value: 999 });
    expect(stderr).toContain("1 custom property dropped: its component already has 32 keys, the limit.");
  });

  it("doesn't set metadata at all when every call is dropped", async () => {
    const components = [repoComponent("c1", "src/A.tsx")];
    await runWithScript(`export default { afterScan(cs) { cs[0].setMetadata("1bad", "x"); } };`, components);
    expect(components[0]?.metadata).toBeUndefined();
  });
});

describe("runHook: the HookComponent view", () => {
  it("exposes filePath and declaredProps for a repository declaration, and the uses this scan resolved to it", async () => {
    const components = [repoComponent("c1", "src/A.tsx", ["label", "onClick"])];
    const occurrences = [resolvedOccurrence("c1", "src/App.tsx", 10), resolvedOccurrence("c1", "src/Other.tsx", 20)];
    await runWithScript(
      "export default { afterScan(cs) { globalThis.__seen = cs[0]; } };",
      components,
      occurrences,
    );
    const seen = (globalThis as { __seen?: HookComponent }).__seen;
    expect(seen?.filePath).toBe("src/A.tsx");
    expect(seen?.packageName).toBeUndefined();
    expect(seen?.declaredProps).toEqual(["label", "onClick"]);
    expect(seen?.uses).toEqual([
      { filePath: "src/App.tsx", line: 10, column: 1 },
      { filePath: "src/Other.tsx", line: 20, column: 1 },
    ]);
  });

  it("exposes packageName and no declaredProps for a package export, and leaves out unresolved uses", async () => {
    const components = [packageComponent("c1")];
    const occurrences = [
      resolvedOccurrence("c1", "src/App.tsx", 5),
      { ...resolvedOccurrence("c1", "src/App.tsx", 6), resolution: { status: "unresolved", reason: { kind: "module-not-found" } } } as Occurrence,
    ];
    await runWithScript("export default { afterScan(cs) { globalThis.__seen2 = cs[0]; } };", components, occurrences);
    const seen = (globalThis as { __seen2?: HookComponent }).__seen2;
    expect(seen?.packageName).toBe("@example/thing");
    expect(seen?.filePath).toBeUndefined();
    expect(seen?.declaredProps).toBeUndefined();
    expect(seen?.uses).toEqual([{ filePath: "src/App.tsx", line: 5, column: 1 }]);
  });

  it("is frozen: assigning to a field the hook reads throws", async () => {
    const components = [repoComponent("c1", "src/A.tsx")];
    await runWithScript(
      `export default { afterScan(cs) {
        let threw = false;
        try { cs[0].version = "9.9.9"; } catch (e) { threw = true; }
        globalThis.__frozenThrew = threw;
      } };`,
      components,
    );
    expect((globalThis as { __frozenThrew?: boolean }).__frozenThrew).toBe(true);
  });

  it("deep-freezes identity: assigning into it throws", async () => {
    const components = [repoComponent("c1", "src/A.tsx")];
    await runWithScript(
      `export default { afterScan(cs) {
        let threw = false;
        try { cs[0].identity.filePath = "elsewhere.tsx"; } catch (e) { threw = true; }
        globalThis.__identityFrozenThrew = threw;
      } };`,
      components,
    );
    expect((globalThis as { __identityFrozenThrew?: boolean }).__identityFrozenThrew).toBe(true);
  });
});

describe("runHook: codeOwnersLookup", () => {
  const lookup = (filePath: string): readonly string[] =>
    filePath === "src/A.tsx" ? ["@owner-a"] : filePath === "src/App.tsx" ? ["@owner-app"] : [];

  it("exposes codeOwners on a repository declaration's own file, from codeOwnersLookup", async () => {
    const components = [repoComponent("c1", "src/A.tsx")];
    await runWithScript("export default { afterScan(cs) { globalThis.__seen3 = cs[0]; } };", components, [], {
      codeOwnersLookup: lookup,
    });
    const seen = (globalThis as { __seen3?: HookComponent }).__seen3;
    expect(seen?.codeOwners).toEqual(["@owner-a"]);
  });

  it("leaves codeOwners absent when codeOwnersLookup returns no owners for the file", async () => {
    const components = [repoComponent("c1", "src/Unowned.tsx")];
    await runWithScript("export default { afterScan(cs) { globalThis.__seen4 = cs[0]; } };", components, [], {
      codeOwnersLookup: lookup,
    });
    const seen = (globalThis as { __seen4?: HookComponent }).__seen4;
    expect(seen?.codeOwners).toBeUndefined();
  });

  it("leaves codeOwners absent on a package export, which has no filePath to look up", async () => {
    const components = [packageComponent("c1")];
    await runWithScript("export default { afterScan(cs) { globalThis.__seen5 = cs[0]; } };", components, [], {
      codeOwnersLookup: lookup,
    });
    const seen = (globalThis as { __seen5?: HookComponent }).__seen5;
    expect(seen?.codeOwners).toBeUndefined();
  });

  it("carries codeOwners from each occurrence onto its HookUse", async () => {
    const components = [repoComponent("c1", "src/A.tsx")];
    const occurrences = [
      { ...resolvedOccurrence("c1", "src/App.tsx", 10), codeOwners: ["@owner-app"] },
      resolvedOccurrence("c1", "src/Other.tsx", 20), // no CODEOWNERS owner for this file
    ];
    await runWithScript("export default { afterScan(cs) { globalThis.__seen6 = cs[0]; } };", components, occurrences, {
      codeOwnersLookup: lookup,
    });
    const seen = (globalThis as { __seen6?: HookComponent }).__seen6;
    expect(seen?.uses).toEqual([
      { filePath: "src/App.tsx", line: 10, column: 1, codeOwners: ["@owner-app"] },
      { filePath: "src/Other.tsx", line: 20, column: 1 },
    ]);
  });
});

describe("runHook: metadata already set before afterScan runs", () => {
  it("is left alone when the hook sets an unrelated key", async () => {
    const component = repoComponent("c1", "src/A.tsx");
    component.metadata = { "Code owners": { type: "string", value: "@owner-a" } };
    const components = [component];
    await runWithScript(`export default { afterScan(cs) { cs[0].setMetadata("hasStories", true); } };`, components);
    expect(components[0]?.metadata).toEqual({
      "Code owners": { type: "string", value: "@owner-a" },
      hasStories: { type: "boolean", value: true },
    });
  });

  it("is overridden when the hook sets that same key", async () => {
    const component = repoComponent("c1", "src/A.tsx");
    component.metadata = { "Code owners": { type: "string", value: "@owner-a" } };
    const components = [component];
    await runWithScript(`export default { afterScan(cs) { cs[0].setMetadata("Code owners", "@overridden"); } };`, components);
    expect(components[0]?.metadata).toEqual({ "Code owners": { type: "string", value: "@overridden" } });
  });

  it("counts pre-existing keys against the 32-key limit", async () => {
    const component = repoComponent("c1", "src/A.tsx");
    component.metadata = { "Code owners": { type: "string", value: "@owner-a" } };
    const components = [component];
    const stderr = await runWithScript(
      `export default { afterScan(cs) {
        const c = cs[0];
        for (let i = 0; i < 32; i++) c.setMetadata("k" + i, i);
      } };`,
      components,
    );
    const metadata = components[0]?.metadata ?? {};
    // "Code owners" plus 31 of the 32 new keys fill the budget; the 32nd new key is dropped.
    expect(Object.keys(metadata)).toHaveLength(32);
    expect(metadata["Code owners"]).toEqual({ type: "string", value: "@owner-a" });
    expect(metadata.k31).toBeUndefined();
    expect(stderr).toContain("1 custom property dropped: its component already has 32 keys, the limit.");
  });
});
