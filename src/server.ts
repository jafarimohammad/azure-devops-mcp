import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AzureDevOpsClient } from "./azureClient.js";
import { registerProjectTools } from "./tools/projects.js";
import { registerRepoTools } from "./tools/repos.js";
import { registerPipelineTools } from "./tools/pipelines.js";

/**
 * Build a fully configured MCP server instance with all tools registered.
 * Kept as a factory so the HTTP transport can create a fresh server per
 * request (stateless mode) while stdio uses a single long-lived instance.
 */
export function createMcpServer(client: AzureDevOpsClient): McpServer {
  const server = new McpServer({
    name: "azure-devops-mcp",
    version: "0.1.0",
  });

  registerProjectTools(server, client);
  registerRepoTools(server, client);
  registerPipelineTools(server, client);

  return server;
}
