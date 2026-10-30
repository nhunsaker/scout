import { stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  displayNameOf,
  METADATA_MAX_KEYS,
  metadataKeyPattern,
  type Component,
  type Identity,
  type MetadataValue,
  type Occurrence,
} from "@scoutui/scan-format";
import { CliError } from "../cli/parse.js";
import { errorMessage, errorStack } from "../util/errors.js";
import type { Logger } from "../util/log.js";
import type { AfterScan, HookComponent, HookUse, ScoutHookContext } from "./types.js";

export type RunHookOptions = {
  /** Absolute path to the hook script. */
  scriptPath: string;
  /** How the script is named in messages: relative to the current directory when that's shorter. */
  displayPath: string;
  context: ScoutHookContext;
  log: Logger;
};

const MAX_STRING_LENGTH = 256;

/** How many values `setMetadata` dropped, by the rule that dropped them. One summary line prints per nonzero rule. */
type DroppedCounts = { invalidKey: number; tooManyKeys: number; invalidType: number; stringTooLong: number };

function newCounts(): DroppedCounts {
  return { invalidKey: 0, tooManyKeys: 0, invalidType: 0, stringTooLong: 0 };
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const v of Object.values(value)) deepFreeze(v);
  return Object.freeze(value);
}

/** `value` coerced to a `MetadataValue`, or null (and a counted rule) when it isn't one `setMetadata` accepts. */
function coerceValue(value: unknown, counts: DroppedCounts): MetadataValue | null {
  if (typeof value === "string") {
    if (value.length > MAX_STRING_LENGTH) {
      counts.stringTooLong++;
      return null;
    }
    return { type: "string", value };
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      counts.invalidType++;
      return null;
    }
    return { type: "number", value };
  }
  if (typeof value === "boolean") return { type: "boolean", value };
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      counts.invalidType++;
      return null;
    }
    return { type: "date", value: value.toISOString() };
  }
  counts.invalidType++;
  return null;
}

/** The read-only view of `component` given to the hook, with a `setMetadata` that validates into `metadataByComponent`. */
function buildHookComponent(
  component: Component,
  usesByComponent: ReadonlyMap<string, HookUse[]>,
  metadataByComponent: Map<string, Record<string, MetadataValue>>,
  counts: DroppedCounts,
): HookComponent {
  const identity = deepFreeze(structuredClone(component.identity)) as Identity;
  const uses = Object.freeze((usesByComponent.get(component.id) ?? []).map((u) => Object.freeze({ ...u })));
  const declaredProps = component.declared ? Object.freeze(Object.keys(component.declared.props)) : undefined;

  const setMetadata = (key: string, value: string | number | boolean | Date): void => {
    if (typeof key !== "string" || !metadataKeyPattern.test(key)) {
      counts.invalidKey++;
      return;
    }
    const coerced = coerceValue(value, counts);
    if (coerced === null) return;
    let bucket = metadataByComponent.get(component.id);
    if (bucket === undefined) {
      bucket = {};
      metadataByComponent.set(component.id, bucket);
    }
    if (!(key in bucket) && Object.keys(bucket).length >= METADATA_MAX_KEYS) {
      counts.tooManyKeys++;
      return;
    }
    bucket[key] = coerced; // Last write wins.
  };

  const view: HookComponent = {
    id: component.id,
    name: displayNameOf(component),
    identity,
    version: component.version,
    uses,
    ...(component.framework !== undefined ? { framework: component.framework } : {}),
    ...(identity.kind === "repository-declaration" ? { filePath: identity.filePath } : {}),
    ...(identity.kind === "package-export" ? { packageName: identity.packageName } : {}),
    ...(declaredProps !== undefined ? { declaredProps } : {}),
    setMetadata,
  };

  return Object.freeze(view);
}

