import { describe, it, expect, beforeAll } from "vitest";
import type { ScanArtifact, Component, Occurrence } from "@scoutui/scan-format";
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

/** Every occurrence whose `filePath` is `filePath`, in scan order. */
function occurrencesIn(scan: ScanArtifact, filePath: string): Occurrence[] {
  return scan.occurrences.filter((o) => o.filePath === filePath);
}

describe("integration: attribute-code-owners, a CODEOWNERS file read by default", () => {
  describe("the default config (codeOwners unset, .github/CODEOWNERS found)", () => {
    let scan: ScanArtifact;

    beforeAll(async () => {
      ({ artifact: scan } = await scanFixture("codeowners"));
    }, 30_000);

    it("sets 'Code owners' metadata on a component matched by the global *.tsx rule", () => {
      expect(byFilePath(scan, "src/design-system/Button.tsx").metadata).toEqual({
        "Code owners": { type: "string", value: "@example/design-system, @example/platform" },
      });
    });

    it("sets 'Code owners' metadata from a later, more specific directory rule, overriding the global default", () => {
      expect(byFilePath(scan, "src/checkout/Cart.tsx").metadata).toEqual({
        "Code owners": { type: "string", value: "@example/checkout" },
      });
      expect(byFilePath(scan, "src/search/SearchBox.tsx").metadata).toEqual({
        "Code owners": { type: "string", value: "@example/search" },
      });
    });

    it("sets no 'Code owners' metadata for a component in a folder an owner-less line clears", () => {
      expect(byFilePath(scan, "src/legacy/OldThing.tsx").metadata).toBeUndefined();
    });

    it("sets no 'Code owners' metadata on a package component: CODEOWNERS attributes repo files, not packages", () => {
      expect(byPackage(scan, "@example/web-button").metadata).toBeUndefined();
    });

    it("attributes each occurrence to the file the use is written in, independent of the component's own owner", () => {
      // Button is declared in design-system/, but rendered from checkout/, search/ and legacy/.
      const [inCheckout] = occurrencesIn(scan, "src/checkout/Cart.tsx");
      const [inSearch] = occurrencesIn(scan, "src/search/SearchBox.tsx");
      const [inLegacy] = occurrencesIn(scan, "src/legacy/OldThing.tsx");
      expect(inCheckout?.codeOwners).toEqual(["@example/checkout"]);
      expect(inSearch?.codeOwners).toEqual(["@example/search"]);
      expect(inLegacy?.codeOwners).toBeUndefined();
    });

    it("attributes occurrences written in App.tsx to the global rule, including a package component's use", () => {
      const appOccurrences = occurrencesIn(scan, "src/App.tsx");
      expect(appOccurrences.length).toBeGreaterThan(0);
      for (const occurrence of appOccurrences) {
        expect(occurrence.codeOwners).toEqual(["@example/design-system", "@example/platform"]);
      }
    });
  });

  it("codeOwners: false turns attribution off entirely", async () => {
    const { artifact: scan } = await scanFixture("codeowners", { args: ["--config", "./scout.config.off.json"] });
    expect(byFilePath(scan, "src/checkout/Cart.tsx").metadata).toBeUndefined();
    expect(scan.occurrences.every((o) => o.codeOwners === undefined)).toBe(true);
  }, 30_000);

  it("a string codeOwners reads that file instead of the default locations", async () => {
    const { artifact: scan } = await scanFixture("codeowners", { args: ["--config", "./scout.config.custom-path.json"] });
    expect(byFilePath(scan, "src/checkout/Cart.tsx").metadata).toEqual({
      "Code owners": { type: "string", value: "@example/from-custom-path" },
    });
  }, 30_000);

  it("a string codeOwners that doesn't exist warns and scans without attribution", async () => {
    const { artifact: scan, log } = await scanFixture("codeowners", { args: ["--config", "./scout.config.missing-path.json"] });
    expect(byFilePath(scan, "src/checkout/Cart.tsx").metadata).toBeUndefined();
    expect(log).toContain("./config/does-not-exist");
    expect(log).toContain("doesn't exist");
  }, 30_000);

  describe("with a hook script configured", () => {
    it("sets 'Code owners' before the hook runs, and leaves it alone when the hook sets an unrelated key", async () => {
      const { artifact: scan } = await scanFixture("codeowners", { args: ["--config", "./scout.config.hook.json"] });
      expect(byFilePath(scan, "src/design-system/Button.tsx").metadata).toEqual({
        "Code owners": { type: "string", value: "@example/design-system, @example/platform" },
        seenByHook: { type: "boolean", value: true },
      });
    }, 30_000);

    it("lets the hook override 'Code owners' with setMetadata", async () => {
      const { artifact: scan } = await scanFixture("codeowners", { args: ["--config", "./scout.config.hook.json"] });
      expect(byFilePath(scan, "src/checkout/Cart.tsx").metadata).toEqual({
        "Code owners": { type: "string", value: "@example/checkout-overridden" },
        seenByHook: { type: "boolean", value: true },
      });
    }, 30_000);
  });
});
