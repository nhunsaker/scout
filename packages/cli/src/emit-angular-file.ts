import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, posix } from "node:path";
import type { FileBuilder, GraphBuilder, PropUsage } from "@scoutui/reference-graph";
import { canonicalTagName, isValidCustomElementName, MODULE_SCOPE } from "@scoutui/reference-graph";
import type { DeclaredPropApi } from "@scoutui/scan-format";
import type { AngularComponentDecl } from "./local-index/detect-angular.js";
import type { LocalDefinition } from "./local-index/types.js";

/** The parts of `@angular/compiler` the emitter reads. It is loaded from the scanned repo, never bundled. */
type AngularCompiler = {
  parseTemplate(template: string, templateUrl: string, options?: Record<string, unknown>): { nodes: unknown[]; errors?: unknown[] | null };
  CssSelector: { new (): CssSelectorLike; parse(selector: string): CssSelectorLike[] };
  SelectorMatcher: new () => {
    addSelectables(selectors: CssSelectorLike[], context: SelectorEntry): void;
    match(selector: CssSelectorLike, callback: (selector: CssSelectorLike, context: SelectorEntry) => void): boolean;
  };
};
type CssSelectorLike = { setElement(name: string): void; addAttribute(name: string, value: string): void; addClassName(name: string): void };

/** A component a selector names: where its class is declared. */
export type SelectorEntry = { filePath: string; exportName: string };

/** One parsed Angular component file waiting for every file's selectors to be known. */
export type PendingAngularFile = { graphKey: string; absPath: string; source: string; components: AngularComponentDecl[]; imports: ImportLike[] };
type ImportLike = { specifier: string; imported: string; local: string };

/** Loads `@angular/compiler` from the repo being scanned, or returns null when it isn't installed there. */
export function loadAngularCompiler(fromDir: string): AngularCompiler | null {
  try {
    const require = createRequire(join(fromDir, "package.json"));
    return require("@angular/compiler") as AngularCompiler;
  } catch {
    return null;
  }
}

/** Local definitions for the components a file declares, with each one's inputs as its declared props. */
export function angularDefinitions(components: AngularComponentDecl[], definitionPath: string): LocalDefinition[] {
  return components.map((c) => {
    const props: DeclaredPropApi["props"] = {};
    for (const input of c.inputs) props[input.alias ?? input.name] = input.required ? { required: true } : {};
    return {
      componentId: { kind: "angular-component", export: c.className, source: { type: "local", filePath: definitionPath } },
      exportName: c.className,
      isDefault: c.isDefault,
      detector: "angular-component",
      loc: { file: definitionPath, line: c.loc.line, column: c.loc.column },
      declared: { props, hasRest: false },
    } as LocalDefinition;
  });
}

/** Every selector the repo's components declare, for matching template elements. */
export function buildSelectorMatcher(compiler: AngularCompiler, files: PendingAngularFile[]) {
  const matcher = new compiler.SelectorMatcher();
  for (const file of files) {
    for (const c of file.components) {
      if (c.selector === undefined || !c.isExported) continue;
      matcher.addSelectables(compiler.CssSelector.parse(c.selector), { filePath: file.graphKey, exportName: c.className });
    }
  }
  return matcher;
}

type TmplNode = {
  name?: string;
  sourceSpan?: { start: { line: number; col: number } };
  attributes?: { name: string; value: string }[];
  inputs?: { name: string; type?: number; value?: { source?: string } }[];
  outputs?: { name: string }[];
  [key: string]: unknown;
};

const ANGULAR_BUILTIN_ELEMENTS = new Set(["ng-container", "ng-template", "ng-content"]);
const CHILD_KEYS = ["children", "branches", "cases", "empty", "placeholder", "loading", "error"];

