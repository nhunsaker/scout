import { describe, expect, test } from "vitest";
import { cloneSteps, scanArgs, scanConfig, scanEnv } from "./run-in-repo.js";
import type { ScanSpec, Target } from "./types.js";

const target: Target = {
  name: "t",
  repo: "owner/repo",
  install: "yarn install --immutable --mode=skip-build",
  scans: [],
};

const scan: ScanSpec = {
  cwd: "apps/web",
  repoId: "repo/web",
  include: ["src/**/*.ts"],
  tokenSecret: "SCOUTUI_TOKEN_REPO_WEB",
};

describe("cloneSteps", () => {
  test("clones the default branch with its full history", () => {
    expect(cloneSteps(target, "/w")).toEqual([
      ["git", "clone", "https://github.com/owner/repo.git", "/w"],
    ]);
  });
});

describe("scanConfig", () => {
  test("includes repoId + gitignore, omits resolution keys when absent", () => {
    expect(scanConfig(scan)).toEqual({
      include: ["src/**/*.ts"],
      repoId: "repo/web",
      gitignore: true,
    });
  });

  test("threads tsconfigPath + aliases when present", () => {
    const withAliases: ScanSpec = {
      ...scan,
      tsconfigPath: "./tsconfig.json",
      aliases: { "@/*": ["./src/*"] },
    };
    expect(scanConfig(withAliases)).toMatchObject({
      tsconfigPath: "./tsconfig.json",
      aliases: { "@/*": ["./src/*"] },
    });
  });
});

describe("scanArgs", () => {
  test("adds --host when host set", () => {
    expect(scanArgs("/c.json", "https://h")).toEqual([
      "scan", "--config", "/c.json", "--host", "https://h",
    ]);
  });

  test("omits --host when host undefined", () => {
    expect(scanArgs("/c.json")).toEqual([
      "scan", "--config", "/c.json",
    ]);
  });

  test("adds --rescan when asked to rescan", () => {
    expect(scanArgs("/c.json", undefined, true)).toEqual([
      "scan", "--config", "/c.json", "--rescan",
    ]);
  });
});

describe("scanEnv", () => {
  test("gives each scan its own repo's token as SCOUTUI_TOKEN", () => {
    const env = { SCOUTUI_TOKEN_REPO_WEB: "web-token", SCOUTUI_TOKEN_REPO_API: "api-token", PATH: "/bin" };
    expect(scanEnv({ ...scan, tokenSecret: "SCOUTUI_TOKEN_REPO_WEB" }, env)).toMatchObject({ SCOUTUI_TOKEN: "web-token", PATH: "/bin" });
    expect(scanEnv({ ...scan, tokenSecret: "SCOUTUI_TOKEN_REPO_MISSING" }, env)).toMatchObject({ SCOUTUI_TOKEN: "" });
  });
});
