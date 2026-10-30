"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, GitCompareArrows, ListX } from "lucide-react";
import { plural } from "@scoutui/web-shared/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { movementParts } from "@/lib/scan-diff-view";
import { DeprecatedFilterChip } from "@/components/deprecated-filter-chip";
import { FacetedFilterBar, tagFacet, tagPills, type Facet, type FilterPill } from "@/components/faceted-filter-bar";
import { StatusFilterChip } from "@/components/status-filter-chip";
import { cn } from "@/lib/utils";
import {
  emptyFacets,
  isFiltering,
  kindLabel,
  ORIGIN_DESCRIPTION,
  ORIGIN_LABEL,
  togglePropertyValue,
  type FacetOptions,
  type FacetState,
  type KindValue,
  type OccurrenceOp,
  type OriginValue,
  type PropertyFacetOption,
} from "@/lib/component-facets";

export function FilterBar({
  facets,
  onChange,
  options,
  usedIn,
  packageFolders,
  resultCount,
  total,
  deprecatedTotal,
  diffShown,
  filtering,
  canEdit,
}: {
  facets: FacetState;
  onChange: (next: FacetState) => void;
  options: FacetOptions;
  /** Each package the rows are used in, with its count under the other filters. */
  usedIn: { value: string; count: number }[];
  /** Each package's folder, by package name. */
  packageFolders: ReadonlyMap<string, string>;
  resultCount: number;
  total: number;
  deprecatedTotal: number;
  /** While the changed view is active: its unfiltered size (`total`) and the
   *  shown rows' breakdown; null outside it. Unfiltered the count reads
   *  `29 changes`; narrowed by any other filter, `12 of 29 changes · 2 removed ·
   *  10 changed`, zero parts omitted. It replaces `N of M components` because
   *  removed rows come from the previous scan. */
  diffShown: { total: number; added: number; removed: number; changed: number } | null;
  /** Whether anything besides `changed` and `usedIn` narrows the rows, i.e.
   *  whether the count reads `N of M`. `facets`, and every write through
   *  `onChange`, keep the real state. */
  filtering: boolean;
  canEdit: boolean;
}) {
  const diffParts = diffShown === null ? [] : movementParts(diffShown);
  const inkCount = (n: number) => <span className="font-medium text-foreground">{n.toLocaleString()}</span>;
  const setTags = (tags: string[]) => onChange({ ...facets, tags });
  const othersOn = diffShown === null && isFiltering({ ...facets, deprecated: null, changed: false, usedIn: null });

  // Deprecation and "since previous scan" are statuses, not facets: each is a
  // StatusFilterChip beside the Filter menu.
  const facetList: Facet[] = [
    {
      key: "origin",
      label: "Origin",
      values: (["external", "local"] as const).map((o) => ({
        value: o,
        label: ORIGIN_LABEL[o],
        description: ORIGIN_DESCRIPTION[o],
        count: options.origin[o],
      })),
      selected: facets.origin ? [facets.origin] : [],
      onSelect: ([origin]) => onChange({ ...facets, origin: (origin as OriginValue | undefined) ?? null }),
      single: true,
    },
    {
      key: "kind",
      label: "Type",
      values: options.kinds.map((k) => ({ value: k.value, label: kindLabel(k.value), count: k.count })),
      selected: facets.kinds,
      onSelect: (kinds) => onChange({ ...facets, kinds: kinds as KindValue[] }),
      dropsWithOneValue: true,
    },
    {
      key: "package",
      label: "Package",
      values: options.packages,
      selected: facets.packages,
      onSelect: (packages) => onChange({ ...facets, packages }),
      mono: true,
      searchPlaceholder: "Search packages…",
      empty: "No packages.",
    },
    {
      key: "used-in",
      label: "Used in",
      values: usedIn.map((u) => {
        const description = folderLabel(packageFolders.get(u.value));
        return { ...u, ...(description !== undefined ? { description } : {}) };
      }),
      selected: facets.usedIn ? [facets.usedIn] : [],
      onSelect: ([pkg]) => onChange({ ...facets, usedIn: pkg ?? null }),
      single: true,
      mono: true,
      searchPlaceholder: "Search packages…",
      dropsWithOneValue: true,
    },
    tagFacet(options.tags, facets.tags, setTags, canEdit),
    {
      key: "occurrences",
      label: "Uses",
      picker: <OccurrencePicker facets={facets} onChange={onChange} />,
      active: facets.occurrences ? 1 : 0,
    },
    {
      key: "property",
      label: "Properties",
      picker: <PropertyFacetPicker options={options.properties} facets={facets} onChange={onChange} />,
      active: Object.values(facets.properties).reduce((n, values) => n + values.length, 0),
    },
  ];

  const pills: FilterPill[] = [
    ...(facets.origin
      ? [{ key: "origin", field: "origin", value: ORIGIN_LABEL[facets.origin].toLowerCase(), onRemove: () => onChange({ ...facets, origin: null }) }]
      : []),
    ...facets.kinds.map((k) => ({
      key: `kind:${k}`,
      field: "type",
      value: kindLabel(k),
      onRemove: () => onChange({ ...facets, kinds: facets.kinds.filter((x) => x !== k) }),
    })),
    ...facets.packages.map((p) => ({
      key: `pkg:${p}`,
      field: "package",
      value: p,
      mono: true,
      onRemove: () => onChange({ ...facets, packages: facets.packages.filter((x) => x !== p) }),
    })),
    ...(facets.usedIn
      ? [{ key: "used-in", field: "used in", value: facets.usedIn, mono: true, onRemove: () => onChange({ ...facets, usedIn: null }) }]
      : []),
    ...tagPills(options.tags, facets.tags, setTags),
    ...Object.entries(facets.properties).flatMap(([key, values]) =>
      values.map((value) => ({
        key: `prop:${key}:${value}`,
        field: key,
        value: options.properties.find((o) => o.key === key)?.values.find((v) => v.value === value)?.label ?? value,
        mono: true,
        onRemove: () => onChange({ ...facets, properties: togglePropertyValue(facets.properties, key, value) }),
      })),
    ),
    // Only `deprecated: false` gets a pill: `true` shows as the chip's pressed
    // state, while `false` arrives only from a pasted URL and needs a way to be
    // removed. `changed` needs none: its chip shows `true`, and `false` is the
    // empty state.
    ...(facets.deprecated === false
      ? [{ key: "deprecated", field: "deprecated", value: "no", onRemove: () => onChange({ ...facets, deprecated: null }) }]
      : []),
    // Only `hasUnusedProps: false` gets a pill: see the comment on `deprecated` above.
    ...(facets.hasUnusedProps === false
      ? [{ key: "unused-props", field: "unused props", value: "no", onRemove: () => onChange({ ...facets, hasUnusedProps: null }) }]
      : []),
    ...(facets.occurrences
      ? [
          {
            key: "occurrences",
            field: "uses",
            value: `${occurrenceSymbol(facets.occurrences.op)} ${facets.occurrences.value.toLocaleString()}`,
            onRemove: () => onChange({ ...facets, occurrences: null }),
          },
        ]
      : []),
  ];

  return (
    <FacetedFilterBar
      search={{
        value: facets.text,
        onChange: (text) => onChange({ ...facets, text }),
        label: "Search components by name",
        placeholder: `Search ${plural(total, "component")} by name…`,
      }}
      chips={
        <>
          {options.deprecatedMax > 0 || facets.deprecated === true ? (
            <DeprecatedFilterChip
              count={options.deprecatedCount}
              maxCount={options.deprecatedMax}
              total={othersOn ? deprecatedTotal : undefined}
              active={facets.deprecated === true}
              onToggle={() => onChange({ ...facets, deprecated: facets.deprecated === true ? null : true })}
            />
          ) : null}
          {/* There is no "only without unused props" control either: see DeprecatedFilterChip. */}
          {options.hasUnusedPropsMax > 0 || facets.hasUnusedProps === true ? (
            <StatusFilterChip
              icon={ListX}
              tone="warn"
              label="unused props"
              count={options.hasUnusedPropsCount}
              maxCount={options.hasUnusedPropsMax}
              active={facets.hasUnusedProps === true}
              onToggle={() => onChange({ ...facets, hasUnusedProps: facets.hasUnusedProps === true ? null : true })}
            />
          ) : null}
          {/* Labelled "since previous scan", not "changed": its count is every
              row the changed view shows, while the masthead's "N changed" counts
              only occurrence moves. */}
          {options.changedCount !== null ? (
            <StatusFilterChip
              icon={GitCompareArrows}
              tone="neutral"
              label="since previous scan"
              count={options.changedCount}
              maxCount={options.changedMax}
              active={facets.changed}
              onToggle={() => onChange({ ...facets, changed: !facets.changed })}
            />
          ) : null}
        </>
      }
      facets={facetList}
      count={
        diffShown !== null && filtering ? (
          <>
            {inkCount(resultCount)} of {changesLabel(diffShown.total)}
            {diffParts.map((p) => (
              <span key={p.word}>
                {" · "}
                {inkCount(p.n)} {p.word}
              </span>
            ))}
          </>
        ) : diffShown !== null ? (
          <>{changesLabel(diffShown.total)}</>
        ) : filtering ? (
          <>
            {inkCount(resultCount)} of {total.toLocaleString()} components
          </>
        ) : (
          <>{total.toLocaleString()} components</>
        )
      }
      pills={pills}
      onClearAll={() => onChange(emptyFacets())}
    />
  );
}

