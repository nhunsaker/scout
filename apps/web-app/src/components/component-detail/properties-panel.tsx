import { Fragment } from "react";
import type { ComponentMetadata } from "@scoutui/web-shared";
import { metadataValueLabel } from "@scoutui/web-shared/client";

/**
 * The component detail page's Properties section: the key → value metadata a CLI hook script set
 * on this component (see the CLI's custom-properties guide), sorted by key. Rendered between the
 * header and the tabs; absent entirely when the scan carries no metadata for this component.
 */
export function PropertiesPanel({ metadata }: { metadata: ComponentMetadata | undefined }) {
  const entries = Object.entries(metadata ?? {}).sort((a, b) => a[0].localeCompare(b[0]));
  if (entries.length === 0) return null;
  return (
    <section aria-labelledby="properties-heading" className="panel p-4">
      <h2 id="properties-heading" className="text-label text-muted-foreground">
        Properties
      </h2>
      <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 gap-y-1.5 text-sm">
        {entries.map(([key, value]) => (
          <Fragment key={key}>
            <dt className="truncate font-mono text-xs text-muted-foreground" title={key}>
              {key}
            </dt>
            <dd className="truncate">{metadataValueLabel(value)}</dd>
          </Fragment>
        ))}
      </dl>
    </section>
  );
}
