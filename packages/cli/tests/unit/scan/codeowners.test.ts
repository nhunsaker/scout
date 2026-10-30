import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCodeOwnersMatcher,
  loadCodeOwners,
  parseCodeOwners,
  type CodeOwnersRule,
} from "../../../src/scan/codeowners.js";

describe("parseCodeOwners", () => {
  it("skips blank lines and comments", () => {
    expect(parseCodeOwners("\n# a comment\n\n*.js @js-owner\n")).toEqual([{ pattern: "*.js", owners: ["@js-owner"] }]);
  });

  it("skips GitLab section headers, required or optional", () => {
    expect(
      parseCodeOwners(["[Frontend]", "*.tsx @frontend", "^[Optional Backend]", "*.go @backend"].join("\n")),
    ).toEqual([
      { pattern: "*.tsx", owners: ["@frontend"] },
      { pattern: "*.go", owners: ["@backend"] },
    ]);
  });

  it("unescapes a leading \\# into a literal # pattern, instead of treating the line as a comment", () => {
    expect(parseCodeOwners("\\#weird-dir/ @owner")).toEqual([{ pattern: "#weird-dir/", owners: ["@owner"] }]);
  });

  it("keeps a pattern with no owners as a rule with an empty owners list", () => {
    expect(parseCodeOwners("src/generated/")).toEqual([{ pattern: "src/generated/", owners: [] }]);
  });

  it("reads several owners on one line, in order", () => {
    expect(parseCodeOwners("* @owner-one @owner-two")).toEqual([{ pattern: "*", owners: ["@owner-one", "@owner-two"] }]);
  });

  it("collapses runs of whitespace between the pattern and its owners", () => {
    expect(parseCodeOwners("*.js    @js-owner")).toEqual([{ pattern: "*.js", owners: ["@js-owner"] }]);
  });
});

describe("buildCodeOwnersMatcher: GitHub's documented pattern examples", () => {
  const rows: Array<[name: string, pattern: string, path: string, expected: readonly string[]]> = [
    ["* matches a root file", "*", "a.js", ["@owner"]],
    ["* matches a nested file", "*", "dir/a.js", ["@owner"]],
    ["*.js matches a root .js file", "*.js", "a.js", ["@owner"]],
    ["*.js matches a nested .js file", "*.js", "dir/a.js", ["@owner"]],
    ["*.js doesn't match a .ts file", "*.js", "a.ts", []],
    ["/build/logs/ owns a file directly inside", "/build/logs/", "build/logs/error.log", ["@owner"]],
    ["/build/logs/ owns a file nested deeper inside", "/build/logs/", "build/logs/2026/error.log", ["@owner"]],
    ["/build/logs/ is anchored: a nested build/logs doesn't count", "/build/logs/", "app/build/logs/error.log", []],
    ["docs/* matches a file directly inside docs", "docs/*", "docs/getting-started.md", ["@owner"]],
    ["docs/* doesn't reach a file nested deeper (GitHub's own example)", "docs/*", "docs/build-app/troubleshooting.md", []],
    ["apps/ owns a file inside an apps folder at the root", "apps/", "apps/web/index.ts", ["@owner"]],
    ["apps/ owns a file inside an apps folder anywhere (unanchored)", "apps/", "some/path/apps/index.ts", ["@owner"]],
    ["**/logs matches a root file named logs", "**/logs", "logs", ["@owner"]],
    ["**/logs matches a nested file named logs", "**/logs", "a/b/logs", ["@owner"]],
    ["**/logs doesn't match a file inside a logs file (no cascade without a trailing /)", "**/logs", "a/b/logs/c.txt", []],
    ["/docs/ owns a file directly inside the root docs folder", "/docs/", "docs/x.md", ["@owner"]],
    ["/docs/ is anchored: a nested docs folder doesn't count", "/docs/", "other/docs/x.md", []],
  ];

  it.each(rows)("%s", (_name, pattern, path, expected) => {
    const matcher = buildCodeOwnersMatcher([{ pattern, owners: expected.length > 0 ? ["@owner"] : [] }]);
    expect(matcher.ownersFor(path)).toEqual(expected);
  });
});

