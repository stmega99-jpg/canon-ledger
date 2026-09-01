export type SiteToolsMode = "site-tools" | "no-site-tools";

export function detectSiteToolsMode(host: { modelContext?: { registerTool?: unknown } }): SiteToolsMode {
  return typeof host.modelContext?.registerTool === "function" ? "site-tools" : "no-site-tools";
}

export function environmentMessage(mode: SiteToolsMode): string {
  return mode === "site-tools"
    ? "Site tools available · page and agent share one ledger"
    : "No-Site-tools mode · the complete page workflow remains available";
}
