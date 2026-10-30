"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { CohortSelector } from "@scoutui/web-shared";
import { cohortKey } from "@scoutui/web-shared/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { PropertyOption } from "@/lib/chart-builder-options";

type PropertySelector = Extract<CohortSelector, { kind: "property" }>;

/**
 * Adds a `property` series: pick a metadata key, then one of its values. Unlike the identity
 * search that adds components, packages and tags, there is nothing to type-ahead against until a
 * key is picked, so this is its own two-step popover rather than a row in that search.
 */
export function PropertySeriesPicker({
  options,
  added,
  onAdd,
}: {
  /** The metadata keys in scope, each with its distinct values. */
  options: PropertyOption[];
  /** `cohortKey` of every selector already in the chart, so an added value reads "Added". */
  added: ReadonlySet<string>;
  onAdd: (sel: PropertySelector) => void;
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const current = options.find((o) => o.key === key);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setKey(null);
      }}
    >
      <PopoverTrigger
        render={
          <Button type="button" variant="outline" size="sm" className="w-full gap-1.5 font-normal" disabled={options.length === 0}>
            <Plus aria-hidden className="size-3.5" />
            Add a property series
          </Button>
        }
      />
      <PopoverContent align="start" className="w-64 gap-0 p-0">
        {!current ? (
          <ul className="flex max-h-64 flex-col overflow-y-auto py-1">
            {options.length === 0 ? (
              <li className="px-3 py-2 text-xs text-muted-foreground">No properties scanned yet.</li>
            ) : (
              options.map((o) => (
                <li key={o.key}>
                  <button
                    type="button"
                    onClick={() => setKey(o.key)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                  >
                    <span className="min-w-0 flex-1 truncate font-mono text-xs">{o.key}</span>
                    <ChevronRight className="size-3.5 text-muted-foreground" />
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : (
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
              <span className="truncate font-mono text-xs text-muted-foreground">{key}</span>
            </div>
            <ul className="flex max-h-64 flex-col overflow-y-auto py-1">
              {current.values.map((value) => {
                const sel: PropertySelector = { kind: "property", key: key as string, value };
                const isAdded = added.has(cohortKey(sel));
                return (
                  <li key={value}>
                    <button
                      type="button"
                      aria-pressed={isAdded}
                      onClick={() => {
                        onAdd(sel);
                        setOpen(false);
                        setKey(null);
                      }}
                      className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                    >
                      <span className="min-w-0 flex-1 truncate">{value}</span>
                      {isAdded ? <span className="shrink-0 text-xs text-muted-foreground">Added</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
