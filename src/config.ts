/**
 * Configuration loaded from environment variables.
 *
 * Required:
 *   AZDO_ORG_URL  - Base collection URL, e.g. https://devops.company.local/DefaultCollection
 *   AZDO_PAT      - Personal Access Token
 *
 * Optional:
 *   AZDO_PROJECT      - Default project name/id used when a tool call omits "project"
 *   AZDO_API_VERSION  - REST API version (default 7.0, the highest supported by Azure DevOps Server 2022.0.x; 7.1 only exists on Services / Server 2022.1)
 */
export interface Config {
  orgUrl: string;
  pat: string;
  defaultProject?: string;
  apiVersion: string;
}

export function loadConfig(): Config {
  const orgUrl = process.env.AZDO_ORG_URL?.trim();
  const pat = process.env.AZDO_PAT?.trim();

  if (!orgUrl) {
    throw new Error(
      "Missing AZDO_ORG_URL. Set it to your collection URL, e.g. https://devops.company.local/DefaultCollection"
    );
  }
  if (!pat) {
    throw new Error("Missing AZDO_PAT. Set it to your Azure DevOps Personal Access Token.");
  }

  return {
    // strip a trailing slash so we can join paths predictably
    orgUrl: orgUrl.replace(/\/+$/, ""),
    pat,
    defaultProject: process.env.AZDO_PROJECT?.trim() || undefined,
    apiVersion: process.env.AZDO_API_VERSION?.trim() || "7.0",
  };
}