/** Emit one Angular component file: its classes as components, each template's component elements as uses. */
export function emitAngularFile(opts: {
  graphBuilder: GraphBuilder;
  compiler: AngularCompiler;
  matcher: ReturnType<typeof buildSelectorMatcher>;
  file: PendingAngularFile;
  onTemplateError: (message: string) => void;
}): void {
  const { file, compiler } = opts;
  const fileBuilder = opts.graphBuilder.beginFile(file.graphKey, "angular");
  for (const spec of file.imports) {
    fileBuilder.addImport({ specifier: spec.specifier, imported: spec.imported, local: spec.local, loc: { line: 1, column: 1 } });
  }
  const importedLocalOf = new Map<string, ImportLike>();
  for (const spec of file.imports) importedLocalOf.set(`${spec.imported}`, spec);

  for (const c of file.components) {
    fileBuilder.addDeclaration({ symbol: c.className, value: { kind: "Function", returns: [{ kind: "JSX" }] }, loc: c.loc, isExported: c.isExported });
    if (c.isExported) fileBuilder.addExport(c.isDefault ? { kind: "default", local: c.className } : { kind: "named", exportedAs: c.className, local: c.className });
  }

  for (const c of file.components) {
    const template = readTemplate(c, file.absPath);
    if (template === undefined) continue;
    const parsed = compiler.parseTemplate(template.source, template.url, { preserveWhitespaces: false });
    for (const err of parsed.errors ?? []) opts.onTemplateError(String((err as { msg?: string }).msg ?? err));
    const owner = { symbol: c.className, scope: MODULE_SCOPE, memberChain: [], loc: c.loc, originFile: file.graphKey };
    const visit = (node: TmplNode): void => {
      if (typeof node.name === "string" && Array.isArray(node.attributes) && node.sourceSpan !== undefined) {
        emitElement(node, template.lineOffset, template.columnOffset);
      }
      for (const key of CHILD_KEYS) {
        const value = node[key];
        if (Array.isArray(value)) {
          for (const child of value) {
            if (child !== null && typeof child === "object") visit(child as TmplNode);
          }
        } else if (value !== null && typeof value === "object") {
          visit(value as TmplNode);
        }
      }
    };
    const emitElement = (el: TmplNode, lineOffset: number, columnOffset: number): void => {
      const tag = el.name as string;
      if (ANGULAR_BUILTIN_ELEMENTS.has(tag) || tag.startsWith(":")) return;
      const start = el.sourceSpan!.start;
      const line = start.line + lineOffset;
      const column = start.line === 0 ? start.col + columnOffset : start.col + 1;
      const { props, events } = readBindings(el);
      const css = new compiler.CssSelector();
      css.setElement(tag);
      for (const a of el.attributes ?? []) css.addAttribute(a.name, a.value);
      for (const i of el.inputs ?? []) css.addAttribute(i.name, "");
      const hits: SelectorEntry[] = [];
      opts.matcher.match(css, (_selector, entry) => {
        if (!hits.some((h) => h.filePath === entry.filePath && h.exportName === entry.exportName)) hits.push(entry);
      });
      const scoped = c.standalone && c.imports.length > 0 ? hits.filter((h) => c.imports.includes(h.exportName)) : hits;
      const hit = scoped.length === 1 ? scoped[0] : undefined;
      if (hit !== undefined) {
        const spec = hit.filePath === file.graphKey ? undefined : importedLocalOf.get(hit.exportName);
        const local = spec?.local ?? hit.exportName;
        let via = spec !== undefined ? { kind: "angular-template" as const, specifier: spec.specifier, import: spec.imported } : undefined;
        if (spec === undefined && hit.filePath !== file.graphKey) {
          const specifier = relativeSpecifier(file.graphKey, hit.filePath);
          fileBuilder.addImport({ specifier, imported: hit.exportName, local, loc: { line, column } });
          importedLocalOf.set(hit.exportName, { specifier, imported: hit.exportName, local });
          via = { kind: "angular-template", specifier, import: hit.exportName };
        }
        fileBuilder.addJsxUsage({ ref: { symbol: local, scope: MODULE_SCOPE, memberChain: [], loc: { line, column } }, loc: { line, column }, props, events });
        fileBuilder.setOwner(owner, via);
      } else if (isValidCustomElementName(canonicalTagName(tag))) {
        fileBuilder.addTagUsage({ tagName: tag, loc: { line, column }, props, events });
        fileBuilder.setTagOwner(owner);
      }
    };
    for (const node of parsed.nodes) visit(node as TmplNode);
  }
}

function readTemplate(c: AngularComponentDecl, absPath: string): { source: string; url: string; lineOffset: number; columnOffset: number } | undefined {
  if (c.template === undefined) return undefined;
  if (c.template.kind === "inline") {
    return { source: c.template.source, url: absPath, lineOffset: c.template.line, columnOffset: c.template.column };
  }
  const url = join(dirname(absPath), c.template.url);
  try {
    return { source: readFileSync(url, "utf8"), url, lineOffset: 1, columnOffset: 1 };
  } catch {
    return undefined;
  }
}

/** Props and events an element binds: static attributes, `[input]` and `[(model)]` bindings, `(output)` listeners. */
function readBindings(el: TmplNode): { props: PropUsage[]; events: string[] } {
  const props: PropUsage[] = [];
  for (const a of el.attributes ?? []) props.push({ name: a.name, tier: "written", value: a.value === "" ? true : a.value });
  for (const i of el.inputs ?? []) props.push({ name: i.name, tier: "dynamic" });
  const events = (el.outputs ?? []).map((o) => o.name);
  return { props, events };
}

function relativeSpecifier(fromGraphKey: string, toGraphKey: string): string {
  const rel = posix.relative(posix.dirname(fromGraphKey), toGraphKey).replace(/\.ts$/, "");
  return rel.startsWith(".") ? rel : `./${rel}`;
}

/** The value imports an oxc program declares, as the graph records them. Type-only imports are left out. */
export function importsOf(program: { body: unknown[] }): ImportLike[] {
  const out: ImportLike[] = [];
  for (const stmt of program.body as { type: string; importKind?: string; source?: { value: string }; specifiers?: { type: string; importKind?: string; imported?: { name?: string; value?: string }; local: { name: string } }[] }[]) {
    if (stmt.type !== "ImportDeclaration" || stmt.importKind === "type" || stmt.source === undefined) continue;
    for (const spec of stmt.specifiers ?? []) {
      if (spec.importKind === "type") continue;
      const imported =
        spec.type === "ImportDefaultSpecifier" ? "default"
        : spec.type === "ImportNamespaceSpecifier" ? "*"
        : (spec.imported?.name ?? spec.imported?.value ?? spec.local.name);
      out.push({ specifier: stmt.source.value, imported, local: spec.local.name });
    }
  }
  return out;
}
