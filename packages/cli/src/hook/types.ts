import type { Framework, Identity } from "@scoutui/scan-format";

/**
 * One place a `HookComponent` was rendered, repository-relative. Same coordinates as an occurrence in the scan
 * file, after resolution: only uses the scan matched to this component.
 */
export type HookUse = {
  readonly filePath: string;
  readonly line: number;
  readonly column: number;
  /** Owners of `filePath`, from the repository's CODEOWNERS file, in CODEOWNERS order. Absent when the file has no owner, or no CODEOWNERS file was read. */
  readonly codeOwners?: readonly string[];
};

/**
 * A read-only view of one component a scan found, given to a hook script's `afterScan`. Everything but
 * `setMetadata` is a snapshot: changing it has no effect, and there's no way to change it (the object is frozen).
 */
export type HookComponent = {
  readonly id: string;
  /** The name Scout shows for this component on the dashboard. */
  readonly name: string;
  /** A deep-frozen copy of the component's identity, as the scan file stores it. */
  readonly identity: Identity;
  /** Package exports and repository declarations only; absent on tags. */
  readonly framework?: Framework;
  /** Repository declarations only, repository-relative. */
  readonly filePath?: string;
  /** Package exports only. */
  readonly packageName?: string;
  readonly version: string | null;
  /** Repository declarations whose declaration site is readable: each declared prop's name, in source order. */
  readonly declaredProps?: readonly string[];
  /** Repository declarations only: owners of `filePath`, from the repository's CODEOWNERS file, in CODEOWNERS order. Absent when the file has no owner, or no CODEOWNERS file was read. Scout sets the "Code owners" custom property from this before `afterScan` runs; call `setMetadata("Code owners", ...)` to override it. */
  readonly codeOwners?: readonly string[];
  /** Every place this scan found the component rendered. */
  readonly uses: readonly HookUse[];
  /**
   * Sets a custom property on this component, shown on the dashboard. `value` is a string, a finite number, a
   * boolean or a `Date`. An invalid key or value, a string over 256 characters, or a 33rd key on one component is
   * dropped: `scout scan` warns once per rule, not once per call, and the scan still succeeds. Setting the same
   * key twice keeps the last value.
   */
  setMetadata(key: string, value: string | number | boolean | Date): void;
};

/** What `afterScan` is told about the scan its components came from. */
export type ScoutHookContext = {
  /** The repository name the scan uploads under. */
  repoId: string;
  /** The commit this scan covers. */
  commit: string;
  /** Absolute path to the folder holding scout.config.json. */
  configDir: string;
  /** Absolute path every component's `filePath` and `uses[].filePath` is relative to. */
  repoRoot: string;
};

/** A hook script's entry point: called once, after the scan, before the scan file is validated or uploaded. */
export type AfterScan = (components: readonly HookComponent[], context: ScoutHookContext) => void | Promise<void>;

/**
 * Shape a hook script's default export takes. Write `export default { afterScan(components, context) { ... } }`
 * (or `module.exports = { afterScan(components, context) { ... } }` for a CommonJS `.cjs` script), or export
 * `afterScan` directly as a named export.
 */
export type ScoutHook = { afterScan: AfterScan };
