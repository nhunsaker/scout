import { existsSync } from "node:fs";
import { join } from "node:path";

// Invented for this fixture: a tiny stand-in for parsing CODEOWNERS.
const OWNERS = {
  "src/components/Card.tsx": "design-systems",
  "src/components/Field.tsx": "forms",
};

/** @type {import("@scoutui/cli").ScoutHook} */
export default {
  afterScan(components, context) {
    for (const component of components) {
      const owner = component.filePath ? OWNERS[component.filePath] : undefined;
      component.setMetadata("owner", owner ?? "unassigned");
      if (component.filePath) {
        const storiesPath = join(context.repoRoot, component.filePath.replace(/\.tsx$/, ".stories.tsx"));
        component.setMetadata("hasStories", existsSync(storiesPath));
      }
      if (component.declaredProps) {
        component.setMetadata("propCount", component.declaredProps.length);
      }
      component.setMetadata("reviewed", new Date("2026-01-15T00:00:00.000Z"));
    }
  },
};
