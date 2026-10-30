import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import picomatch from "picomatch";

/** Where GitHub looks for a CODEOWNERS file, in order, relative to the repository root. */
export const CODEOWNERS_DEFAULT_PATHS: readonly string[] = [".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS"];

/** One rule from a CODEOWNERS file, in file order. `owners` is `[]` for a pattern with no owners, which clears ownership when it's the last rule to match a path. */
export type CodeOwnersRule = { readonly pattern: string; readonly owners: readonly string[] };

export type CodeOwnersMatcher = {
  /** `path`'s owners, in CODEOWNERS order, from the last rule to match it; `[]` when nothing matches, or the last match is an owner-less line. */
  ownersFor(path: string): readonly string[];
};

/** Whether a trimmed line is a GitLab CODEOWNERS section header (`[Section]`, `[Section][2]`, `^[Optional Section]`). Scout skips these like a comment: it reads ownership rules, not GitLab's per-section approval counts. */
function isSectionHeader(line: string): boolean {
  return line.startsWith("[") || line.startsWith("^[");
}

/**
 * Parses a CODEOWNERS file's rules, in file order. Blank lines, `#` comments
 * and GitLab section headers are skipped. A leading `\#` escapes a pattern
 * that would otherwise read as a comment, unescaping to a literal `#`. A
 * line with a pattern and no owners is kept as a rule with `owners: []`: a
 * valid way to clear ownership for paths a later line doesn't re-claim.
 */
export function parseCodeOwners(content: string): CodeOwnersRule[] {
  const rules: CodeOwnersRule[] = [];
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#") || isSectionHeader(line)) continue;
    const [rawPattern, ...owners] = line.split(/\s+/);
    if (rawPattern === undefined || rawPattern === "") continue;
    rules.push({ pattern: rawPattern.replace(/\\#/g, "#"), owners });
  }
  return rules;
}

/**
 * The glob `picomatch` matches a repository-relative path against, and
 * whether `pattern` is directory-only (a trailing `/`).
 *
 * Follows GitHub's CODEOWNERS pattern rules, the same ones `.gitignore`
 * uses: a pattern is anchored to the repository root when it starts with
 * `/`, or has a `/` anywhere but a lone trailing one; otherwise it matches
 * at any depth. A directory-only pattern (trailing `/`) owns the directory
 * and everything nested below it. Any other pattern matches a file by its
 * exact position only — a wildcard never crosses a `/` unless written as
 * `**`, which is why GitHub's own `docs/*` example doesn't reach
 * `docs/build-app/troubleshooting.md`.
 */
function toGlob(pattern: string): { glob: string; dirOnly: boolean } {
  const dirOnly = pattern.endsWith("/");
  const core = dirOnly ? pattern.slice(0, -1) : pattern;
  const leadingSlash = core.startsWith("/");
  const body = leadingSlash ? core.slice(1) : core;
  const anchored = leadingSlash || body.includes("/");
  return { glob: anchored ? body : `**/${body}`, dirOnly };
}

/** The matcher for one CODEOWNERS pattern: true when a repository-relative path falls under it. */
function compileRule(pattern: string): (path: string) => boolean {
  const { glob, dirOnly } = toGlob(pattern);
  return picomatch(dirOnly ? `${glob}/**` : glob, { dot: true });
}

/** Builds a matcher from a CODEOWNERS file's already-parsed rules, in file order (the last matching rule decides). */
export function buildCodeOwnersMatcher(rules: readonly CodeOwnersRule[]): CodeOwnersMatcher {
  const compiled = rules.map((rule) => ({ owners: rule.owners, test: compileRule(rule.pattern) }));
  return {
    ownersFor(path: string): readonly string[] {
      for (let i = compiled.length - 1; i >= 0; i--) {
        const rule = compiled[i];
        if (rule?.test(path)) return rule.owners;
      }
      return [];
    },
  };
}

async function readFileOrNull(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

/** `scout.config.json`'s `codeOwners`: `true` (the default) reads the first default location that exists, `false` turns attribution off, and a string is a path to the file, relative to the config's folder. */
export type CodeOwnersSetting = boolean | string;

/**
 * Loads the CODEOWNERS matcher for a scan.
 *
 * `setting === false` turns attribution off, returning null. A string
 * setting reads that file, resolved against `configDir`; when it doesn't
 * exist, `warn` is called once and attribution is off for this scan. `true`
 * or `undefined` (the default) reads the first of GitHub's default
 * locations (`CODEOWNERS_DEFAULT_PATHS`) that exists under `repoRoot`,
 * silently scanning without attribution when none does.
 */
export async function loadCodeOwners(opts: {
  repoRoot: string;
  configDir: string;
  setting: CodeOwnersSetting | undefined;
  warn: (message: string) => void;
}): Promise<CodeOwnersMatcher | null> {
  const { repoRoot, configDir, setting, warn } = opts;
  if (setting === false) return null;
  if (typeof setting === "string") {
    const path = resolve(configDir, setting);
    const content = await readFileOrNull(path);
    if (content === null) {
      warn(`"codeOwners" in scout.config.json points at ${setting}, which doesn't exist. Owners won't be attributed this scan.`);
      return null;
    }
    return buildCodeOwnersMatcher(parseCodeOwners(content));
  }
  for (const candidate of CODEOWNERS_DEFAULT_PATHS) {
    const content = await readFileOrNull(resolve(repoRoot, candidate));
    if (content !== null) return buildCodeOwnersMatcher(parseCodeOwners(content));
  }
  return null;
}
