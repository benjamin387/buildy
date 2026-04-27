import { redirect } from "next/navigation";

/**
 * Legacy automation settings page (deprecated).
 *
 * The platform uses the newer AI Control Center (`/ai-control-center`) backed by
 * `AIAutomationSetting` + `AIActionLog`.
 */
export default async function AutomationSettingsPage() {
  redirect("/ai-control-center");
}

