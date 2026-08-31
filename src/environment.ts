export type SiteToolsMode = "site-tools" | "no-site-tools";

export function detectSiteToolsMode(host: { modelContext?: unknown }): SiteToolsMode {
  return host.modelContext === undefined ? "no-site-tools" : "site-tools";
}

export function environmentMessage(mode: SiteToolsMode): string {
  return mode === "site-tools"
    ? "Site tools available · page and agent share one ledger"
    : "No-Site-tools mode · the complete page workflow remains available";
}
