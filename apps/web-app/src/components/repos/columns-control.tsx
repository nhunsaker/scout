"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * The components table's "Columns" control: ticks which of the offered metadata keys show as
 * extra columns. There is no general column picker yet, so this is capped to the keys `available`
 * already narrows to (the 3 most common; see `topMetadataKeys`).
 */
export function ColumnsControl({
  available,
  selected,
  onChange,
}: {
  available: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5 font-normal">
            Columns
            {selected.length > 0 ? (
              <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-xs font-semibold tabular-nums text-foreground">
                {selected.length}
              </span>
            ) : null}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-56 gap-0 p-0">
        <ul className="flex flex-col py-1">
          {available.map((key) => {
            const checked = selected.includes(key);
            return (
              <li key={key}>
                <button
                  type="button"
                  aria-pressed={checked}
                  onClick={() => onChange(checked ? selected.filter((k) => k !== key) : [...selected, key])}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                >
                  <Checkbox checked={checked} tabIndex={-1} aria-hidden className="pointer-events-none" />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{key}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