function folderLabel(folder: string | undefined): string | undefined {
  return folder === undefined ? undefined : folder === "" ? "repo root" : folder;
}

function changesLabel(n: number): string {
  return `${n.toLocaleString()} ${n === 1 ? "change" : "changes"}`;
}

function occurrenceSymbol(op: OccurrenceOp): string {
  return op === ">=" ? "≥" : op === "<=" ? "≤" : op;
}

const OCCURRENCE_PRESETS: { label: string; op: OccurrenceOp; value: number }[] = [
  { label: "≥ 10", op: ">=", value: 10 },
  { label: "≥ 50", op: ">=", value: 50 },
  { label: "≥ 100", op: ">=", value: 100 },
  { label: "≥ 500", op: ">=", value: 500 },
];

function OccurrencePicker({ facets, onChange }: { facets: FacetState; onChange: (next: FacetState) => void }) {
  const cur = facets.occurrences;
  const [op, setOp] = useState<OccurrenceOp>(cur?.op ?? ">=");
  const [value, setValue] = useState<string>(cur ? String(cur.value) : "");

  function apply(nextOp: OccurrenceOp, nextValue: string) {
    const n = Number(nextValue);
    if (nextValue.trim() === "" || Number.isNaN(n)) onChange({ ...facets, occurrences: null });
    else onChange({ ...facets, occurrences: { op: nextOp, value: n } });
  }

  return (
    <div className="flex flex-col gap-2 p-2.5">
      <div className="flex flex-wrap gap-1">
        {OCCURRENCE_PRESETS.map((p) => {
          const active = cur?.op === p.op && cur?.value === p.value;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setOp(p.op);
                setValue(String(p.value));
                onChange({ ...facets, occurrences: active ? null : { op: p.op, value: p.value } });
              }}
              className={cn(
                "inline-flex h-6 items-center rounded-md border px-2 text-xs tabular-nums transition-colors",
                active ? "selected font-medium text-foreground" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-1.5">
        <div className="inline-flex rounded-md border border-border p-0.5">
          {(["≥", "≤"] as const).map((sym) => {
            const symOp: OccurrenceOp = sym === "≥" ? ">=" : "<=";
            const active = op === symOp;
            return (
              <button
                key={sym}
                type="button"
                onClick={() => {
                  setOp(symOp);
                  apply(symOp, value);
                }}
                className={cn("inline-flex size-5 items-center justify-center rounded text-xs transition-colors", active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {sym}
              </button>
            );
          })}
        </div>
        <Input
          inputMode="numeric"
          value={value}
          onChange={(e) => {
            const v = e.target.value.replace(/[^\d]/g, "");
            setValue(v);
            apply(op, v);
          }}
          placeholder="count"
          className="h-7 flex-1 text-base tabular-nums sm:text-xs"
        />
      </div>
    </div>
  );
}

/**
 * The Properties facet's picker: a key list, then (drilling in like the Filter menu itself) that
 * key's values as ticked chips. Only keys the rows in scope carry are offered (see `facetOptions`).
 * Values within a key are OR'd; picking a second key ANDs it in.
 */
function PropertyFacetPicker({
  options,
  facets,
  onChange,
}: {
  options: PropertyFacetOption[];
  facets: FacetState;
  onChange: (next: FacetState) => void;
}) {
  const [key, setKey] = useState<string | null>(null);
  const current = options.find((o) => o.key === key);

  if (!current) {
    return (
      <ul className="flex max-h-64 flex-col overflow-y-auto py-1">
        {options.length === 0 ? (
          <li className="px-3 py-2 text-xs text-muted-foreground">No properties on these components.</li>
        ) : (
          options.map((o) => {
            const n = (facets.properties[o.key] ?? []).length;
            return (
              <li key={o.key}>
                <button
                  type="button"
                  onClick={() => setKey(o.key)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                >
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{o.key}</span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    {n > 0 ? <span className="text-xs tabular-nums text-foreground">{n}</span> : null}
                    <ChevronRight className="size-3.5" />
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    );
  }

  const selected = facets.properties[current.key] ?? [];
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1.5 border-b px-2 py-1.5">
        <button
          type="button"
          onClick={() => setKey(null)}
          aria-label="Back to properties"
          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="truncate font-mono text-xs text-muted-foreground">{current.key}</span>
      </div>
      <ul className="flex max-h-64 flex-col overflow-y-auto py-1">
        {current.values.length === 0 ? (
          <li className="px-3 py-2 text-xs text-muted-foreground">None match the other filters.</li>
        ) : (
          current.values.map((v) => {
            const checked = selected.includes(v.value);
            return (
              <li key={v.value}>
                <button
                  type="button"
                  aria-pressed={checked}
                  onClick={() => onChange({ ...facets, properties: togglePropertyValue(facets.properties, current.key, v.value) })}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                >
                  <Checkbox checked={checked} tabIndex={-1} aria-hidden className="pointer-events-none" />
                  <span className="min-w-0 flex-1 truncate">{v.label}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{v.count.toLocaleString()}</span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
