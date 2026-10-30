import { describe, it, expect, beforeAll } from "vitest";
import type { ScanArtifact, Component } from "@scoutui/scan-format";
import { scanFixture } from "../helpers/stage-fixture.js";

function byFilePath(scan: ScanArtifact, filePath: string): Component {
  const match = scan.components.find((c) => c.identity.kind === "repository-declaration" && c.identity.filePath === filePath);
  if (match === undefined) throw new Error(`No component declared at ${filePath}`);
  return match;
}

function byPackage(scan: ScanArtifact, packageName: string): Component {
  const match = scan.components.find((c) => c.identity.kind === "package-export" && c.identity.packageName === packageName);
  if (match === undefined) throw new Error(`No component exported by ${packageName}`);
  return match;
}

describe("integration: custom-properties, a --hook-script setting metadata on each component", () => {
  describe("the configured hook", () => {
    let scan: ScanArtifact;

    beforeAll(async () => {
      ({ artifact: scan } = await scanFixture("custom-properties"));
    }, 30_000);

    it("sets exact metadata on a local component with declared props and a stories sibling", () => {
      expect(byFilePath(scan, "src/components/Card.tsx").metadata).toEqual({
        owner: { type: "string", value: "design-systems" },
        hasStories: { type: "boolean", value: true },
        propCount: { type: "number", value: 2 },
        reviewed: { type: "date", value: "2026-01-15T00:00:00.000Z" },
      });
    });

    it("sets exact metadata on a local component with one declared prop and no stories", () => {
      expect(byFilePath(scan, "src/components/Field.tsx").metadata).toEqual({
        owner: { type: "string", value: "forms" },
        hasStories: { type: "boolean", value: false },
        propCount: { type: "number", value: 1 },
        reviewed: { type: "date", value: "2026-01-15T00:00:00.000Z" },
      });
    });

    it("sets metadata on a package component, leaving out fields that don't apply", () => {
      expect(byPackage(scan, "@example/web-button").metadata).toEqual({
        owner: { type: "string", value: "unassigned" },
        reviewed: { type: "date", value: "2026-01-15T00:00:00.000Z" },
      });
    });
  });

  it("--hook-script overrides hookScript in the config", async () => {
    const { artifact: scan } = await scanFixture("custom-properties", { args: ["--hook-script", "./scout.hook.cjs"] });
    for (const component of scan.components) {
      expect(component.metadata).toEqual({ owner: { type: "string", value: "cjs-owner" } });
    }
  }, 30_000);

  it("runs a CommonJS hook script", async () => {
    const { artifact: scan } = await scanFixture("custom-properties", { args: ["--hook-script", "./scout.hook.cjs"] });
    expect(byFilePath(scan, "src/components/Card.tsx").metadata).toEqual({ owner: { type: "string", value: "cjs-owner" } });
  }, 30_000);

  it("drops an invalid key, an oversized string, an unsupported value type and a 33rd key, with one warning per rule", async () => {
    const { artifact: scan, log } = await scanFixture("custom-properties", { args: ["--hook-script", "./scout.hook.invalid.mjs"] });
    const [first] = scan.components;
    expect(first?.metadata).toBeDefined();
    const metadata = first?.metadata ?? {};
    expect(metadata["1bad"]).toBeUndefined();
    expect(metadata.owner).toBeUndefined();
    expect(metadata.weird).toBeUndefined();
    expect(metadata.count).toBeUndefined();
    expect(metadata.when).toBeUndefined();
    expect(Object.keys(metadata).sort()).toEqual(Array.from({ length: 32 }, (_, i) => `key${i}`).sort());

    expect(log).toContain("1 custom property dropped: the key doesn't match the allowed pattern");
    expect(log).toContain("1 custom property dropped: its string value is longer than 256 characters.");
    expect(log).toContain("3 custom properties dropped: its value isn't a string, number, boolean or Date.");
    expect(log).toContain("8 custom properties dropped: its component already has 32 keys, the limit.");
  }, 30_000);

  it("fails the scan with the hook script's name and error when it throws", async () => {
    await expect(scanFixture("custom-properties", { args: ["--hook-script", "./scout.hook.throws.mjs"] })).rejects.toMatchObject({
      stderr: expect.stringContaining("scout.hook.throws.mjs"),
    });
    await expect(scanFixture("custom-properties", { args: ["--hook-script", "./scout.hook.throws.mjs"] })).rejects.toMatchObject({
      stderr: expect.stringContaining("boom: cannot compute owners"),
    });
  }, 30_000);

  it("fails the scan naming the script when it doesn't export afterScan", async () => {
    await expect(scanFixture("custom-properties", { args: ["--hook-script", "./scout.hook.no-export.mjs"] })).rejects.toMatchObject({
      stderr: expect.stringContaining("doesn't export afterScan"),
    });
  }, 30_000);

  it("fails the scan naming the script when it's missing", async () => {
    await expect(scanFixture("custom-properties", { args: ["--hook-script", "./does-not-exist.mjs"] })).rejects.toMatchObject({
      stderr: expect.stringContaining("Couldn't find the hook script"),
    });
  }, 30_000);
});
