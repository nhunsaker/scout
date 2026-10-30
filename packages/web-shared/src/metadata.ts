import type { Component } from "@scoutui/scan-format";
import type { ComponentMetadata, MetadataValue } from "./dto.js";

/** One entry of a `Component`'s metadata, as the scan file's open list carries it: a known
 *  `MetadataValue`, or a future type this dashboard doesn't know (only `type` is typed on that
 *  branch; see `openKindsOn` in `@scoutui/scan-format`). */
export type RawMetadataValue = NonNullable<Component["metadata"]>[string];

const KNOWN_TYPES: ReadonlySet<string> = new Set(["string", "number", "boolean", "date"]);

/** Whether `v` is one of the four known metadata types, not a future one this dashboard doesn't know. */
export function isKnownMetadataValue(v: RawMetadataValue): v is MetadataValue {
  return KNOWN_TYPES.has(v.type);
}

/**
 * A component's metadata, with any entry of a type this dashboard doesn't know left out: a CLI
 * ahead of it can write a future type, and the unrecognised value is dropped rather than guessed
 * at, so the rest of the component's metadata still reads. Undefined when the scan sets no
 * metadata, or none of it survives.
 */
export function knownMetadata(metadata: Component["metadata"]): ComponentMetadata | undefined {
  if (!metadata) return undefined;
  const entries = Object.entries(metadata).filter((entry): entry is [string, MetadataValue] => isKnownMetadataValue(entry[1]));
  return entries.length ? Object.fromEntries(entries) : undefined;
}

/**
 * A metadata value as plain text: what a property facet or a `property` cohort selector matches
 * against, and what most values display as. `date` keeps its ISO form here; `metadataValueLabel`
 * renders it as a short calendar date for display.
 */
export function metadataValueText(v: MetadataValue): string {
  switch (v.type) {
    case "string": return v.value;
    case "number": return String(v.value);
    case "boolean": return v.value ? "true" : "false";
    case "date": return v.value;
  }
}

/**
 * A metadata value as the dashboard shows it: `date` short (`Jan 1, 2026`), everything else as
 * `metadataValueText`. The short date reads its UTC calendar fields, not the viewer's local time:
 * a hook sets a calendar date (`Date#toISOString()`, midnight UTC), and converting to a browser's
 * local zone could shift it a day either way.
 */
export function metadataValueLabel(v: MetadataValue): string {
  if (v.type !== "date") return metadataValueText(v);
  const d = new Date(v.value);
  return Number.isNaN(d.getTime()) ? v.value : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}
