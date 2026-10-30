import { describe, expect, it } from "vitest";
import type { MetadataValue } from "../src/dto.js";
import { isKnownMetadataValue, knownMetadata, metadataValueLabel, metadataValueText } from "../src/metadata.js";

describe("metadataValueText", () => {
  it.each<[MetadataValue, string]>([
    [{ type: "string", value: "@acme/ds" }, "@acme/ds"],
    [{ type: "number", value: 3 }, "3"],
    [{ type: "boolean", value: true }, "true"],
    [{ type: "boolean", value: false }, "false"],
    [{ type: "date", value: "2026-01-15T00:00:00Z" }, "2026-01-15T00:00:00Z"],
  ])("renders %o as %s", (value, text) => {
    expect(metadataValueText(value)).toBe(text);
  });
});

describe("metadataValueLabel", () => {
  it("renders a date as a short calendar date, read in UTC so a viewer's local zone can't shift it a day", () => {
    // Midnight UTC: a browser west of UTC (e.g. America/*) would read this as the previous day
    // in its local zone, which is wrong for a value a hook set as a plain calendar date.
    expect(metadataValueLabel({ type: "date", value: "2026-01-15T00:00:00Z" })).toBe("Jan 15, 2026");
  });

  it("falls back to the raw string for a date value Date can't parse", () => {
    expect(metadataValueLabel({ type: "date", value: "not-a-date" })).toBe("not-a-date");
  });

  it("renders every other type the same as metadataValueText", () => {
    expect(metadataValueLabel({ type: "string", value: "x" })).toBe("x");
    expect(metadataValueLabel({ type: "number", value: 1 })).toBe("1");
    expect(metadataValueLabel({ type: "boolean", value: true })).toBe("true");
  });
});

describe("isKnownMetadataValue / knownMetadata", () => {
  it("accepts the four known types and rejects a future one this dashboard doesn't know", () => {
    expect(isKnownMetadataValue({ type: "string", value: "x" })).toBe(true);
    expect(isKnownMetadataValue({ type: "weight", value: "high" } as never)).toBe(false);
  });

  it("drops an unknown-typed entry, keeping the rest; undefined when metadata is absent or nothing survives", () => {
    const metadata = {
      Owner: { type: "string", value: "@acme/ds" },
      Priority: { type: "weight", value: "high" },
    } as never;
    expect(knownMetadata(metadata)).toEqual({ Owner: { type: "string", value: "@acme/ds" } });
    expect(knownMetadata({ Priority: { type: "weight", value: "high" } } as never)).toBeUndefined();
    expect(knownMetadata(undefined)).toBeUndefined();
  });
});
