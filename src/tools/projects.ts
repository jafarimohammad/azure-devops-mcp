import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AzureDevOpsClient } from "../azureClient.js";
import { jsonResult, errorResult } from "./helpers.js";

/**
 * Registers project-discovery tools.
 * These are collection-level (no project segment in URL), so raw=true.
 */
export function registerProjectTools(server: McpServer, client: AzureDevOpsClient) {
  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description:
        "List all projects in the Azure DevOps collection. " +
        "Call this first when the project name is unknown or a lookup by name fails.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        const data = await client.request("_apis/projects", { raw: true });
        const projects = (data.value ?? []).map((p: any) => ({
          id: p.id,
          name: p.name,
          state: p.state,
          description: p.description,
        }));
        return jsonResult({ count: projects.length, projects });
      } catch (err) {
        return errorResult(err);
      }
    }
  );
}
