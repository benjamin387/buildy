import "server-only";

import { runGebizRssImport } from "@/lib/gebiz/importer";

/**
 * Compatibility wrapper for GeBIZ import.
 *
 * The canonical implementation lives in `lib/gebiz/importer.ts` to preserve
 * existing routes and UI actions. This file exposes a stable import surface.
 */
export async function importGebizOpportunities(params?: {
  dryRun?: boolean;
  limitPerSource?: number;
  sourceId?: string;
  includeDisabled?: boolean;
}) {
  return await runGebizRssImport(params);
}