describe("buildCodeOwnersMatcher: ordering", () => {
  const rules: CodeOwnersRule[] = [
    { pattern: "*", owners: ["@global-owner"] },
    { pattern: "*.tsx", owners: ["@design-system"] },
    { pattern: "src/checkout/", owners: ["@checkout"] },
    { pattern: "src/checkout/legacy/", owners: [] },
  ];
  const matcher = buildCodeOwnersMatcher(rules);

  it("the last matching rule decides, not the first or the most specific by some other measure", () => {
    expect(matcher.ownersFor("src/App.tsx")).toEqual(["@design-system"]);
  });

  it("a later, more specific directory rule overrides an earlier wildcard", () => {
    expect(matcher.ownersFor("src/checkout/Cart.tsx")).toEqual(["@checkout"]);
  });

  it("an owner-less line clears ownership for paths it matches, even though an earlier line claimed them", () => {
    expect(matcher.ownersFor("src/checkout/legacy/Old.tsx")).toEqual([]);
  });

  it("a path no rule matches is unowned", () => {
    const narrow = buildCodeOwnersMatcher([{ pattern: "*.tsx", owners: ["@design-system"] }]);
    expect(narrow.ownersFor("README.md")).toEqual([]);
  });
});

describe("loadCodeOwners", () => {
  async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(join(tmpdir(), "cc-codeowners-"));
    try {
      return await fn(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  it("setting false turns attribution off without reading any file", async () => {
    await withTempDir(async (dir) => {
      await writeFile(join(dir, "CODEOWNERS"), "* @owner\n");
      const matcher = await loadCodeOwners({ repoRoot: dir, configDir: dir, setting: false, warn: () => {} });
      expect(matcher).toBeNull();
    });
  });

  it("true (and no setting) prefers .github/CODEOWNERS over CODEOWNERS over docs/CODEOWNERS", async () => {
    await withTempDir(async (dir) => {
      await mkdir(join(dir, ".github"), { recursive: true });
      await mkdir(join(dir, "docs"), { recursive: true });
      await writeFile(join(dir, ".github", "CODEOWNERS"), "* @github-location\n");
      await writeFile(join(dir, "CODEOWNERS"), "* @root-location\n");
      await writeFile(join(dir, "docs", "CODEOWNERS"), "* @docs-location\n");
      const matcher = await loadCodeOwners({ repoRoot: dir, configDir: dir, setting: undefined, warn: () => {} });
      expect(matcher?.ownersFor("src/App.tsx")).toEqual(["@github-location"]);
    });
  });

  it("falls back to CODEOWNERS when .github/CODEOWNERS is absent", async () => {
    await withTempDir(async (dir) => {
      await writeFile(join(dir, "CODEOWNERS"), "* @root-location\n");
      const matcher = await loadCodeOwners({ repoRoot: dir, configDir: dir, setting: true, warn: () => {} });
      expect(matcher?.ownersFor("src/App.tsx")).toEqual(["@root-location"]);
    });
  });

  it("falls back to docs/CODEOWNERS when neither default root location exists", async () => {
    await withTempDir(async (dir) => {
      await mkdir(join(dir, "docs"), { recursive: true });
      await writeFile(join(dir, "docs", "CODEOWNERS"), "* @docs-location\n");
      const matcher = await loadCodeOwners({ repoRoot: dir, configDir: dir, setting: true, warn: () => {} });
      expect(matcher?.ownersFor("src/App.tsx")).toEqual(["@docs-location"]);
    });
  });

  it("no default location found is silent: null, no warning", async () => {
    await withTempDir(async (dir) => {
      const warnings: string[] = [];
      const matcher = await loadCodeOwners({ repoRoot: dir, configDir: dir, setting: undefined, warn: (m) => warnings.push(m) });
      expect(matcher).toBeNull();
      expect(warnings).toEqual([]);
    });
  });

  it("a string setting reads that file, relative to configDir", async () => {
    await withTempDir(async (dir) => {
      await mkdir(join(dir, "config"), { recursive: true });
      await writeFile(join(dir, "config", "OWNERS"), "* @custom-location\n");
      const matcher = await loadCodeOwners({ repoRoot: dir, configDir: dir, setting: "./config/OWNERS", warn: () => {} });
      expect(matcher?.ownersFor("src/App.tsx")).toEqual(["@custom-location"]);
    });
  });

  it("a string setting that doesn't exist warns once and returns null", async () => {
    await withTempDir(async (dir) => {
      const warnings: string[] = [];
      const matcher = await loadCodeOwners({
        repoRoot: dir,
        configDir: dir,
        setting: "./missing/OWNERS",
        warn: (m) => warnings.push(m),
      });
      expect(matcher).toBeNull();
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("./missing/OWNERS");
      expect(warnings[0]).toContain("doesn't exist");
    });
  });
});