function resolveAfterScan(mod: Record<string, unknown>): AfterScan | null {
  // biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
  const named = mod["afterScan"];
  if (typeof named === "function") return named as AfterScan;
  // biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
  const def = mod["default"];
  if (def !== null && typeof def === "object") {
    // biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
    const method = (def as Record<string, unknown>)["afterScan"];
    if (typeof method === "function") return (method as AfterScan).bind(def);
  }
  return null;
}

function plural(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** One warning line per rule that dropped at least one value, printed once however many calls hit it. */
function warnDropped(counts: DroppedCounts, log: Logger): void {
  if (counts.invalidKey > 0) {
    log.warn(
      `${plural(counts.invalidKey, "custom property", "custom properties")} dropped: the key doesn't match the allowed pattern (start with a letter, then letters, digits, spaces, ".", "_" or "-", up to 64 characters).`,
    );
  }
  if (counts.stringTooLong > 0) {
    log.warn(`${plural(counts.stringTooLong, "custom property", "custom properties")} dropped: its string value is longer than 256 characters.`);
  }
  if (counts.invalidType > 0) {
    log.warn(`${plural(counts.invalidType, "custom property", "custom properties")} dropped: its value isn't a string, number, boolean or Date.`);
  }
  if (counts.tooManyKeys > 0) {
    log.warn(
      `${plural(counts.tooManyKeys, "custom property", "custom properties")} dropped: its component already has ${METADATA_MAX_KEYS} keys, the limit.`,
    );
  }
}

/**
 * Runs a `--hook-script`'s `afterScan` against the components this scan found, and writes what it sets through
 * `setMetadata` onto `components[*].metadata`. Called after `emitArtifact`, before `validateArtifact`: a hook the
 * user asked for that silently didn't run would produce a scan whose custom properties are wrong, not missing, so
 * a missing script, an unreadable export, or a script that throws fails the scan (`CliError`) instead.
 */
export async function runHook(components: Component[], occurrences: readonly Occurrence[], opts: RunHookOptions): Promise<void> {
  const { scriptPath, displayPath, context, log } = opts;

  try {
    await stat(scriptPath);
  } catch {
    throw new CliError(
      `Couldn't find the hook script ${displayPath}. Fix hookScript in your config, or the --hook-script path, and scan again.`,
    );
  }

  let mod: Record<string, unknown>;
  try {
    mod = (await import(pathToFileURL(scriptPath).href)) as Record<string, unknown>;
  } catch (err) {
    throw new CliError(`Couldn't load the hook script ${displayPath}: ${errorMessage(err)}.`, 2, { cause: err, detail: errorStack(err) });
  }

  const afterScan = resolveAfterScan(mod);
  if (afterScan === null) {
    throw new CliError(
      `The hook script ${displayPath} doesn't export afterScan. Export a default object with an afterScan(components, context) function, or export afterScan directly.`,
    );
  }

  const usesByComponent = new Map<string, HookUse[]>();
  for (const occurrence of occurrences) {
    if (occurrence.resolution.status !== "resolved") continue;
    const list = usesByComponent.get(occurrence.resolution.componentId) ?? [];
    list.push({ filePath: occurrence.filePath, line: occurrence.line, column: occurrence.column });
    usesByComponent.set(occurrence.resolution.componentId, list);
  }

  const counts = newCounts();
  const metadataByComponent = new Map<string, Record<string, MetadataValue>>();
  const hookComponents = components.map((component) => buildHookComponent(component, usesByComponent, metadataByComponent, counts));

  try {
    await afterScan(Object.freeze(hookComponents), context);
  } catch (err) {
    throw new CliError(`The hook script ${displayPath} failed: ${errorMessage(err)}.`, 2, { cause: err, detail: errorStack(err) });
  }

  warnDropped(counts, log);

  for (const component of components) {
    const metadata = metadataByComponent.get(component.id);
    if (metadata !== undefined && Object.keys(metadata).length > 0) component.metadata = metadata;
  }
}
